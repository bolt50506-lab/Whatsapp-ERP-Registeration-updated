'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Link2,
  Server,
  RefreshCw,
  Power,
} from 'lucide-react';
import Link from 'next/link';
import type { WhatsAppConnection, MessageQueueItem } from '@/lib/types/database';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  connected: { label: 'Connected', variant: 'success' },
  disconnected: { label: 'Disconnected', variant: 'secondary' },
  connecting: { label: 'Connecting', variant: 'outline' },
  qr_required: { label: 'QR Required', variant: 'outline' },
  error: { label: 'Error', variant: 'destructive' },
};

export default function DashboardPage() {
  const { organization } = useAuth();
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [stats, setStats] = useState({
    sentToday: 0,
    failedToday: 0,
    pending: 0,
    apiRequestsToday: 0,
  });
  const [recentMessages, setRecentMessages] = useState<MessageQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organization) return;
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [organization]);

  async function loadData() {
    if (!organization) return;
    setLoading(true);

    const { data: conns } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    setConnections(conns || []);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: sentToday } = await supabase
      .from('message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .in('status', ['sent', 'delivered'])
      .gte('sent_at', today.toISOString());

    const { count: failedToday } = await supabase
      .from('message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .eq('status', 'failed')
      .gte('failed_at', today.toISOString());

    const { count: pending } = await supabase
      .from('message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .in('status', ['queued', 'processing']);

    const { count: apiRequestsToday } = await supabase
      .from('webhook_logs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .gte('created_at', today.toISOString());

    setStats({
      sentToday: sentToday || 0,
      failedToday: failedToday || 0,
      pending: pending || 0,
      apiRequestsToday: apiRequestsToday || 0,
    });

    const { data: recent } = await supabase
      .from('message_queue')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(10);

    setRecentMessages(recent || []);
    setLoading(false);
  }

  const primaryConnection = connections[0];
  const connectionStatus = primaryConnection?.status || 'disconnected';
  const statusInfo = statusConfig[connectionStatus] || statusConfig.disconnected;

  const uptime = primaryConnection?.last_connected_at
    ? Math.floor((Date.now() - new Date(primaryConnection.last_connected_at).getTime()) / 60000)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of your WhatsApp gateway status and messaging activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Messages Sent Today"
          value={stats.sentToday}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          label="Messages Failed Today"
          value={stats.failedToday}
          icon={XCircle}
          variant="destructive"
        />
        <StatCard
          label="Messages Pending"
          value={stats.pending}
          icon={Clock}
          variant="warning"
        />
        <StatCard
          label="API Requests Today"
          value={stats.apiRequestsToday}
          icon={Activity}
          variant="info"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">WhatsApp Connection</CardTitle>
                <CardDescription>Primary connection status</CardDescription>
              </div>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {primaryConnection ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Connected Number</p>
                  <p className="font-medium">{primaryConnection.phone_number || 'Not connected'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Connection Uptime</p>
                  <p className="font-medium">{uptime > 0 ? `${uptime} min` : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Last Connected</p>
                  <p className="font-medium">
                    {primaryConnection.last_connected_at
                      ? new Date(primaryConnection.last_connected_at).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Provider</p>
                  <p className="font-medium capitalize">{primaryConnection.provider}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3">
                <p className="text-muted-foreground text-sm">No WhatsApp connection configured.</p>
                <Button asChild>
                  <Link href="/dashboard/whatsapp">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Connect WhatsApp
                  </Link>
                </Button>
              </div>
            )}
            {primaryConnection && (
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/whatsapp">Manage Connection</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={loadData}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Refresh
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Worker Status</CardTitle>
            <CardDescription>WhatsApp worker process</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                <Server className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-sm font-medium">
                    {connectionStatus === 'connecting' ? 'Starting' : connectionStatus === 'connected' ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Worker process</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Connections</span>
                <span className="font-medium">{connections.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connected</span>
                <span className="font-medium">{connections.filter(c => c.status === 'connected').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Disconnected</span>
                <span className="font-medium">{connections.filter(c => c.status === 'disconnected').length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <CardDescription>Latest message queue entries</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/logs">View All Logs</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No messages yet.</p>
          ) : (
            <div className="space-y-2">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant={
                        msg.status === 'sent' || msg.status === 'delivered' ? 'success' :
                        msg.status === 'failed' ? 'destructive' :
                        msg.status === 'processing' ? 'outline' : 'secondary'
                      }
                      className="text-xs"
                    >
                      {msg.status}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{msg.recipient}</p>
                      <p className="text-xs text-muted-foreground truncate">{msg.event}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
