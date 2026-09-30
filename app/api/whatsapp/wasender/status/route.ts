import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const token = authorization.slice(7);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: 'Organization membership not found' }, { status: 403 });

  const connectionId = req.nextUrl.searchParams.get('connection_id');
  if (!connectionId) return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });

  const { data: connection } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('id, organization_id, provider')
    .eq('id', connectionId)
    .eq('organization_id', member.organization_id)
    .maybeSingle();
  if (!connection || connection.provider !== 'wasender') return NextResponse.json({ error: 'WasenderAPI connection not found' }, { status: 404 });

  const { data: credentials } = await supabaseAdmin
    .from('wasender_credentials')
    .select('session_id, api_key')
    .eq('connection_id', connection.id)
    .maybeSingle();
  if (!credentials) return NextResponse.json({ error: 'WasenderAPI credentials not found' }, { status: 400 });

  const response = await fetch('https://www.wasenderapi.com/api/status', {
    headers: { Authorization: `Bearer ${credentials.api_key}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: data?.message || data?.error || 'WasenderAPI status request failed' }, { status: response.status });

  const providerStatus = String(data?.status || '').toLowerCase();
  const status =
    providerStatus === 'connected' ? 'connected' :
    providerStatus === 'need_scan' || providerStatus === 'need_qr' || providerStatus === 'qr_required' ? 'qr_required' :
    providerStatus === 'connecting' ? 'connecting' :
    'disconnected';

  await supabaseAdmin.from('whatsapp_connections').update({
    status,
    last_seen_at: new Date().toISOString(),
    qr_data: status === 'connected' ? null : undefined,
    last_connected_at: status === 'connected' ? new Date().toISOString() : undefined,
  }).eq('id', connection.id);

  return NextResponse.json({ success: true, status, provider_status: providerStatus });
}
