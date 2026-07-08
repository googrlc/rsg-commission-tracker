/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { Lock, Mail, KeyRound, ShieldAlert, Loader2, LogOut } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabase';

interface AuthState {
  session: Session | null;
  email: string | null;
  loading: boolean;
  /** null = not yet checked, true/false = allowlist result */
  allowlisted: boolean | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowlisted, setAllowlisted] = useState<boolean | null>(null);

  // Ask the database whether the signed-in email is on the allowlist. The RLS
  // policies are the real enforcement; this just drives a friendly UI gate.
  const checkAllowlist = useCallback(async () => {
    const { data, error } = await supabase.rpc('is_commission_user');
    if (error) {
      console.error('Allowlist check failed:', error.message);
      setAllowlisted(false);
      return;
    }
    setAllowlisted(Boolean(data));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAllowlisted(null); // re-check on the next effect run
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) checkAllowlist();
    else setAllowlisted(null);
  }, [session, checkAllowlist]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAllowlisted(null);
  }, []);

  const value: AuthState = {
    session,
    email: session?.user?.email ?? null,
    loading,
    allowlisted,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- Screens ---------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-8">
        {children}
      </div>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'enter' | 'sent'>('enter');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Primary path: email + password. No email is sent, so it can't be throttled
  // by the auth mailer's rate limit. On success the auth listener flips the app
  // into the authenticated view.
  const signInPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Enter your work email and password.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) setError(error.message);
  };

  // Fallback path: email a magic link / 6-digit code (subject to the mailer
  // rate limit — kept as a backup for password resets or new devices).
  const sendLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your work email.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPhase('sent');
    setInfo(
      'Check your email. Click the magic link, or paste the 6-digit code below.',
    );
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError(error.message);
    // On success the auth listener flips the app into the authenticated view.
  };

  return (
    <Shell>
      <div className="flex items-center gap-2.5 mb-6">
        <div className="p-2 bg-blue-600 rounded-lg text-white">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            RSG Commission Command
          </h1>
          <p className="text-xs text-slate-500">Risk Solutions Group · secure login</p>
        </div>
      </div>

      {phase === 'enter' ? (
        <form onSubmit={signInPassword} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Work email</span>
            <div className="mt-1 flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
              <Mail className="w-4 h-4 text-slate-400" />
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@risksolutionsgroup.net"
                autoComplete="username"
                className="flex-1 outline-none text-sm text-slate-900"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Password</span>
            <div className="mt-1 flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
              <KeyRound className="w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="flex-1 outline-none text-sm text-slate-900"
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
          <button
            type="button"
            onClick={() => sendLink()}
            disabled={busy}
            className="w-full text-xs text-slate-500 hover:text-slate-700"
          >
            Email me a login link instead
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              6-digit code (optional if you clicked the link)
            </span>
            <input
              inputMode="numeric"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm tracking-widest text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify code
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('enter');
              setToken('');
              setInfo(null);
            }}
            className="w-full text-xs text-slate-500 hover:text-slate-700"
          >
            ← use a different email
          </button>
        </form>
      )}

      {info && <p className="mt-4 text-xs text-emerald-600">{info}</p>}
      {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
      <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
        Access is restricted to authorized Risk Solutions Group staff. Client
        names, premiums, and income are not public.
      </p>
    </Shell>
  );
}

function NotAuthorized() {
  const { email, signOut } = useAuth();
  return (
    <Shell>
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <ShieldAlert className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-mono">{email}</span> is signed in but is not on
          the Commission Command allowlist. Ask Lamar to add you.
        </p>
        <button
          onClick={signOut}
          className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </Shell>
  );
}

function ConfigError() {
  return (
    <Shell>
      <h1 className="text-lg font-bold text-slate-900">Configuration needed</h1>
      <p className="mt-2 text-sm text-slate-600">
        Supabase is not configured. Set{' '}
        <code className="text-xs bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code>{' '}
        and{' '}
        <code className="text-xs bg-slate-100 px-1 rounded">
          VITE_SUPABASE_PUBLISHABLE_KEY
        </code>{' '}
        (see <code className="text-xs">.env.example</code>) and rebuild.
      </p>
    </Shell>
  );
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
    </div>
  );
}

/** Renders children only for an authenticated, allowlisted user. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, allowlisted } = useAuth();

  if (!isSupabaseConfigured) return <ConfigError />;
  if (loading) return <FullScreenLoader />;
  if (!session) return <LoginScreen />;
  if (allowlisted === null) return <FullScreenLoader />;
  if (!allowlisted) return <NotAuthorized />;
  return <>{children}</>;
}
