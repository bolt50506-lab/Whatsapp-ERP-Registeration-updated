import type { ApiMessageRequest } from '@/lib/types/database';

const TEMPLATE_VAR_MAP: Record<string, keyof ApiMessageRequest> = {
  '{{customer_name}}': 'customer_name',
  '{{patient_name}}': 'patient_name',
  '{{patient_id}}': 'patient_id',
  '{{customer_id}}': 'customer_id',
  '{{invoice_number}}': 'invoice_number',
  '{{invoice_amount}}': 'invoice_amount',
  '{{invoice_date}}': 'invoice_date',
  '{{report_number}}': 'report_number',
  '{{report_date}}': 'report_date',
  '{{appointment_date}}': 'appointment_date',
  '{{appointment_time}}': 'appointment_time',
  '{{doctor_name}}': 'doctor_name',
  '{{business_name}}': 'business_name',
  '{{secure_link}}': 'secure_link',
  '{{invoice_pdf_url}}': 'invoice_pdf_url',
  '{{report_pdf_url}}': 'report_pdf_url',
  '{{custom_message}}': 'custom_message',
};

export function renderTemplate(template: string, data: Partial<ApiMessageRequest>): string {
  let result = template;
  for (const [placeholder, key] of Object.entries(TEMPLATE_VAR_MAP)) {
    const value = data[key];
    if (value !== undefined && value !== null) {
      result = result.split(placeholder).join(String(value));
    } else {
      result = result.split(placeholder).join('');
    }
  }
  return result;
}

export function getTemplateVariables(): string[] {
  return Object.keys(TEMPLATE_VAR_MAP);
}

export function buildDocumentName(event: string, data: Partial<ApiMessageRequest>): string {
  const patientId = data.patient_id || data.customer_id || 'Unknown';
  if (event === 'patient_registered' || event === 'invoice_created') {
    return `Invoice-${patientId}.pdf`;
  }
  if (event === 'report_ready') {
    const reportType = data.report_type || 'laboratory';
    const prefix = reportType === 'radiology' ? 'Radiology' : 'Report';
    return `${prefix}-${patientId}.pdf`;
  }
  return `Document-${patientId}.pdf`;
}
