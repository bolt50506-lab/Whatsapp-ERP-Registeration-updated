import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

const WASENDER_BASE = 'https://www.wasenderapi.com';

async function requireMember(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return { error: 'Not authenticated', status: 401 } as const;
  const token = authorization.slice(7);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return { error: 'Not authenticated', status: 401 } as const;
  const { data: member } = await supabaseAdmin
    .from('org_members')
    .select('organization_id, role')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!member) return { error: 'Organization membership not found', status: 403 } as const;
  return { userId: userData.user.id, organizationId: member.organization_id } as const;
}

export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const sessionId = String(body.session_id || '').trim();
    const apiKey = String(body.api_key || '').trim();

    if (!name || !sessionId || !apiKey) {
      return NextResponse.json({ error: 'name, session_id and api_key are required' }, { status: 400 });
    }

    const webhookSecret = String(body.webhook_secret || '').trim();
    if (!webhookSecret) return NextResponse.json({ error: 'webhook_secret is required so Wasender webhooks can be verified' }, { status: 400 });

    // Validate the supplied session key before saving it.
    const statusResponse = await fetch(WASENDER_BASE + '/api/status', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    const statusData = await statusResponse.json().catch(() => ({}));

    if (!statusResponse.ok) {
      return NextResponse.json(
        { error: statusData?.message || statusData?.error || 'WasenderAPI credentials could not be validated' },
        { status: statusResponse.status === 401 ? 401 : 400 },
      );
    }

    const { data: connection, error } = await supabaseAdmin
      .from('whatsapp_connections')
      .insert({
        organization_id: auth.organizationId,
        name,
        provider: 'wasender',
        provider_session_id: sessionId,
        status: statusData?.status === 'connected' ? 'connected' : 'disconnected',
      })
      .select('id, organization_id, name, provider, provider_session_id, status, phone_number, created_at, updated_at')
      .single();

    if (error || !connection) {
      return NextResponse.json({ error: error?.message || 'Failed to create connection' }, { status: 500 });
    }

    const { error: credentialError } = await supabaseAdmin
      .from('wasender_credentials')
      .insert({
        connection_id: connection.id,
        organization_id: auth.organizationId,
        session_id: sessionId,
        api_key: apiKey,
        webhook_secret: webhookSecret,
      });

    if (credentialError) {
      await supabaseAdmin.from('whatsapp_connections').delete().eq('id', connection.id);
      return NextResponse.json({ error: credentialError.message }, { status: 500 });
    }

    await supabaseAdmin.from('connection_logs').insert({
      organization_id: auth.organizationId,
      whatsapp_connection_id: connection.id,
      event: 'configured',
      details: { provider: 'wasender' },
    });

    return NextResponse.json({
      success: true,
      connection,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/webhooks/wasender/${connection.id}`,
      status: statusData?.status || 'disconnected',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create WasenderAPI connection' },
      { status: 500 },
    );
  }
}
