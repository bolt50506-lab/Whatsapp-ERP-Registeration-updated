'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TestTube, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import type { ErpIntegration, ApiKey } from '@/lib/types/database';

export default function TestEventPage() {
  const { organization } = useAuth();
  const [integrations, setIntegrations] = useState<(ErpIntegration & { api_keys: ApiKey[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState('');
  const [eventType, setEventType] = useState('patient_registered');
  const [recipient, setRecipient] = useState('+923001234567');
  const [sending, setSending] = useState(false);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([]);

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('erp_integrations')
      .select('*, api_keys(*)')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    setIntegrations(data || []);
    if (data && data.length > 0) setSelectedIntegration(data[0].id);
    setLoading(false);
  }, [organization]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function sendTestEvent() {
    if (!organization || !selectedIntegration || !recipient.trim()) return;
    setSending(true);
    setSteps([]);

    const integration = integrations.find((i) => i.id === selectedIntegration);
    if (!integration) return;

    const apiKey = integration.api_keys?.[0];
    if (!apiKey) {
      setSteps([{ label: 'No API key found for this integration', done: false }]);
      setSending(false);
      return;
    }

    const testPayload: Record<string, unknown> = {
      event: eventType,
      recipient,
      customer_name: 'Test Customer',
      patient_name: 'Test Patient',
      patient_id: 'TEST-001',
      customer_id: 'TEST-001',
      invoice_number: 'TEST-INV-001',
      invoice_amount: 'Rs. 500',
      invoice_date: new Date().toISOString().split('T')[0],
      report_number: 'TEST-REP-001',
      report_date: new Date().toISOString().split('T')[0],
      idempotency_key: `TEST-${Date.now()}`,
    };

    setSteps([{ label: 'Sending API request...', done: false }]);

    try {
      const res = await fetch('/api/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      setSteps((prev) => [...prev, { label: 'API received the request', done: true }]);

      const data = await res.json();
      setSteps((prev) => [...prev, { label: 'Message queued in database', done: data.success }]);

      if (data.success) {
        setSteps((prev) => [...prev, { label: `Message ID: ${data.message_id}`, done: true }]);
        setSteps((prev) => [...prev, { label: 'WhatsApp worker will process and send', done: true }]);
      } else {
        setSteps((prev) => [...prev, { label: `Error: ${data.error}`, done: false }]);
      }
    } catch (err) {
      setSteps((prev) => [...prev, { label: 'Network error', done: false }]);
    }
    setSending(false);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Test ERP Event</h1>
        <p className="text-muted-foreground text-sm mt-1">Simulate an ERP event to test the full pipeline.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Test Event</CardTitle>
            <CardDescription>Send a test event through the API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {integrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create an ERP integration first to test events.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Integration</Label>
                  <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {integrations.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Event Type</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patient_registered">Patient Registered</SelectItem>
                      <SelectItem value="invoice_created">Invoice Created</SelectItem>
                      <SelectItem value="report_ready">Report Ready</SelectItem>
                      <SelectItem value="custom_message">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-evt-recipient">Test Recipient</Label>
                  <Input id="test-evt-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="+923001234567" />
                </div>
                <Button onClick={sendTestEvent} disabled={sending || !recipient.trim()} className="w-full">
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TestTube className="w-4 h-4 mr-2" />}
                  Send Test Event
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Status</CardTitle>
            <CardDescription>Track the event through the system.</CardDescription>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No test sent yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {step.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-amber-500 shrink-0 animate-spin" />
                    )}
                    <span className="text-sm">{step.label}</span>
                    {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground ml-auto" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
