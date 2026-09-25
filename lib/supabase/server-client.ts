import { createClient } from '@supabase/supabase-js';

// Public Supabase project URL fallback for Netlify build-time execution.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kawbiypmfluamxyinezt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
