'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Loader2 } from 'lucide-react';
import type { ConnectionLog, WhatsAppConnection } from '@/lib/types/database';

const eventColors: Record<string, string> = {
  connected: 'bg-emerald-500',
  qr_generated: 'bg-amber-500',
  qr_scanned: 'bg-emerald-500',
  disconnected: 'bg-red-500',
  reconnecting: 'bg-amber-500',
  authentication_failure: 'bg-red-500',
  logout: 'bg-red-500',
  worker_error: 'bg-red-500',
};

export default function ConnectionLogsPage() {
  const { organization } = useAuth();
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('connection_logs')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs(data || []);

    const { data: conns } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('organization_id', organization.id);
    setConnections(conns || []);
    setLoading(false);
  }, [organization]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const connName = (id: string) => connections.find((c) => c.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connection Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Track WhatsApp connection lifecycle events.</p>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Connection Events ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No connection logs yet.</p>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-3 px-4 rounded-lg border border-border/20 hover:bg-muted/40 transition-colors">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${eventColors[log.event] || 'bg-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium capitalize">{log.event.replace(/_/g, ' ')}</p>
                        <Badge variant="outline" className="text-xs">{connName(log.whatsapp_connection_id)}</Badge>
                      </div>
                      {Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">{JSON.stringify(log.details)}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
