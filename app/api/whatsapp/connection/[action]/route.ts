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
