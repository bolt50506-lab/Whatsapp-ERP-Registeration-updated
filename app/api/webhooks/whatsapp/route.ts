import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) return new NextResponse('Forbidden', { status: 403 });

  const { data: credentials } = await supabaseAdmin
    .from('whatsapp_cloud_credentials')
    .select('connection_id')
    .eq('verify_token', token)
    .maybeSingle();

  if (!credentials) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload?.object !== 'whatsapp_business_account') return NextResponse.json({ received: true });

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: credentials } = await supabaseAdmin
        .from('whatsapp_cloud_credentials')
        .select('connection_id, organization_id, app_secret')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();

      if (!credentials) continue;

      const signature = req.headers.get('x-hub-signature-256');
      if (credentials.app_secret && signature) {
        const expected = 'sha256=' + crypto.createHmac('sha256', credentials.app_secret).update(raw).digest('hex');
        if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }

      await supabaseAdmin.from('webhook_logs').insert({
        organization_id: credentials.organization_id,
        event: change.field || 'whatsapp_webhook',
        payload,
        response_status: 200,
        response_body: 'received',
      });

      for (const status of value.statuses || []) {
        if (status.id) {
          await supabaseAdmin.from('message_queue').update({
            status: status.status === 'delivered' ? 'delivered' : status.status === 'failed' ? 'failed' : 'sent',
            delivered_at: status.status === 'delivered' ? new Date().toISOString() : null,
            last_error: status.errors?.[0]?.title || null,
          }).eq('provider_message_id', status.id).eq('whatsapp_connection_id', credentials.connection_id);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
