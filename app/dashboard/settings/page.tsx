'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings as SettingsIcon, Save, Loader2, Check } from 'lucide-react';
import { getCountryList } from '@/lib/phone';

export default function SettingsPage() {
  const { organization } = useAuth();
  const [settings, setSettings] = useState({
    welcome_enabled: true,
    invoice_enabled: true,
    report_ready_enabled: true,
    send_report_pdf: true,
    send_secure_link: true,
    secure_link_expiration_hours: 72,
    retry_attempts: 5,
    default_language: 'en',
    default_country: 'PK',
    business_name: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('settings')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('key', 'messaging')
      .maybeSingle();

    if (data?.value) {
      setSettings((prev) => ({ ...prev, ...(data.value as Record<string, unknown>) as typeof prev }));
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveSettings() {
    if (!organization) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('key', 'messaging')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('settings')
        .update({ value: settings as unknown as Record<string, unknown> })
        .eq('id', existing.id);
    } else {
      await supabase.from('settings').insert({
        organization_id: organization.id,
        key: 'messaging',
        value: settings as unknown as Record<string, unknown>,
      });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  const countries = getCountryList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your messaging and organization settings.</p>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-emerald-500" />
            Messaging Settings
          </CardTitle>
          <CardDescription>Control which automatic messages are sent and how.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Automatic Messages</h3>
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <div>
                <p className="text-sm">Welcome message</p>
                <p className="text-xs text-muted-foreground">Send when a patient/customer is registered</p>
              </div>
              <Switch checked={settings.welcome_enabled} onCheckedChange={(v) => setSettings({ ...settings, welcome_enabled: v })} />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <div>
                <p className="text-sm">Invoice message</p>
                <p className="text-xs text-muted-foreground">Send when an invoice is created</p>
              </div>
              <Switch checked={settings.invoice_enabled} onCheckedChange={(v) => setSettings({ ...settings, invoice_enabled: v })} />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <div>
                <p className="text-sm">Report-ready message</p>
                <p className="text-xs text-muted-foreground">Send when a lab/radiology report is ready</p>
              </div>
              <Switch checked={settings.report_ready_enabled} onCheckedChange={(v) => setSettings({ ...settings, report_ready_enabled: v })} />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Report Delivery</h3>
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <div>
                <p className="text-sm">Send report PDF</p>
                <p className="text-xs text-muted-foreground">Attach the PDF when sending report-ready messages</p>
              </div>
              <Switch checked={settings.send_report_pdf} onCheckedChange={(v) => setSettings({ ...settings, send_report_pdf: v })} />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <div>
                <p className="text-sm">Send secure report link</p>
                <p className="text-xs text-muted-foreground">Include an expiring secure link in the message</p>
              </div>
              <Switch checked={settings.send_secure_link} onCheckedChange={(v) => setSettings({ ...settings, send_secure_link: v })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-exp">Secure link expiration (hours)</Label>
              <Input id="link-exp" type="number" value={settings.secure_link_expiration_hours} onChange={(e) => setSettings({ ...settings, secure_link_expiration_hours: parseInt(e.target.value) || 72 })} />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Retry & Delivery</h3>
            <div className="space-y-2">
              <Label htmlFor="retry">Retry attempts</Label>
              <Input id="retry" type="number" min={1} max={10} value={settings.retry_attempts} onChange={(e) => setSettings({ ...settings, retry_attempts: parseInt(e.target.value) || 5 })} />
              <p className="text-xs text-muted-foreground">How many times to retry failed messages (exponential backoff)</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Localization</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Language</Label>
                <Select value={settings.default_language} onValueChange={(v) => setSettings({ ...settings, default_language: v })}>
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
              <div className="space-y-2">
                <Label>Default Country</Label>
                <Select value={settings.default_country} onValueChange={(v) => setSettings({ ...settings, default_country: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name} (+{c.dialCode})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Business</h3>
            <div className="space-y-2">
              <Label htmlFor="biz-name">Business Name</Label>
              <Input id="biz-name" value={settings.business_name} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} placeholder="My Laboratory" />
              <p className="text-xs text-muted-foreground">Used in the {'{{business_name}}'} template variable</p>
            </div>
          </div>

          <Button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : saved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
