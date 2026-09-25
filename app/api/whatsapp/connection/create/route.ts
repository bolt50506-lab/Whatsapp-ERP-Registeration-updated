import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/server';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kawbiypmfluamxyinezt.supabase.co';

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const token = authorization.slice(7);

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Use the user's access token for RLS-protected membership/connection
  // queries. supabaseAdmin may fall back to the public key on deployments
  // where SUPABASE_SERVICE_ROLE_KEY is not configured.
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: member, error: memberError } = await supabaseUser
    .from('org_members')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { error: memberError.message || 'Failed to load organization membership' },
      { status: 500 },
    );
  }

  if (!member) {
    return NextResponse.json(
      { error: 'Organization membership not found' },
      { status: 403 },
    );
  }

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data: connection, error } = await supabaseUser
    .from('whatsapp_connections')
    .insert({
      organization_id: member.organization_id,
      name: body.name.trim(),
      provider: 'baileys',
      status: 'disconnected',
    })
    .select(
      'id, organization_id, name, provider, status, phone_number, created_at, updated_at',
    )
    .single();

  if (error || !connection) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create connection' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, connection });
}
