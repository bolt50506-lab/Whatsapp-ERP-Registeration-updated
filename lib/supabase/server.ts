import { createClient } from '@supabase/supabase-js';

// The shared hosted Supabase project is the source of truth for this deployment.
// SUPABASE_SERVICE_ROLE_KEY must be configured in Netlify for server-side writes.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ozlovfaxljojheykroax.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
