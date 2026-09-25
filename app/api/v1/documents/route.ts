import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server-client';
import { normalizePhone, isValidE164 } from '@/lib/phone';

async function authenticate(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const keyHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  const { data } = await supabaseServer.from('api_keys')
    .select('id, organization_id, integration_id, expires_at')
    .eq('key_hash', keyHash).maybeSingle();
  if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) return null;
  await supabaseServer.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (!auth) return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 });

    const body = await req.json();
    if (!body.recipient || !body.document_url) {
      return NextResponse.json({ success: false, error: 'recipient and document_url are required' }, { status: 400 });
    }

    const { data: integration } = await supabaseServer.from('erp_integrations')
      .select('*').eq('id', auth.integration_id).eq('organization_id', auth.organization_id).maybeSingle();
    if (!integration?.is_active) return NextResponse.json({ success: false, error: 'Integration is inactive' }, { status: 403 });

    const { data: settingsRow } = await supabaseServer.from('settings').select('value')
      .eq('organization_id', auth.organization_id).eq('key', 'messaging').maybeSingle();
    const settings = (settingsRow?.value || {}) as Record<string, any>;
    const recipient = normalizePhone(body.recipient, settings.default_country || 'PK');
    if (!isValidE164(recipient)) return NextResponse.json({ success: false, error: 'Invalid recipient phone number' }, { status: 400 });

    const connectionId = body.connection_id || integration.whatsapp_connection_id;
    if (!connectionId) return NextResponse.json({ success: false, error: 'No WhatsApp connection configured' }, { status: 409 });

    const { data: queued, error } = await supabaseServer.from('message_queue').insert({
      organization_id: auth.organization_id,
      whatsapp_connection_id: connectionId,
      integration_id: auth.integration_id,
      event: body.event || 'document',
      recipient,
      message: body.caption || body.message || null,
      document_url: body.document_url,
      document_name: body.document_name || 'document.pdf',
      status: 'queued',
      idempotency_key: body.idempotency_key || null,
      metadata: body.metadata || {},
      max_attempts: Number(settings.retry_attempts || 5),
    }).select('id, status').single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    await supabaseServer.from('message_logs').insert({
      organization_id: auth.organization_id,
      message_id: queued.id,
      status: 'queued',
      provider: 'baileys',
      attempts: 0,
    });

    return NextResponse.json({ success: true, message_id: queued.id, status: queued.status });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 });
  }
}
