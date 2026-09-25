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

  const { connection_id } = await req.json();
  const { data: connection } = await supabaseAdmin.from('whatsapp_connections')
    .select('id, organization_id, provider, phone_number, status').eq('id', connection_id).eq('organization_id', member.organization_id).maybeSingle();
  if (!connection || connection.provider !== 'whatsapp_cloud') return NextResponse.json({ error: 'Cloud API connection not found' }, { status: 404 });
  const { data: credentials } = await supabaseAdmin.from('whatsapp_cloud_credentials').select('*').eq('connection_id', connection.id).maybeSingle();
  if (!credentials?.phone_number_id || !credentials?.access_token) return NextResponse.json({ error: 'Cloud API credentials are incomplete' }, { status: 400 });
  const version = credentials.api_version || 'v23.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${credentials.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    await supabaseAdmin.from('whatsapp_connections').update({ status: 'error', last_seen_at: new Date().toISOString() }).eq('id', connection.id);
    return NextResponse.json({ success: false, error: data?.error?.message || 'Meta API validation failed' }, { status: response.status });
  }

  await supabaseAdmin.from('whatsapp_connections').update({
    status: 'connected',
    phone_number: data.display_phone_number || connection.phone_number,
    last_connected_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  }).eq('id', connection.id);

  return NextResponse.json({ success: true, phone_number: data.display_phone_number || null, verified_name: data.verified_name || null, quality_rating: data.quality_rating || null });
}
