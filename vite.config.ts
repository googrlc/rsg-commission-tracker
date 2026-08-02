import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // Load every env var (no prefix filter) so we can bridge both the VITE_-prefixed
  // names and the plain SUPABASE_* names that the AI Studio Secrets panel injects.
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
  // Optional silent auto-sign-in for the PRIVATE (Tailscale-only) build. Empty in
  // any public build → the normal login gate shows. process.env fallback covers
  // Docker ENV / build args. RLS still enforces access via this account.
  const autologinEmail =
    env.VITE_AUTOLOGIN_EMAIL || process.env.VITE_AUTOLOGIN_EMAIL || '';
  const autologinPassword =
    env.VITE_AUTOLOGIN_PASSWORD || process.env.VITE_AUTOLOGIN_PASSWORD || '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Only the publishable key + URL are exposed — both are browser-safe.
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
      'import.meta.env.VITE_AUTOLOGIN_EMAIL': JSON.stringify(autologinEmail),
      'import.meta.env.VITE_AUTOLOGIN_PASSWORD': JSON.stringify(autologinPassword),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Statement writes go to the commission service (backend/), never straight
      // to Supabase. Proxying keeps it same-origin: no CORS, and the API is not
      // a separate address anyone has to reach or secure.
      proxy: {
        '/api/finance': {
          target: env.FINANCE_API_URL || 'http://127.0.0.1:8801',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/finance/, ''),
        },
      },
    },
  };
});
