import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 3001);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 2000);
const AUTH_DIR = path.resolve(process.env.AUTH_DIR || './data/whatsapp-auth');
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WORKER_SECRET) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and WORKER_SECRET are required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const sockets = new Map<string, ReturnType<typeof makeWASocket>>();

async function logConnection(connectionId: string, organizationId: string, event: string, details: Record<string, unknown> = {}) {
  await supabase.from('connection_logs').insert({
    organization_id: organizationId,
    whatsapp_connection_id: connectionId,
    event,
    details,
  });
}

async function updateConnection(connectionId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('whatsapp_connections').update(patch).eq('id', connectionId);
  if (error) logger.error({ error, connectionId }, 'connection update failed');
}

function auth(req: Request, res: Response): boolean {
  const header = req.header('authorization') || '';
  if (header !== `Bearer ${WORKER_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function removeAuth(connectionId: string) {
  await fs.rm(path.join(AUTH_DIR, connectionId), { recursive: true, force: true });
}

async function startConnection(connectionId: string) {
  if (sockets.has(connectionId)) return;

  const { data: connection, error } = await supabase
    .from('whatsapp_connections')
    .select('id, organization_id, name, provider')
    .eq('id', connectionId)
    .maybeSingle();

  if (error || !connection) throw new Error('WhatsApp connection not found');
  if (connection.provider !== 'baileys') throw new Error('Connection provider is not baileys');

  await fs.mkdir(path.join(AUTH_DIR, connectionId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(path.join(AUTH_DIR, connectionId));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] as [number, number, number] }));

  await updateConnection(connectionId, { status: 'connecting', qr_data: null });

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sockets.set(connectionId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection: stateConnection, lastDisconnect, qr } = update;

    try {
      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 512 });
        await updateConnection(connectionId, {
          status: 'qr_required',
          qr_data: dataUrl,
          last_seen_at: new Date().toISOString(),
        });
        await logConnection(connectionId, connection.organization_id, 'qr_generated');
      }

      if (stateConnection === 'open') {
        const phone = sock.user?.id?.split(':')[0]?.split('@')[0] || null;
        await updateConnection(connectionId, {
          status: 'connected',
          phone_number: phone ? `+${phone}` : null,
          qr_data: null,
          last_connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          provider_session_id: connectionId,
        });
        await logConnection(connectionId, connection.organization_id, 'connected', { phone_number: phone });
        logger.info({ connectionId, phone }, 'WhatsApp connected');
      }

      if (stateConnection === 'close') {
        sockets.delete(connectionId);
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        await updateConnection(connectionId, {
          status: loggedOut ? 'disconnected' : 'error',
          qr_data: null,
          last_seen_at: new Date().toISOString(),
        });
        await logConnection(connectionId, connection.organization_id, loggedOut ? 'logout' : 'disconnected', {
          status_code: code ?? null,
        });
        if (loggedOut) {
          await removeAuth(connectionId);
        } else {
          setTimeout(() => startConnection(connectionId).catch((e) => logger.error({ e, connectionId }, 'reconnect failed')), 3000);
        }
      }
    } catch (e) {
      logger.error({ e, connectionId }, 'connection.update handler failed');
      await updateConnection(connectionId, { status: 'error' });
      await logConnection(connectionId, connection.organization_id, 'worker_error', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  sock.ev.on('messages.upsert', async () => {
    await updateConnection(connectionId, { last_seen_at: new Date().toISOString() });
  });
}

async function disconnectConnection(connectionId: string, logout: boolean) {
  const sock = sockets.get(connectionId);
  sockets.delete(connectionId);
  if (sock) {
    if (logout) await sock.logout().catch(() => undefined);
    else sock.ws.close();
  }
  if (logout) await removeAuth(connectionId);
  const { data: connection } = await supabase.from('whatsapp_connections').select('organization_id').eq('id', connectionId).maybeSingle();
  if (connection) await logConnection(connectionId, connection.organization_id, logout ? 'logout' : 'disconnected');
  await updateConnection(connectionId, {
    status: 'disconnected',
    phone_number: logout ? null : undefined,
    provider_session_id: logout ? null : undefined,
    qr_data: null,
  });
}

async function sendCloudMessage(job: any, connection: any) {
  const { data: credentials, error } = await supabase
    .from('whatsapp_cloud_credentials')
    .select('*')
    .eq('connection_id', connection.id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load WhatsApp Cloud API credentials: ${error.message}`);
  if (!credentials?.phone_number_id || !credentials?.access_token) {
    throw new Error('WhatsApp Cloud API credentials are incomplete');
  }

  const version = credentials.api_version || 'v23.0';
  const endpoint = `https://graph.facebook.com/${version}/${credentials.phone_number_id}/messages`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${credentials.access_token}`,
  };
  const to = job.recipient.replace(/^\\+/, '');

  const payload = job.document_url
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: {
          link: job.document_url,
          filename: job.document_name || 'document.pdf',
          caption: job.message || undefined,
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: true, body: job.message || '' },
      };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `Cloud API HTTP ${response.status}`);
  }

  return data;
}

async function claimAndSend() {
  const { data: jobs, error } = await supabase.rpc('claim_message_queue', { p_limit: 10 });
  if (error) {
    logger.error({ error }, 'queue claim failed');
    return;
  }

  for (const job of jobs || []) {
    try {
      const { data: connection } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('id', job.whatsapp_connection_id)
        .maybeSingle();

      if (!connection) throw new Error('WhatsApp connection not found');

      let result: any;
      let provider = connection.provider;

      if (connection.provider === 'whatsapp_cloud') {
        result = await sendCloudMessage(job, connection);
      } else {
        const sock = sockets.get(job.whatsapp_connection_id);
        if (!sock) throw new Error('WhatsApp Baileys connection is not online');

        const jid = `${job.recipient.replace(/^\+/, '')}@s.whatsapp.net`;
        if (job.document_url) {
          const response = await fetch(job.document_url);
          if (!response.ok) throw new Error(`Document download failed: HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          result = await sock.sendMessage(jid, {
            document: bytes,
            mimetype: 'application/pdf',
            fileName: job.document_name || 'document.pdf',
            caption: job.message || undefined,
          });
        } else {
          result = await sock.sendMessage(jid, { text: job.message || '' });
        }
      }

      const providerMessageId =
        result?.messages?.[0]?.id ||
        result?.messages?.[0]?.message_id ||
        result?.key?.id ||
        null;

      await supabase.from('message_queue').update({
        status: 'sent',
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', job.id);

      await supabase.from('message_logs').insert({
        organization_id: job.organization_id,
        message_id: job.id,
        status: 'sent',
        provider,
        provider_message_id: providerMessageId,
        attempts: job.attempts,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const finalFailure = job.attempts >= job.max_attempts;
      await supabase.from('message_queue').update({
        status: finalFailure ? 'failed' : 'queued',
        last_error: message,
        failed_at: finalFailure ? new Date().toISOString() : null,
        next_retry_at: finalFailure ? null : new Date(Date.now() + Math.min(60000, 2000 * 2 ** Math.max(0, job.attempts - 1))).toISOString(),
      }).eq('id', job.id);

      await supabase.from('message_logs').insert({
        organization_id: job.organization_id,
        message_id: job.id,
        status: 'failed',
        provider: 'whatsapp',
        error: message,
        attempts: job.attempts,
      });
    }
  }
}
const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'whatsapp-erp-gateway-worker',
  connections: sockets.size,
  timestamp: new Date().toISOString(),
}));

app.post('/connection/start', async (req, res) => {
  if (!auth(req, res)) return;
  try {
    await startConnection(req.body.connection_id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post('/connection/reconnect', async (req, res) => {
  if (!auth(req, res)) return;
  try {
    await disconnectConnection(req.body.connection_id, false);
    await startConnection(req.body.connection_id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post('/connection/disconnect', async (req, res) => {
  if (!auth(req, res)) return;
  try {
    await disconnectConnection(req.body.connection_id, false);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post('/connection/logout', async (req, res) => {
  if (!auth(req, res)) return;
  try {
    await disconnectConnection(req.body.connection_id, true);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.listen(PORT, async () => {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  logger.info({ PORT }, 'WhatsApp worker started');
  const syncConnections = async () => {
    const { data: connections, error } = await supabase
      .from('whatsapp_connections')
      .select('id, status, worker_enabled, force_logout')
      .eq('provider', 'baileys');

    if (error) {
      logger.error({ error: error.message }, 'connection sync query failed');
      return;
    }

    logger.info({ count: connections?.length || 0 }, 'connection sync');

    for (const connection of connections || []) {
      if (connection.force_logout) {
        await disconnectConnection(connection.id, true).catch((e) => logger.error({ e, connectionId: connection.id }, 'connection logout failed'));
        await supabase.from('whatsapp_connections').update({ force_logout: false, worker_enabled: false }).eq('id', connection.id);
        continue;
      }
      if (connection.worker_enabled && !sockets.has(connection.id)) {
        startConnection(connection.id).catch((e) => logger.error({ e, connectionId: connection.id }, 'connection start failed'));
      }
      if (!connection.worker_enabled && sockets.has(connection.id)) {
        disconnectConnection(connection.id, false).catch((e) => logger.error({ e, connectionId: connection.id }, 'connection stop failed'));
      }
    }
  };

  setInterval(() => {
    syncConnections().catch((e) => logger.error({ e }, 'connection sync failed'));
    claimAndSend().catch((e) => logger.error({ e }, 'queue worker error'));
  }, POLL_INTERVAL_MS);

  await syncConnections();
});
