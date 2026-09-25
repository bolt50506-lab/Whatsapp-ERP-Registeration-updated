import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/server';

export default async function ReportLinkPage({ params }: { params: { token: string } }) {
  const { data: token } = await supabaseAdmin
    .from('report_delivery_tokens')
    .select('report_url, report_type, expires_at, used_at, is_one_time')
    .eq('token', params.token)
    .maybeSingle();

  if (!token) notFound();

  const expired = new Date(token.expires_at).getTime() <= Date.now();
  if (expired || (token.is_one_time && token.used_at)) {
    return <main className="min-h-screen flex items-center justify-center p-6"><div className="max-w-md text-center"><h1 className="text-xl font-semibold">Report link expired</h1><p className="text-sm text-muted-foreground mt-2">Please contact the laboratory or clinic for a new report link.</p></div></main>;
  }

  if (token.is_one_time) {
    await supabaseAdmin.from('report_delivery_tokens').update({ used_at: new Date().toISOString() }).eq('token', params.token);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
      <div className="w-full max-w-2xl rounded-xl border bg-background p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold">Your {token.report_type === 'radiology' ? 'Radiology' : token.report_type === 'laboratory' ? 'Laboratory' : ''} Report</h1>
        <p className="text-sm text-muted-foreground">Your secure report link is valid until {new Date(token.expires_at).toLocaleString()}.</p>
        <a className="inline-flex rounded-lg bg-emerald-600 px-5 py-3 text-white font-medium" href={token.report_url}>Open Report</a>
      </div>
    </main>
  );
}
