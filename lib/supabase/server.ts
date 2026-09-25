import { createClient } from '@supabase/supabase-js';

// Netlify's build environment has intermittently omitted NEXT_PUBLIC_SUPABASE_URL.
// The Supabase project URL is public configuration, so keep a safe fallback here
// while still preferring the environment variable in normal deployments.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kawbiypmfluamxyinezt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
