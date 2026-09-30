import { createClient } from '@supabase/supabase-js';

const env = process.env as Record<string, string | undefined>;
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://ozlovfaxljojheykroax.supabase.co';
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
