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
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { FileText, Plus, Trash2, Edit, Loader2, Eye } from 'lucide-react';
import { renderTemplate, getTemplateVariables } from '@/lib/template';
import type { MessageTemplate } from '@/lib/types/database';

const eventOptions = [
  { value: 'patient_registered', label: 'Patient Registered' },
  { value: 'invoice_created', label: 'Invoice Created' },
  { value: 'report_ready', label: 'Report Ready' },
  { value: 'appointment_created', label: 'Appointment Created' },
  { value: 'appointment_reminder', label: 'Appointment Reminder' },
  { value: 'appointment_cancelled', label: 'Appointment Cancelled' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'payment_pending', label: 'Payment Pending' },
  { value: 'payment_failed', label: 'Payment Failed' },
  { value: 'custom_message', label: 'Custom Message' },
];

export default function TemplatesPage() {
  const { organization } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [previewData, setPreviewData] = useState({
    customer_name: 'Ali Ahmed',
    patient_name: 'Ali Ahmed',
    patient_id: 'PAT-10025',
    customer_id: 'PAT-10025',
    invoice_number: 'INV-10025',
    invoice_amount: 'Rs. 1,500',
    invoice_date: '2026-09-22',
    report_number: 'LAB-2026-00125',
    report_date: '2026-09-22',
    appointment_date: '2026-09-25',
    appointment_time: '10:00 AM',
    doctor_name: 'Dr. Smith',
    business_name: 'My Laboratory',
    secure_link: 'https://gateway.example.com/r/tk123abc',
    invoice_pdf_url: 'https://erp.example.com/invoices/123.pdf',
    report_pdf_url: 'https://erp.example.com/reports/125.pdf',
    custom_message: 'This is a custom message.',
  });
  const [formData, setFormData] = useState({
    name: '',
    event: 'patient_registered',
    language: 'en',
    message: '',
    send_pdf: false,
    send_document: false,
    send_link: false,
    is_active: true,
  });

  const loadData = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('message_templates')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    setTemplates(data || []);
    setLoading(false);
  }, [organization]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreate() {
    setEditing(null);
    setFormData({ name: '', event: 'patient_registered', language: 'en', message: '', send_pdf: false, send_document: false, send_link: false, is_active: true });
    setShowEdit(true);
  }

  function openEdit(t: MessageTemplate) {
    setEditing(t);
    setFormData({
      name: t.name,
      event: t.event,
      language: t.language,
      message: t.message,
      send_pdf: t.send_pdf,
      send_document: t.send_document,
      send_link: t.send_link,
      is_active: t.is_active,
    });
    setShowEdit(true);
  }

  async function saveTemplate() {
    if (!organization || !formData.name.trim() || !formData.message.trim()) return;
    setActionLoading(true);
    if (editing) {
      await supabase.from('message_templates').update(formData).eq('id', editing.id);
    } else {
      await supabase.from('message_templates').insert({
        ...formData,
        organization_id: organization.id,
      });
    }
    setShowEdit(false);
    await loadData();
    setActionLoading(false);
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    await supabase.from('message_templates').delete().eq('id', id);
    await loadData();
  }

  const [actionLoading, setActionLoading] = useState(false);
  const variables = getTemplateVariables();
  const previewMessage = renderTemplate(formData.message, previewData);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Message Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create reusable message templates with variables for each event type.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="py-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted">
              <FileText className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No templates yet</p>
              <p className="text-sm text-muted-foreground">Default templates were seeded on signup. Create a new one or edit existing.</p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="border-border/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <CardDescription className="text-xs">{eventOptions.find(e => e.value === t.event)?.label || t.event}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                    <Badge variant="outline" className="text-xs">{t.language}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">{t.message}</p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {t.send_pdf && <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</span>}
                  {t.send_link && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Link</span>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                    <Edit className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteTemplate(t.id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>Use variables like {'{{customer_name}}'} to insert dynamic values.</DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tmpl-name">Name</Label>
                <Input id="tmpl-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Patient Registration" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Event</Label>
                  <Select value={formData.event} onValueChange={(v) => setFormData({ ...formData, event: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eventOptions.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={formData.language} onValueChange={(v) => setFormData({ ...formData, language: v })}>
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
              <div className="space-y-2">
                <Label htmlFor="tmpl-msg">Message</Label>
                <Textarea
                  id="tmpl-msg"
                  rows={8}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Assalam-o-Alaikum {{customer_name}}, ..."
                />
              </div>
              <div className="space-y-3">
                <Label>Options</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Send PDF</span>
                  <Switch checked={formData.send_pdf} onCheckedChange={(v) => setFormData({ ...formData, send_pdf: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Send Document</span>
                  <Switch checked={formData.send_document} onCheckedChange={(v) => setFormData({ ...formData, send_document: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Send Link</span>
                  <Switch checked={formData.send_link} onCheckedChange={(v) => setFormData({ ...formData, send_link: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Active</span>
                  <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Available Variables</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {variables.map((v) => (
                    <code key={v} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{v}</code>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Live Preview</Label>
              <div className="rounded-lg border border-border/40 p-4 bg-muted/30 min-h-[300px]">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <p className="text-sm whitespace-pre-line">{previewMessage || 'Type a message to see the preview...'}</p>
                </div>
                {formData.send_pdf && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3" /> PDF attachment will be sent
                  </div>
                )}
                {formData.send_link && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Eye className="w-3 h-3" /> Secure link will be included
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={actionLoading || !formData.name.trim() || !formData.message.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
