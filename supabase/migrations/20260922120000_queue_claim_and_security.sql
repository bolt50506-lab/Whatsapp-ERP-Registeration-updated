/*
  Queue locking and RLS hardening for the WhatsApp ERP Gateway.

  The worker uses claim_message_queue() so two worker instances cannot send the
  same queued message at the same time.
*/

CREATE OR REPLACE FUNCTION claim_message_queue(p_limit integer DEFAULT 10)
RETURNS SETOF message_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM message_queue
    WHERE status = 'queued'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY queued_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE message_queue q
  SET status = 'processing',
      attempts = q.attempts + 1,
      updated_at = now()
  FROM candidates c
  WHERE q.id = c.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_message_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_message_queue(integer) TO service_role;

CREATE INDEX IF NOT EXISTS idx_mq_claim ON message_queue(status, next_retry_at, queued_at);

-- Prevent API clients from calling worker-only queue claim RPC.
