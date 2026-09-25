import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server-client';
import { normalizePhone, isValidE164 } from '@/lib/phone';
import { renderTemplate, buildDocumentName } from '@/lib/template';
import { generateReportToken } from '@/lib/crypto';

const EVENT_MAP: Record<string, string> = {
  'patient-registered': 'patient_registered',
  'invoice-created': 'invoice_created',
  'report-ready': 'report_ready',
  'appointment-created': 'appointment_created',
  'appointment-reminder': 'appointment_reminder',
  'appointment-cancelled': 'appointment_cancelled',
  'payment-received': 'payment_received',
  'payment-pending': 'payment_pending',
  'payment-failed': 'payment_failed',
  'custom': 'custom_message',
};

async function authenticate(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const keyHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  const { data } = await supabaseServer.from('api_keys').select('id, organization_id, integration_id, expires_at').eq('key_hash', keyHash).maybeSingle();
  if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) return null;
  await supabaseServer.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

export async function POST(req: NextRequest, { params }: { params: { event: string } }) {
  try {
    const auth = await authenticate(req);
    if (!auth) return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 });

    const event = EVENT_MAP[params.event];
    if (!event) return NextResponse.json({ success: false, error: 'Unsupported event' }, { status: 404 });

    const body = await req.json();
    if (!body.recipient) return NextResponse.json({ success: false, error: 'recipient is required' }, { status: 400 });

    const { data: integration } = await supabaseServer.from('erp_integrations').select('*').eq('id', auth.integration_id).eq('organization_id', auth.organization_id).maybeSingle();
    if (!integration?.is_active) return NextResponse.json({ success: false, error: 'Integration is inactive' }, { status: 403 });

    const { data: settingsRow } = await supabaseServer.from('settings').select('value').eq('organization_id', auth.organization_id).eq('key', 'messaging').maybeSingle();
    const settings = (settingsRow?.value || {}) as Record<string, any>;
    const normalizedPhone = normalizePhone(body.recipient, settings.default_country || 'PK');
    if (!isValidE164(normalizedPhone)) return NextResponse.json({ success: false, error: 'Invalid recipient phone number' }, { status: 400 });

    const connectionId = body.connection_id || integration.whatsapp_connection_id;
    if (!connectionId) return NextResponse.json({ success: false, error: 'No WhatsApp connection configured' }, { status: 409 });

    let secureLink = body.secure_link || null;
    if (event === 'report_ready' && (body.report_url || body.report_pdf_url) && settings.send_secure_link !== false) {
      const token = generateReportToken();
      const hours = Number(settings.secure_link_expiration_hours || 72);
      await supabaseServer.from('report_delivery_tokens').insert({
        organization_id: auth.organization_id,
        token,
        report_url: body.report_url || body.report_pdf_url,
        report_type: body.report_type || 'general',
        expires_at: new Date(Date.now() + hours * 3600000).toISOString(),
        is_one_time: false,
      });
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      secureLink = `${baseUrl}/r/${token}`;
    }

    const { data: template } = await supabaseServer.from('message_templates').select('*').eq('organization_id', auth.organization_id).eq('event', event).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    let message = body.custom_message || '';
    if (template) message = renderTemplate(template.message, { ...body, secure_link: secureLink });

    const documentUrl = body.invoice_pdf_url || (template?.send_pdf ? body.report_pdf_url : null) || (body.report_pdf_url && body.send_report_pdf !== false ? body.report_pdf_url : null);
    const documentName = documentUrl ? buildDocumentName(event, body) : null;

    const { data: queued, error } = await supabaseServer.from('message_queue').insert({
      organization_id: auth.organization_id,
      whatsapp_connection_id: connectionId,
      integration_id: auth.integration_id,
      event,
      recipient: normalizedPhone,
      message,
      document_url: documentUrl,
      document_name: documentName,
      status: 'queued',
      idempotency_key: body.idempotency_key || null,
      metadata: { ...body, secure_link: secureLink },
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

    return NextResponse.json({ success: true, message_id: queued.id, status: queued.status, secure_link: secureLink });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 });
  }
}
