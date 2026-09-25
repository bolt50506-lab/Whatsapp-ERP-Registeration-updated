'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollText, Loader2, Search, Filter } from 'lucide-react';
import type { MessageQueueItem } from '@/lib/types/database';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  queued: 'secondary',
  processing: 'outline',
  sent: 'success',
  delivered: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
};

export default function LogsPage() {
  const { organization } = useAuth();
  const [messages, setMessages] = useState<MessageQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', event: 'all', recipient: '', integration: 'all' });
  const [integrations, setIntegrations] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<MessageQueueItem | null>(null);

  const loadData = useCallback(async () => {
    if (!organization) return;
    let query = supabase
      .from('message_queue')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.event !== 'all') query = query.eq('event', filters.event);
    if (filters.recipient) query = query.ilike('recipient', `%${filters.recipient}%`);
    if (filters.integration !== 'all') query = query.eq('integration_id', filters.integration);

    const { data } = await query;
    setMessages(data || []);
    setLoading(false);

    const { data: ints } = await supabase
      .from('erp_integrations')
      .select('id, name')
      .eq('organization_id', organization.id);
    setIntegrations(ints || []);
  }, [organization, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Message Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">View and filter all messages sent through the gateway.</p>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Event</Label>
              <Select value={filters.event} onValueChange={(v) => setFilters({ ...filters, event: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="patient_registered">Patient Registered</SelectItem>
                  <SelectItem value="invoice_created">Invoice Created</SelectItem>
                  <SelectItem value="report_ready">Report Ready</SelectItem>
                  <SelectItem value="appointment_created">Appointment Created</SelectItem>
                  <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
                  <SelectItem value="appointment_cancelled">Appointment Cancelled</SelectItem>
                  <SelectItem value="payment_received">Payment Received</SelectItem>
                  <SelectItem value="payment_pending">Payment Pending</SelectItem>
                  <SelectItem value="payment_failed">Payment Failed</SelectItem>
                  <SelectItem value="custom_message">Custom Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Recipient</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={filters.recipient}
                  onChange={(e) => setFilters({ ...filters, recipient: e.target.value })}
                  placeholder="Search recipient..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Integration</Label>
              <Select value={filters.integration} onValueChange={(v) => setFilters({ ...filters, integration: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Integrations</SelectItem>
                  {integrations.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="w-4 h-4" /> Messages ({messages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages found.</p>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    onClick={() => setSelected(msg)}
                    className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer border border-border/20"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge variant={statusVariant[msg.status] || 'secondary'} className="text-xs shrink-0">{msg.status}</Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{msg.recipient}</p>
                        <p className="text-xs text-muted-foreground truncate">{msg.event} {msg.attempts > 0 && `(${msg.attempts} attempts)`}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Message Details</DialogTitle>
            <DialogDescription>{selected?.id}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant[selected.status] || 'secondary'}>{selected.status}</Badge></div>
                <div><span className="text-muted-foreground">Event:</span> <span className="font-medium">{selected.event}</span></div>
                <div><span className="text-muted-foreground">Recipient:</span> <span className="font-medium">{selected.recipient}</span></div>
                <div><span className="text-muted-foreground">Attempts:</span> <span className="font-medium">{selected.attempts} / {selected.max_attempts}</span></div>
                {selected.provider_message_id && <div><span className="text-muted-foreground">Provider ID:</span> <span className="font-medium text-xs">{selected.provider_message_id}</span></div>}
                {selected.idempotency_key && <div><span className="text-muted-foreground">Idempotency Key:</span> <span className="font-medium text-xs">{selected.idempotency_key}</span></div>}
              </div>
              {selected.message && (
                <div>
                  <span className="text-muted-foreground">Message:</span>
                  <div className="mt-1 p-3 rounded-lg bg-muted/40 whitespace-pre-line">{selected.message}</div>
                </div>
              )}
              {selected.document_url && (
                <div><span className="text-muted-foreground">Document:</span> <span className="font-medium">{selected.document_name || selected.document_url}</span></div>
              )}
              {selected.last_error && (
                <div>
                  <span className="text-destructive">Error:</span>
                  <div className="mt-1 p-3 rounded-lg bg-red-500/5 text-destructive text-xs">{selected.last_error}</div>
                </div>
              )}
              <div className="text-xs text-muted-foreground pt-2 border-t border-border/20">
                Queued: {new Date(selected.queued_at).toLocaleString()}
                {selected.sent_at && ` | Sent: ${new Date(selected.sent_at).toLocaleString()}`}
                {selected.delivered_at && ` | Delivered: ${new Date(selected.delivered_at).toLocaleString()}`}
                {selected.failed_at && ` | Failed: ${new Date(selected.failed_at).toLocaleString()}`}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
