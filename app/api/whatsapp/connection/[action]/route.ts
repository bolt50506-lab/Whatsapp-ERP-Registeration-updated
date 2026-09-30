import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const ACTIONS = new Set(['start', 'reconnect', 'disconnect', 'logout']);

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  if (!ACTIONS.has(params.action)) return NextResponse.json({ error: 'Unsupported action' }, { status: 404 });

  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = authorization.slice(7);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { connection_id } = await req.json();
  if (!connection_id) return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });

  const { data: member } = await supabaseAdmin.from('org_members').select('organization_id, role').eq('user_id', userData.user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Organization membership not found' }, { status: 403 });

  const { data: connection } = await supabaseAdmin.from('whatsapp_connections').select('id, organization_id').eq('id', connection_id).maybeSingle();
  if (!connection || connection.organization_id !== member.organization_id) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const { data: providerConnection } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('id, organization_id, provider, provider_session_id')
    .eq('id', connection_id)
    .maybeSingle();

  if (providerConnection?.provider === 'wasender') {
    const { data: credentials } = await supabaseAdmin
      .from('wasender_credentials')
      .select('session_id, api_key')
      .eq('connection_id', connection_id)
      .maybeSingle();

    if (!credentials?.session_id || !credentials.api_key) {
      return NextResponse.json({ error: 'WasenderAPI credentials are incomplete' }, { status: 400 });
    }

    const base = 'https://www.wasenderapi.com';
    let response: Response;

    if (params.action === 'start' || params.action === 'reconnect') {
      const endpoint = params.action === 'reconnect'
        ? `/api/whatsapp-sessions/${encodeURIComponent(credentials.session_id)}/restart`
        : `/api/whatsapp-sessions/${encodeURIComponent(credentials.session_id)}/connect`;
      response = await fetch(base + endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials.api_key}` },
      });
    } else {
      response = await fetch(
        `${base}/api/whatsapp-sessions/${encodeURIComponent(credentials.session_id)}/disconnect`,
        { method: 'POST', headers: { Authorization: `Bearer ${credentials.api_key}` } },
      );
    }

    const providerData = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: providerData?.message || providerData?.error || 'WasenderAPI request failed' },
        { status: response.status },
      );
    }

    let status = params.action === 'disconnect' || params.action === 'logout' ? 'disconnected' : 'connecting';
    let qrData: string | null = null;

    if (params.action === 'start' || params.action === 'reconnect') {
      const statusResponse = await fetch(base + '/api/status', {
        headers: { Authorization: `Bearer ${credentials.api_key}` },
        cache: 'no-store',
      });
      const statusData = await statusResponse.json().catch(() => ({}));
      const providerStatus = String(statusData?.status || '').toLowerCase();
      if (providerStatus === 'connected') status = 'connected';
      else if (providerStatus === 'need_scan' || providerStatus === 'need_qr' || providerStatus === 'qr_required') status = 'qr_required';

      if (status === 'qr_required') {
        const qrResponse = await fetch(
          `${base}/api/whatsapp-sessions/${encodeURIComponent(credentials.session_id)}/qrcode`,
          { headers: { Authorization: `Bearer ${credentials.api_key}` }, cache: 'no-store' },
        );
        const qrPayload = await qrResponse.json().catch(() => ({}));
        if (qrResponse.ok) {
          const rawQr = qrPayload?.qrCode || qrPayload?.qr || qrPayload?.data?.qrCode || qrPayload?.data?.qr || null;
          if (typeof rawQr === 'string') {
            qrData = rawQr.startsWith('data:image/') ? rawQr : `data:image/png;base64,${rawQr}`;
          }
        }
      }
    }

    const patch: Record<string, unknown> = {
      status,
      qr_data: qrData,
      worker_enabled: false,
      force_logout: false,
      last_seen_at: new Date().toISOString(),
    };
    if (status === 'connected') patch.last_connected_at = new Date().toISOString();
    if (params.action === 'logout') {
      patch.status = 'disconnected';
      patch.phone_number = null;
      patch.provider_session_id = credentials.session_id;
    }

    const { error: wasenderUpdateError } = await supabaseAdmin
      .from('whatsapp_connections')
      .update(patch)
      .eq('id', connection_id)
      .eq('organization_id', member.organization_id);
    if (wasenderUpdateError) return NextResponse.json({ error: wasenderUpdateError.message }, { status: 500 });

    await supabaseAdmin.from('connection_logs').insert({
      organization_id: member.organization_id,
      whatsapp_connection_id: connection_id,
      event: params.action === 'start' && status === 'qr_required' ? 'qr_requested' : params.action,
      details: { provider: 'wasender', provider_status: status },
    });

    return NextResponse.json({ success: true, provider: 'wasender', status, qr_data: qrData });
  }

  const workerEnabled = params.action === 'start' || params.action === 'reconnect';
  const patch: Record<string, unknown> = {
    worker_enabled: workerEnabled,
    status: params.action === 'start' || params.action === 'reconnect' ? 'connecting' : 'disconnected',
  };
  if (params.action === 'logout') {
    patch.force_logout = true;
    patch.status = 'disconnected';
    patch.phone_number = null;
    patch.provider_session_id = null;
    patch.qr_data = null;
  }

  const { error: updateError } = await supabaseAdmin
    .from('whatsapp_connections')
    .update(patch)
    .eq('id', connection_id)
    .eq('organization_id', member.organization_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabaseAdmin.from('connection_logs').insert({
    organization_id: member.organization_id,
    whatsapp_connection_id: connection_id,
    event: params.action === 'start' ? 'qr_requested' : params.action,
    details: { local_worker_mode: true },
  });

  return NextResponse.json({ success: true, local_worker_mode: true });
}
