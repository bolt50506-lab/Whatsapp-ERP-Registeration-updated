import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server-client';

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
    .select('organization_id')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (!apiKey) return { error: 'Invalid API key', status: 401 };
  return { orgId: apiKey.organization_id };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: conn } = await supabaseServer
    .from('whatsapp_connections')
    .select('id, name, status, qr_data, phone_number')
    .eq('organization_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: 'No WhatsApp connection found' }, { status: 404 });
  }

  return NextResponse.json({
    connection_id: conn.id,
    name: conn.name,
    status: conn.status,
    phone_number: conn.phone_number,
    qr_data: conn.status === 'qr_required' ? conn.qr_data : null,
    requires_scan: conn.status === 'qr_required',
    instructions: 'Open WhatsApp > Settings > Linked Devices > Link a Device > Scan QR',
  });
}
