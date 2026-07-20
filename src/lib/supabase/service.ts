// Service-role Supabase client for scripts/seeds (BYPASSRLS).
//
// Deliberately separate from lib/supabase/server.ts, which imports next/headers
// and therefore cannot be imported from a plain `tsx` script. This module has no
// next/* imports.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

// Defense in depth: the service-role key must never ship in a client bundle.
if (typeof window !== 'undefined') {
  throw new Error('service-role client must never be imported in the browser');
}

export const createServiceRoleSupabaseClient = (): SupabaseClient<Database> => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient<Database>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
