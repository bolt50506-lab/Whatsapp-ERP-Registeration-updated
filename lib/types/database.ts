export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'qr_required' | 'error';
export type WhatsAppProvider = 'baileys' | 'whatsapp_cloud';
export type MessageStatus = 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'cancelled';
export type ReportType = 'laboratory' | 'radiology' | 'general';
export type OrgRole = 'admin' | 'member';

export type EventType =
  | 'patient_registered'
  | 'invoice_created'
  | 'report_ready'
  | 'appointment_created'
  | 'appointment_reminder'
  | 'appointment_cancelled'
  | 'payment_received'
  | 'payment_pending'
  | 'payment_failed'
  | 'custom_message';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface WhatsAppConnection {
  id: string;
  organization_id: string;
  name: string;
  phone_number: string | null;
  provider: WhatsAppProvider;
  provider_session_id: string | null;
  status: ConnectionStatus;
  last_connected_at: string | null;
  last_seen_at: string | null;
  qr_data: string | null;
  cloud_waba_id?: string | null;
  cloud_phone_number_id?: string | null;
  cloud_access_token?: string | null;
  cloud_verify_token?: string | null;
  cloud_app_secret?: string | null;
  cloud_api_version?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErpIntegration {
  id: string;
  organization_id: string;
  name: string;
  erp_name: string;
  whatsapp_connection_id: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  default_language: string;
  default_template_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  organization_id: string;
  integration_id: string | null;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface MessageTemplate {
  id: string;
  organization_id: string;
  name: string;
  event: string;
  language: string;
  message: string;
  send_pdf: boolean;
  send_document: boolean;
  send_link: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageQueueItem {
  id: string;
  organization_id: string;
  whatsapp_connection_id: string | null;
  integration_id: string | null;
  event: string;
  recipient: string;
  message: string | null;
  document_url: string | null;
  document_name: string | null;
  status: MessageStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageLog {
  id: string;
  organization_id: string;
  message_id: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
}

export interface WebhookLog {
  id: string;
  organization_id: string;
  integration_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  created_at: string;
}

export interface ConnectionLog {
  id: string;
  organization_id: string;
  whatsapp_connection_id: string;
  event: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface ReportDeliveryToken {
  id: string;
  organization_id: string;
  message_id: string;
  token: string;
  report_url: string;
  report_type: ReportType;
  expires_at: string;
  is_one_time: boolean;
  used_at: string | null;
  created_at: string;
}

export interface Setting {
  id: string;
  organization_id: string;
  key: string;
  value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  connectionStatus: ConnectionStatus;
  connectedNumber: string | null;
  connectionUptime: string | null;
  messagesSentToday: number;
  messagesFailedToday: number;
  messagesPending: number;
  apiRequestsToday: number;
  lastConnection: string | null;
  workerStatus: 'online' | 'offline';
}

export interface ApiMessageRequest {
  event: EventType;
  recipient: string;
  customer_name?: string;
  patient_name?: string;
  customer_id?: string;
  patient_id?: string;
  invoice_number?: string;
  invoice_amount?: string;
  invoice_date?: string;
  invoice_pdf_url?: string;
  report_number?: string;
  report_date?: string;
  report_type?: ReportType;
  report_pdf_url?: string;
  secure_link?: string;
  appointment_date?: string;
  appointment_time?: string;
  doctor_name?: string;
  business_name?: string;
  custom_message?: string;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface ApiMessageResponse {
  success: boolean;
  message_id?: string;
  status: MessageStatus;
  error?: string;
  duplicate?: boolean;
}
