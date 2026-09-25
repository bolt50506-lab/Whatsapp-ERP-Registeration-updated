/*
# Create organization setup RPC function

## Overview
Creates a SECURITY DEFINER function that creates an organization and adds the
user as an admin member. This is needed because new users don't have an
organization yet, and RLS prevents them from inserting into organizations
until they're a member (chicken-and-egg problem).

## New Functions
- create_organization_for_user(p_user_id, p_org_name) → uuid
  Creates an organization with the given name, adds the user as admin member,
  seeds default settings and templates, returns the organization ID.

## Security
- SECURITY DEFINER so it can insert into organizations and org_members
  on behalf of a newly-registered user who doesn't yet have any org membership.
- Only callable by authenticated users.
- The function verifies the calling user matches p_user_id.
*/

CREATE OR REPLACE FUNCTION create_organization_for_user(p_user_id uuid, p_org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot create organization for another user';
  END IF;

  INSERT INTO organizations (name) VALUES (p_org_name) RETURNING id INTO v_org_id;

  INSERT INTO org_members (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'admin');

  INSERT INTO settings (organization_id, key, value) VALUES
    (v_org_id, 'messaging', '{"welcome_enabled": true, "invoice_enabled": true, "report_ready_enabled": true, "send_report_pdf": true, "send_secure_link": true, "secure_link_expiration_hours": 72, "retry_attempts": 5, "default_language": "en", "default_country": "PK", "business_name": ""}'::jsonb),
    (v_org_id, 'general', '{"default_country_code": "PK"}'::jsonb);

  INSERT INTO message_templates (organization_id, name, event, language, message, send_pdf, send_link) VALUES
    (v_org_id, 'Patient Registration', 'patient_registered', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nThank you for registering with our laboratory.\n\nYour registration has been completed successfully.\n\nPatient ID: {{patient_id}}\n\nYour invoice is attached.\n\nThank you.', true, false),
    (v_org_id, 'Invoice Created', 'invoice_created', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nYour invoice {{invoice_number}} has been generated.\n\nInvoice Date: {{invoice_date}}\n\nYour invoice is attached.\n\nThank you.', true, false),
    (v_org_id, 'Laboratory Report Ready', 'report_ready', 'en', 'Assalam-o-Alaikum {{patient_name}},\n\nYour laboratory report {{report_number}} is now ready.\n\nYou can securely view your report here:\n{{secure_link}}\n\nThank you.', false, true),
    (v_org_id, 'Radiology Report Ready', 'report_ready', 'en', 'Assalam-o-Alaikum {{patient_name}},\n\nYour radiology report {{report_number}} is now ready.\n\nYou can securely view your report here:\n{{secure_link}}\n\nThank you.', false, true),
    (v_org_id, 'Appointment Created', 'appointment_created', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nYour appointment has been scheduled.\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\nDoctor: {{doctor_name}}\n\nThank you.', false, false),
    (v_org_id, 'Appointment Reminder', 'appointment_reminder', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nThis is a reminder for your appointment on {{appointment_date}} at {{appointment_time}}.\n\nThank you.', false, false),
    (v_org_id, 'Appointment Cancelled', 'appointment_cancelled', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nYour appointment on {{appointment_date}} at {{appointment_time}} has been cancelled.\n\nPlease contact us to reschedule.\n\nThank you.', false, false),
    (v_org_id, 'Payment Received', 'payment_received', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nWe have received your payment for invoice {{invoice_number}}.\n\nAmount: {{invoice_amount}}\n\nThank you for your payment.', false, false),
    (v_org_id, 'Payment Pending', 'payment_pending', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nYour payment for invoice {{invoice_number}} is pending.\n\nAmount: {{invoice_amount}}\n\nPlease make the payment at your earliest convenience.\n\nThank you.', false, false),
    (v_org_id, 'Payment Failed', 'payment_failed', 'en', 'Assalam-o-Alaikum {{customer_name}},\n\nYour payment for invoice {{invoice_number}} has failed.\n\nAmount: {{invoice_amount}}\n\nPlease try again or contact us for assistance.\n\nThank you.', false, false),
    (v_org_id, 'Custom Message', 'custom_message', 'en', '{{custom_message}}', false, false);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_for_user TO authenticated;
