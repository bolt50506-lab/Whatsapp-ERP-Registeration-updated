import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server-client';
import { normalizePhone, isValidE164 } from '@/lib/phone';
import { renderTemplate, buildDocumentName } from '@/lib/template';
import type { ApiMessageRequest, ApiMessageResponse } from '@/lib/types/database';

async function authenticateRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const token = authHeader.substring(7);
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: apiKey } = await supabaseServer
    .from('api_keys')
    .select('*, erp_integrations(*)')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (!apiKey) {
    return { error: 'Invalid API key', status: 401 };
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { error: 'API key expired', status: 401 };
  }

  await supabaseServer
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  return { apiKey };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json() as ApiMessageRequest & { _test?: boolean; _connection_id?: string };

    if (!body.event || !body.recipient) {
      return NextResponse.json({ success: false, error: 'event and recipient are required' } as ApiMessageResponse, { status: 400 });
    }

    const { apiKey } = auth;
    const integration = (apiKey as any).erp_integrations;
    if (!integration || !integration.is_active) {
      return NextResponse.json({ success: false, error: 'Integration is not active' } as ApiMessageResponse, { status: 403 });
    }

    const orgId = apiKey.organization_id;

    let whatsappConnectionId = body._connection_id || integration.whatsapp_connection_id;
    if (!whatsappConnectionId) {
      const { data: conn } = await supabaseServer
        .from('whatsapp_connections')
        .select('id')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      whatsappConnectionId = conn?.id || null;
    }

    const { data: settingsRow } = await supabaseServer
      .from('settings')
      .select('value')
      .eq('organization_id', orgId)
      .eq('key', 'messaging')
      .maybeSingle();
    const msgSettings = (settingsRow?.value as Record<string, any>) || {};
    const defaultCountry = msgSettings.default_country || 'PK';

    const normalizedPhone = normalizePhone(body.recipient, defaultCountry);
    if (!isValidE164(normalizedPhone)) {
      return NextResponse.json({ success: false, error: `Invalid phone number: ${body.recipient}. Normalized to ${normalizedPhone} which is not valid E.164` } as ApiMessageResponse, { status: 400 });
    }

    if (body.idempotency_key) {
      const { data: existing } = await supabaseServer
        .from('message_queue')
        .select('*')
        .eq('organization_id', orgId)
        .eq('idempotency_key', body.idempotency_key)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          success: true,
          message_id: existing.id,
          status: existing.status,
          duplicate: true,
        } as ApiMessageResponse, { status: 200 });
      }
    }

    const { data: templates } = await supabaseServer
      .from('message_templates')
      .select('*')
      .eq('organization_id', orgId)
      .eq('event', body.event)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const template = templates?.[0];
    let messageText = body.custom_message || '';
    if (template) {
      messageText = renderTemplate(template.message, body);
    }

    let documentUrl: string | null = null;
    let documentName: string | null = null;

    if (body.invoice_pdf_url) {
      documentUrl = body.invoice_pdf_url;
      documentName = buildDocumentName(body.event, body);
    } else if (body.report_pdf_url) {
      documentUrl = body.report_pdf_url;
      documentName = buildDocumentName(body.event, body);
    }

    const { data: message } = await supabaseServer
      .from('message_queue')
      .insert({
        organization_id: orgId,
        whatsapp_connection_id: whatsappConnectionId,
        integration_id: integration.id,
        event: body.event,
        recipient: normalizedPhone,
        message: messageText,
        document_url: documentUrl,
        document_name: documentName,
        status: 'queued',
        idempotency_key: body.idempotency_key || null,
        metadata: body.metadata || {},
        max_attempts: msgSettings.retry_attempts || 5,
      })
      .select()
      .single();

    if (!message) {
      return NextResponse.json({ success: false, error: 'Failed to queue message' } as ApiMessageResponse, { status: 500 });
    }

    await supabaseServer.from('message_logs').insert({
      organization_id: orgId,
      message_id: message.id,
      status: 'queued',
      provider: 'baileys',
      attempts: 0,
    });

    if (integration.webhook_url) {
      await supabaseServer.from('webhook_logs').insert({
        organization_id: orgId,
        integration_id: integration.id,
        event: 'message_queued',
        payload: { message_id: message.id, recipient: normalizedPhone },
      });
    }

    return NextResponse.json({
      success: true,
      message_id: message.id,
      status: 'queued',
    } as ApiMessageResponse, { status: 200 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: errorMessage } as ApiMessageResponse, { status: 500 });
  }
}
