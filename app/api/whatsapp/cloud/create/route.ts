import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const token = authorization.slice(7);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: member } = await supabaseAdmin.from('org_members').select('organization_id').eq('user_id', userData.user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Organization membership not found' }, { status: 403 });

  const body = await req.json();
  if (!body.name?.trim() || !body.phone_number_id?.trim() || !body.access_token?.trim()) {
    return NextResponse.json({ error: 'name, phone_number_id and access_token are required' }, { status: 400 });
  }

  const { data: connection, error } = await supabaseAdmin.from('whatsapp_connections').insert({
    organization_id: member.organization_id,
    name: body.name.trim(),
    provider: 'whatsapp_cloud',
    status: 'disconnected',
  }).select('id, organization_id, name, provider, status, phone_number, created_at, updated_at').single();

  if (error || !connection) return NextResponse.json({ error: error?.message || 'Failed to create connection' }, { status: 500 });

  const { error: credentialError } = await supabaseAdmin.from('whatsapp_cloud_credentials').insert({
    connection_id: connection.id,
    organization_id: member.organization_id,
    waba_id: body.waba_id?.trim() || null,
    phone_number_id: body.phone_number_id.trim(),
    access_token: body.access_token.trim(),
    verify_token: body.verify_token?.trim() || null,
    app_secret: body.app_secret?.trim() || null,
    api_version: body.api_version?.trim() || 'v23.0',
  });

  if (credentialError) {
    await supabaseAdmin.from('whatsapp_connections').delete().eq('id', connection.id);
    return NextResponse.json({ error: credentialError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, connection });
}
