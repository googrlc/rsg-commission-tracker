/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

// Both the URL and the *publishable* key are safe to ship in client code — the
// publishable key is designed for browsers and is protected by Row Level
// Security. The service_role key must NEVER appear here or anywhere in the
// frontend/git (guardrail #4). It is injected at build time by vite.config.ts,
// which bridges either the VITE_-prefixed names or the plain SUPABASE_* names
// (matching the AI Studio secret panel).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);

if (!isSupabaseConfigured) {
  // Surfaced by AuthGate as a friendly config error rather than a white screen.
  console.error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).',
  );
}

export const supabase = createClient(
  SUPABASE_URL ?? 'http://missing.local',
  SUPABASE_PUBLISHABLE_KEY ?? 'missing',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
