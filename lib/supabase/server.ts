import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://ozlovfaxljojheykroax.supabase.co';

const runtimeEnv = () => process.env;
const supabaseServiceKey = runtimeEnv()['SUPABASE_' + 'SERVICE_ROLE_KEY'];

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
