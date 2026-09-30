'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageCircle,
  QrCode,
  RefreshCw,
  Power,
  LogOut,
  Phone,
  Clock,
  Activity,
  Loader2,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import type { WhatsAppConnection, ConnectionLog } from '@/lib/types/database';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  connected: { label: 'Connected', variant: 'success' },
  disconnected: { label: 'Disconnected', variant: 'secondary' },
  connecting: { label: 'Connecting', variant: 'outline' },
  qr_required: { label: 'QR Required', variant: 'outline' },
  error: { label: 'Error', variant: 'destructive' },
};

export default function WhatsAppPage() {
  const { organization } = useAuth();
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [showNewConn, setShowNewConn] = useState(false);
  const [provider, setProvider] = useState<'baileys' | 'whatsapp_cloud' | 'wasender'>('baileys');
  const [wasenderSessionId, setWasenderSessionId] = useState('');
  const [wasenderApiKey, setWasenderApiKey] = useState('');
  const [wasenderWebhookSecret, setWasenderWebhookSecret] = useState('');
  const [cloudWabaId, setCloudWabaId] = useState('');
  const [cloudPhoneNumberId, setCloudPhoneNumberId] = useState('');
  const [cloudAccessToken, setCloudAccessToken] = useState('');
  const [cloudVerifyToken, setCloudVerifyToken] = useState('');
  const [cloudAppSecret, setCloudAppSecret] = useState('');
  const [cloudApiVersion, setCloudApiVersion] = useState('v23.0');

  const selected = connections.find((c) => c.id === selectedId) || connections[0];

  const syncWasenderStatus = useCallback(async (conns: WhatsAppConnection[]) => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.access_token) return;
    const wasenderConnections = conns.filter((c) => c.provider === 'wasender');
    await Promise.all(wasenderConnections.map(async (conn) => {
      await fetch(`/api/whatsapp/wasender/status?connection_id=${encodeURIComponent(conn.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      }).catch(() => undefined);
    }));
  }, []);

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data: conns } = await supabase
      .from('whatsapp_connections')
      .select('id, organization_id, name, phone_number, provider, provider_session_id, status, last_connected_at, last_seen_at, qr_data, worker_enabled, force_logout, created_at, updated_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    setConnections(conns || []);
    if (conns && conns.length > 0 && !selectedId) {
      setSelectedId(conns[0].id);
    }
    setLoading(false);
    if (conns?.some((c) => c.provider === 'wasender')) await syncWasenderStatus(conns as WhatsAppConnection[]);
  }, [organization, selectedId, syncWasenderStatus]);

  const loadLogs = useCallback(async () => {
    if (!organization || !selected) return;
    const { data: logData } = await supabase
      .from('connection_logs')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('whatsapp_connection_id', selected.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(logData || []);
  }, [organization, selected]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => {
      loadData();
      loadLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [selected, loadData, loadLogs]);

  async function createConnection() {
    if (!organization || !newConnName.trim()) return;
    setActionLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error('Session expired. Please sign in again.');

      let response: Response;
      if (provider === 'wasender') {
        response = await fetch('/api/whatsapp/wasender/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: newConnName.trim(),
            session_id: wasenderSessionId.trim(),
            api_key: wasenderApiKey.trim(),
            webhook_secret: wasenderWebhookSecret.trim() || undefined,
          }),
        });
      } else if (provider === 'whatsapp_cloud') {
        response = await fetch('/api/whatsapp/cloud/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: newConnName.trim(),
            waba_id: cloudWabaId,
            phone_number_id: cloudPhoneNumberId,
            access_token: cloudAccessToken,
            verify_token: cloudVerifyToken,
            app_secret: cloudAppSecret,
            api_version: cloudApiVersion,
          }),
        });
      } else {
        response = await fetch('/api/whatsapp/connection/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ name: newConnName.trim() }),
        });
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to create connection');

      setNewConnName('');
      setCloudWabaId('');
      setCloudPhoneNumberId('');
      setCloudAccessToken('');
      setCloudVerifyToken('');
      setCloudAppSecret('');
      setProvider('baileys');
      setWasenderSessionId('');
      setWasenderApiKey('');
      setWasenderWebhookSecret('');
      setShowNewConn(false);
      setSelectedId(payload.connection?.id || null);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create connection');
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteConnection(id: string) {
    if (!confirm('Delete this WhatsApp connection? This cannot be undone.')) return;
    await supabase.from('whatsapp_connections').delete().eq('id', id);
    setSelectedId(null);
    await loadData();
  }

  async function callWorker(action: string) {
    if (!selected) return;
    setActionLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/whatsapp/connection/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ connection_id: selected.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Worker request failed');
      }
    } catch (error) {
      console.error('WhatsApp worker action failed:', error);
    }

    if (selected.provider === 'wasender') {
      await loadData();
      await loadLogs();
      setActionLoading(false);
      return;
    }

    if (action === 'start' || action === 'reconnect') {
      await supabase
        .from('whatsapp_connections')
        .update({ status: 'connecting' })
        .eq('id', selected.id);
      await supabase.from('connection_logs').insert({
        organization_id: selected.organization_id,
        whatsapp_connection_id: selected.id,
        event: action === 'start' ? 'qr_requested' : 'reconnecting',
        details: {},
      });
    } else if (action === 'disconnect') {
      await supabase
        .from('whatsapp_connections')
        .update({ status: 'disconnected' })
        .eq('id', selected.id);
      await supabase.from('connection_logs').insert({
        organization_id: selected.organization_id,
        whatsapp_connection_id: selected.id,
        event: 'disconnected',
        details: {},
      });
    } else if (action === 'logout') {
      await supabase
        .from('whatsapp_connections')
        .update({ status: 'disconnected', phone_number: null, provider_session_id: null, qr_data: null })
        .eq('id', selected.id);
      await supabase.from('connection_logs').insert({
        organization_id: selected.organization_id,
        whatsapp_connection_id: selected.id,
        event: 'logout',
        details: {},
      });
    }

    await loadData();
    await loadLogs();
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Connection</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect with WasenderAPI, official WhatsApp Cloud API, or your local WhatsApp Web/Baileys worker.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNewConn(!showNewConn)}>
          <Plus className="w-4 h-4 mr-2" />
          New Connection
        </Button>
      </div>

      {showNewConn && (
        <Card className="border-border/40">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="w-48 space-y-2">
              <Label>Provider</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={provider} onChange={(e) => setProvider(e.target.value as 'baileys' | 'whatsapp_cloud' | 'wasender')}>
                <option value="baileys">WhatsApp Web / Baileys</option>
                <option value="whatsapp_cloud">Official WhatsApp Cloud API</option>
                <option value="wasender">WasenderAPI</option>
              </select>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="conn-name">Connection Name</Label>
              <Input
                id="conn-name"
                value={newConnName}
                onChange={(e) => setNewConnName(e.target.value)}
                placeholder="e.g. Main Lab Number"
              />
            </div>
            <Button onClick={createConnection} disabled={actionLoading || !newConnName.trim() || (provider === 'whatsapp_cloud' && (!cloudPhoneNumberId.trim() || !cloudAccessToken.trim())) || (provider === 'wasender' && (!wasenderSessionId.trim() || !wasenderApiKey.trim() || !wasenderWebhookSecret.trim()))}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
            {provider === 'wasender' && (
              <div className="basis-full grid gap-3 md:grid-cols-2 pt-2 border-t">
                <div className="space-y-1">
                  <Label>Wasender Session ID *</Label>
                  <Input value={wasenderSessionId} onChange={(e) => setWasenderSessionId(e.target.value)} placeholder="Session ID from WasenderAPI" />
                </div>
                <div className="space-y-1">
                  <Label>Wasender API Key *</Label>
                  <Input type="password" value={wasenderApiKey} onChange={(e) => setWasenderApiKey(e.target.value)} placeholder="Keep this server-side" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Webhook Secret *</Label>
                  <Input type="password" value={wasenderWebhookSecret} onChange={(e) => setWasenderWebhookSecret(e.target.value)} placeholder="Secret configured in your WasenderAPI webhook settings" />
                  <p className="text-xs text-muted-foreground">After creating the connection, configure the displayed webhook URL in WasenderAPI and use the same secret.</p>
                </div>
              </div>
            )}
            {provider === 'whatsapp_cloud' && (
              <div className="basis-full grid gap-3 md:grid-cols-3 pt-2 border-t">
                <div className="space-y-1"><Label>WABA ID</Label><Input value={cloudWabaId} onChange={(e) => setCloudWabaId(e.target.value)} placeholder="Meta WABA ID" /></div>
                <div className="space-y-1"><Label>Phone Number ID *</Label><Input value={cloudPhoneNumberId} onChange={(e) => setCloudPhoneNumberId(e.target.value)} placeholder="Phone Number ID" /></div>
                <div className="space-y-1"><Label>Graph API Version</Label><Input value={cloudApiVersion} onChange={(e) => setCloudApiVersion(e.target.value)} placeholder="v23.0" /></div>
                <div className="space-y-1 md:col-span-3"><Label>Permanent/System User Access Token *</Label><Input type="password" value={cloudAccessToken} onChange={(e) => setCloudAccessToken(e.target.value)} placeholder="Keep this server-side; never expose it publicly" /></div>
                <div className="space-y-1"><Label>Webhook Verify Token</Label><Input type="password" value={cloudVerifyToken} onChange={(e) => setCloudVerifyToken(e.target.value)} /></div>
                <div className="space-y-1 md:col-span-2"><Label>App Secret</Label><Input type="password" value={cloudAppSecret} onChange={(e) => setCloudAppSecret(e.target.value)} placeholder="For webhook signature verification" /></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {connections.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="py-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted">
              <MessageCircle className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No WhatsApp connections yet</p>
              <p className="text-sm text-muted-foreground">Create a connection to get started with QR pairing.</p>
            </div>
            <Button onClick={() => setShowNewConn(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {connections.map((conn) => (
              <Card key={conn.id} className={`border-border/40 ${selected?.id === conn.id ? 'ring-2 ring-emerald-500/20' : ''}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{conn.name}</CardTitle>
                        <CardDescription className="text-xs">{conn.provider}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={statusConfig[conn.status]?.variant || 'secondary'}>
                      {statusConfig[conn.status]?.label || conn.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone Number</p>
                        <p className="font-medium">{conn.phone_number || 'Not connected'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Last Connected</p>
                        <p className="font-medium">
                          {conn.last_connected_at ? new Date(conn.last_connected_at).toLocaleString() : 'Never'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {conn.status === 'qr_required' && conn.qr_data && (
                    <div className="flex flex-col items-center gap-3 py-4 border rounded-lg bg-muted/30">
                      <p className="text-sm font-medium">Scan QR Code</p>
                      <div className="bg-white p-3 rounded-lg">
                        <img src={conn.qr_data} alt="WhatsApp QR Code" className="w-48 h-48" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        Open WhatsApp on your phone, go to Settings, Linked Devices, Link a Device, and scan this code.
                      </p>
                    </div>
                  )}

                  {conn.provider === 'wasender' && (
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs">
                      <p className="font-medium mb-1">WasenderAPI webhook URL</p>
                      <code className="break-all text-muted-foreground">{`${window.location.origin}/api/webhooks/wasender/${conn.id}`}</code>
                      <p className="text-muted-foreground mt-2">Add this HTTPS URL in the WasenderAPI session webhook settings and subscribe to session status and message status/receipt events.</p>
                    </div>
                  )}

                  {conn.status === 'connecting' && (
                    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Connecting...</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    {conn.provider === 'wasender' && (conn.status === 'disconnected' || conn.status === 'qr_required') && (
                      <Button size="sm" onClick={() => callWorker(conn.status === 'qr_required' ? 'reconnect' : 'start')} disabled={actionLoading}>
                        <QrCode className="w-3.5 h-3.5 mr-1.5" />
                        {conn.status === 'qr_required' ? 'Refresh QR' : 'Connect WhatsApp'}
                      </Button>
                    )}
                    {conn.provider === 'baileys' && conn.status === 'disconnected' && (
                      <Button size="sm" onClick={() => callWorker('start')} disabled={actionLoading}>
                        <QrCode className="w-3.5 h-3.5 mr-1.5" />
                        Generate QR
                      </Button>
                    )}
                    {conn.provider === 'whatsapp_cloud' && (
                      <Button size="sm" onClick={async () => {
                        setActionLoading(true);
                        const session = (await supabase.auth.getSession()).data.session;
                        const res = session ? await fetch('/api/whatsapp/cloud/test', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                          body: JSON.stringify({ connection_id: conn.id }),
                        }) : null;
                        const data = await res?.json().catch(() => ({}));
                        if (!res?.ok) alert(data?.error || 'Cloud API test failed');
                        else alert(`Cloud API connected: ${data.verified_name || data.phone_number || 'success'}`);
                        await loadData();
                        setActionLoading(false);
                      }} disabled={actionLoading}>
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Test Cloud API
                      </Button>
                    )}
                    {conn.status === 'qr_required' && (
                      <Button size="sm" variant="outline" onClick={() => callWorker('start')} disabled={actionLoading}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Refresh QR
                      </Button>
                    )}
                    {conn.status === 'connected' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => callWorker('reconnect')} disabled={actionLoading}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Reconnect
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => callWorker('disconnect')} disabled={actionLoading}>
                          <Power className="w-3.5 h-3.5 mr-1.5" />
                          Disconnect
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => callWorker('logout')} disabled={actionLoading}>
                      <LogOut className="w-3.5 h-3.5 mr-1.5" />
                      Logout
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteConnection(conn.id)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Connection Logs</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No logs yet.</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 py-2 border-b border-border/20 last:border-0">
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          log.event === 'connected' ? 'bg-emerald-500' :
                          log.event === 'disconnected' || log.event === 'logout' ? 'bg-red-500' :
                          log.event === 'authentication_failure' || log.event === 'worker_error' ? 'bg-red-500' :
                          'bg-amber-500'
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">{log.event.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
