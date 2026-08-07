import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '../utils/env.js';

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseSecretKey) {
  throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
