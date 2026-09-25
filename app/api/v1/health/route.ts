import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server-client';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'whatsapp-erp-gateway',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
}
