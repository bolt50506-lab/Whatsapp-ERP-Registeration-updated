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

  const { data: connections } = await supabaseServer
    .from('whatsapp_connections')
    .select('id, name, phone_number, provider, status, last_connected_at, last_seen_at')
    .eq('organization_id', auth.orgId);

  return NextResponse.json({
    connections: connections || [],
    worker_status: connections && connections.some(c => c.status === 'connected') ? 'online' : 'offline',
  });
}
