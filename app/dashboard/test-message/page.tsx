'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { WhatsAppConnection } from '@/lib/types/database';

export default function TestMessagePage() {
  const { organization } = useAuth();
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [formData, setFormData] = useState({
    whatsapp_connection_id: '',
    recipient: '',
    message: 'This is a test message from WhatsApp ERP Gateway.',
    document_url: '',
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    setConnections(data || []);
    if (data && data.length > 0 && !formData.whatsapp_connection_id) {
      setFormData((prev) => ({ ...prev, whatsapp_connection_id: data[0].id }));
    }
  }, [organization]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function sendTest() {
    if (!organization || !formData.recipient.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'custom_message',
          recipient: formData.recipient,
          custom_message: formData.message,
          invoice_pdf_url: formData.document_url || undefined,
          _test: true,
          _connection_id: formData.whatsapp_connection_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `Message queued with ID: ${data.message_id}` });
      } else {
        setResult({ success: false, message: data.error || 'Failed to send message' });
      }
    } catch (err) {
      setResult({ success: false, message: 'Network error' });
    }
    setSending(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Test Message</h1>
        <p className="text-muted-foreground text-sm mt-1">Send a test WhatsApp message to verify your connection.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Send Test Message</CardTitle>
            <CardDescription>Choose a connection and enter a recipient number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>WhatsApp Connection</Label>
              <Select value={formData.whatsapp_connection_id} onValueChange={(v) => setFormData({ ...formData, whatsapp_connection_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select connection" /></SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-recipient">Recipient</Label>
              <Input id="test-recipient" value={formData.recipient} onChange={(e) => setFormData({ ...formData, recipient: e.target.value })} placeholder="+923001234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-msg">Message</Label>
              <Textarea id="test-msg" rows={4} value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-doc">Optional PDF URL</Label>
              <Input id="test-doc" value={formData.document_url} onChange={(e) => setFormData({ ...formData, document_url: e.target.value })} placeholder="https://example.com/doc.pdf" />
            </div>
            <Button onClick={sendTest} disabled={sending || !formData.recipient.trim()} className="w-full">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Test
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Result</CardTitle>
            <CardDescription>Real-time result of your test message.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No test sent yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                  <Badge variant={result.success ? 'success' : 'destructive'}>
                    {result.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
                <p className="text-sm">{result.message}</p>
                {result.success && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>The message has been queued. The WhatsApp worker will process and send it. Check the Message Logs page for delivery status.</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
