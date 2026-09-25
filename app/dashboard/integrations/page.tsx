'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plug,
  Plus,
  Key,
  Copy,
  Check,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ErpIntegration, WhatsAppConnection, ApiKey } from '@/lib/types/database';

export default function IntegrationsPage() {
  const { organization } = useAuth();
  const [integrations, setIntegrations] = useState<(ErpIntegration & { whatsapp_connections?: WhatsAppConnection })[]>([]);
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    erp_name: '',
    whatsapp_connection_id: '',
    webhook_url: '',
    default_language: 'en',
  });

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data: ints } = await supabase
      .from('erp_integrations')
      .select('*, whatsapp_connections(*)')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    setIntegrations(ints || []);

    const { data: conns } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('organization_id', organization.id);
    setConnections(conns || []);
    setLoading(false);
  }, [organization]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function createIntegration() {
    if (!organization || !formData.name.trim() || !formData.erp_name.trim()) return;
    setActionLoading(true);

    const { data: integration } = await supabase
      .from('erp_integrations')
      .insert({
        organization_id: organization.id,
        name: formData.name.trim(),
        erp_name: formData.erp_name.trim(),
        whatsapp_connection_id: formData.whatsapp_connection_id || null,
        webhook_url: formData.webhook_url || null,
        default_language: formData.default_language,
        is_active: true,
      })
      .select()
      .single();

    if (integration) {
      const apiKey = generateApiKeyClient();
      const keyHash = await hashKeyClient(apiKey);
      await supabase.from('api_keys').insert({
        organization_id: organization.id,
        integration_id: integration.id,
        name: `${formData.erp_name} API Key`,
        key_hash: keyHash,
        key_prefix: apiKey.substring(0, 12) + '...',
      });
      setCreatedKey(apiKey);
      setFormData({ name: '', erp_name: '', whatsapp_connection_id: '', webhook_url: '', default_language: 'en' });
      setShowCreate(false);
      await loadData();
    }
    setActionLoading(false);
  }

  async function deleteIntegration(id: string) {
    if (!confirm('Delete this integration? All associated API keys will also be removed.')) return;
    await supabase.from('erp_integrations').delete().eq('id', id);
    await loadData();
  }

  async function toggleActive(integration: ErpIntegration) {
    await supabase.from('erp_integrations').update({ is_active: !integration.is_active }).eq('id', integration.id);
    await loadData();
  }

  function generateApiKeyClient(): string {
    const prefix = 'weg_';
    const chars = 'abcdef0123456789';
    let key = '';
    for (let i = 0; i < 64; i++) key += chars[Math.floor(Math.random() * chars.length)];
    return prefix + key;
  }

  async function hashKeyClient(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const [actionLoading, setActionLoading] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ERP Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect any external ERP system to your WhatsApp gateway.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Integration
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      ) : integrations.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="py-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted">
              <Plug className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No integrations yet</p>
              <p className="text-sm text-muted-foreground">Create an integration to connect your ERP.</p>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((int) => (
            <Card key={int.id} className="border-border/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Plug className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{int.name}</CardTitle>
                      <CardDescription className="text-xs">{int.erp_name}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={int.is_active ? 'success' : 'secondary'}>
                    {int.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WhatsApp Connection</span>
                    <span className="font-medium">{int.whatsapp_connections?.name || 'Default'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Language</span>
                    <span className="font-medium">{int.default_language}</span>
                  </div>
                  {int.webhook_url && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Webhook URL</span>
                      <span className="font-medium truncate max-w-[200px]">{int.webhook_url}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => toggleActive(int)}>
                    {int.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteIntegration(int.id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ERP Integration</DialogTitle>
            <DialogDescription>Connect an external ERP system. An API key will be generated automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="int-name">Integration Name</Label>
              <Input id="int-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. LabStack Production" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="erp-name">ERP Name</Label>
              <Input id="erp-name" value={formData.erp_name} onChange={(e) => setFormData({ ...formData, erp_name: e.target.value })} placeholder="e.g. LabStack ERP" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="erp-wa">WhatsApp Connection</Label>
              <Select value={formData.whatsapp_connection_id} onValueChange={(v) => setFormData({ ...formData, whatsapp_connection_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select connection" /></SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="erp-webhook">Webhook URL (optional)</Label>
              <Input id="erp-webhook" value={formData.webhook_url} onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })} placeholder="https://erp.com/webhooks/gateway" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="erp-lang">Default Language</Label>
              <Select value={formData.default_language} onValueChange={(v) => setFormData({ ...formData, default_language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ur">Urdu</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="bn">Bengali</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createIntegration} disabled={actionLoading || !formData.name.trim() || !formData.erp_name.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create & Generate API Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Generated</DialogTitle>
            <DialogDescription>
              Copy your API key now. For security, it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
              <Key className="w-4 h-4 text-muted-foreground shrink-0" />
              <code className="text-sm font-mono flex-1 break-all">{createdKey}</code>
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(createdKey || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this key in the Authorization header as: Bearer {createdKey?.substring(0, 16)}...
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
