import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

function verifySignature(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const normalized = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (normalized.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
}

function findString(value: any, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    if (typeof value[key] === 'string' || typeof value[key] === 'number') return String(value[key]);
  }
  for (const child of Object.values(value)) {
    const found = findString(child, keys);
    if (found) return found;
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { connectionId: string } },
) {
  const raw = await req.text();

  const { data: connection } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('id, organization_id, provider')
    .eq('id', params.connectionId)
    .maybeSingle();

  if (!connection || connection.provider !== 'wasender') {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  const { data: credentials } = await supabaseAdmin
    .from('wasender_credentials')
    .select('webhook_secret')
    .eq('connection_id', connection.id)
    .maybeSingle();

  if (!credentials?.webhook_secret || !verifySignature(raw, req.headers.get('x-webhook-signature'), credentials.webhook_secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = String(payload?.event || 'wasender.webhook');
  await supabaseAdmin.from('webhook_logs').insert({
    organization_id: connection.organization_id,
    event,
    payload,
    response_status: 200,
    response_body: 'received',
  });

  const eventLower = event.toLowerCase();
  const providerStatus = findString(payload, ['status', 'sessionStatus']);
  if (eventLower.includes('session.status') || eventLower.includes('session_status')) {
    const normalized = String(providerStatus || '').toLowerCase();
    const status =
      normalized === 'connected' ? 'connected' :
      normalized === 'need_scan' || normalized === 'need_qr' || normalized === 'qr_required' ? 'qr_required' :
      normalized === 'connecting' ? 'connecting' :
      'disconnected';

    await supabaseAdmin.from('whatsapp_connections').update({
      status,
      last_seen_at: new Date().toISOString(),
      qr_data: status === 'connected' ? null : undefined,
      last_connected_at: status === 'connected' ? new Date().toISOString() : undefined,
    }).eq('id', connection.id);
  }

  if (eventLower.includes('message') && (eventLower.includes('status') || eventLower.includes('receipt') || eventLower.includes('update'))) {
    const providerMessageId = findString(payload, ['msgId', 'messageId', 'id']);
    const delivery = String(findString(payload, ['status', 'messageStatus']) || '').toLowerCase();

    if (providerMessageId) {
      const status =
        delivery === 'read' || delivery === 'delivered' ? 'delivered' :
        delivery === 'failed' || delivery === 'error' ? 'failed' :
        'sent';

      await supabaseAdmin.from('message_queue').update({
        status,
        delivered_at: status === 'delivered' ? new Date().toISOString() : undefined,
        last_error: status === 'failed' ? String(findString(payload, ['error', 'message']) || 'WasenderAPI delivery failed') : undefined,
      }).eq('provider_message_id', providerMessageId).eq('whatsapp_connection_id', connection.id);
    }
  }

  return NextResponse.json({ received: true });
}
