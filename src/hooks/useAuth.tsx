import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { decodeJwtPayload } from '@/lib/jwtPayload';
import {
  clearPendingPasswordRecoveryFlag,
  hasPendingPasswordRecoveryFlag,
} from '@/lib/sessionBootstrap';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  passwordRecoveryPending: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** True when the current URL is a Supabase password-recovery redirect (hash or query). */
function urlHasRecoveryType(): boolean {
  if (typeof window === 'undefined') return false;
  const { hash, search } = window.location;
  return hash.includes('type=recovery') || search.includes('type=recovery');
}

/**
 * Recovery sessions use `amr` as string[] (RFC) or AMREntry[] with `method: 'recovery'`.
 * JWTs use base64url — must not use raw atob(token.split('.')[1]).
 */
function sessionAccessTokenIndicatesPasswordRecovery(session: { access_token?: string } | null): boolean {
  const token = session?.access_token;
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  let amr: unknown = payload.amr;
  if (typeof amr === 'string') {
    try {
      amr = JSON.parse(amr);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(amr)) return false;
  for (const entry of amr) {
    if (entry === 'recovery') return true;
    if (entry && typeof entry === 'object' && 'method' in entry) {
      if ((entry as { method: string }).method === 'recovery') return true;
    }
  }
  return false;
}

function useProvideAuth(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(
    () => urlHasRecoveryType() || hasPendingPasswordRecoveryFlag(),
  );
  const ensuredProfileForUserRef = useRef<string | null>(null);
  const recoveryFromUrlRef = useRef(urlHasRecoveryType() || hasPendingPasswordRecoveryFlag());

  useEffect(() => {
    let alive = true;

    const ensureProfile = async (u: any | null) => {
      if (!u?.id) return;
      if (ensuredProfileForUserRef.current === u.id) return;
      ensuredProfileForUserRef.current = u.id;
      const displayName =
        u.user_metadata?.display_name ||
        u.raw_user_meta_data?.display_name ||
        (u.email ? String(u.email).split('@')[0] : '');

      const { error } = await supabase.from('profiles').upsert(
        {
          id: u.id,
          display_name: displayName ?? '',
          avatar_url: null,
        } as any,
        { onConflict: 'id' } as any
      );

      if (error) {
        // Profile creation shouldn't block auth; log for debugging.
        console.error('Error ensuring profile', error);
      }
    };

    const mapUser = (u: any | null): AuthUser | null => {
      if (!u) return null;
      return {
        id: u.id,
        email: u.email ?? '',
        displayName:
          u.user_metadata?.display_name ||
          u.raw_user_meta_data?.display_name ||
          undefined,
      };
    };

    const applyRecoveryDetection = (session: Session | null) => {
      if (!session?.user) return;
      const fromJwt = sessionAccessTokenIndicatesPasswordRecovery(session);
      const fromFlag = hasPendingPasswordRecoveryFlag();
      const fromRef = recoveryFromUrlRef.current;
      if (fromJwt || fromFlag || fromRef) {
        setPasswordRecoveryPending(true);
        recoveryFromUrlRef.current = false;
        clearPendingPasswordRecoveryFlag();
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT') {
        setPasswordRecoveryPending(false);
        recoveryFromUrlRef.current = false;
        clearPendingPasswordRecoveryFlag();
        setUser(null);
        void ensureProfile(null);
        setLoading(false);
        return;
      }
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setPasswordRecoveryPending(true);
        recoveryFromUrlRef.current = false;
        clearPendingPasswordRecoveryFlag();
      } else if (session?.user) {
        applyRecoveryDetection(session);
      }
      setUser(mapUser(session?.user ?? null));
      void ensureProfile(session?.user ?? null);
      setLoading(false);
    });

    const getSessionWithTimeout = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('getSession timeout')), 6000);
          }),
        ]);
        if (!alive) return;
        const session = (result as Awaited<ReturnType<typeof supabase.auth.getSession>>).data.session;
        if (session?.user) {
          applyRecoveryDetection(session);
        } else if (recoveryFromUrlRef.current || hasPendingPasswordRecoveryFlag()) {
          setPasswordRecoveryPending(false);
          recoveryFromUrlRef.current = false;
          clearPendingPasswordRecoveryFlag();
        }
        setUser(mapUser(session?.user ?? null));
        void ensureProfile(session?.user ?? null);
      } catch (err) {
        if (!alive) return;
        console.error('Auth bootstrap error', err);
        setUser(null);
        setPasswordRecoveryPending(false);
        recoveryFromUrlRef.current = false;
        clearPendingPasswordRecoveryFlag();
      } finally {
        if (alive) setLoading(false);
      }
    };

    void getSessionWithTimeout();

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    // First try to sign the user up.
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    // If Supabase says the user is already registered or email rate-limited,
    // fall back to a normal sign-in so the user can still get in.
    const shouldFallbackToSignIn =
      signUpError &&
      typeof signUpError.message === 'string' &&
      (
        signUpError.message.toLowerCase().includes('already registered') ||
        signUpError.message.toLowerCase().includes('rate limit') ||
        signUpError.message.toLowerCase().includes('over_email_send_rate_limit')
      );

    if (signUpError && !shouldFallbackToSignIn) {
      throw signUpError;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      throw signInError;
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const sendPasswordResetEmail = async (email: string) => {
    const trimmed = email.trim();
    // Use site root on web so the link is https://domain/#tokens — always serves index.html (avoids static-host 404 on /auth).
    const redirectTo = Capacitor.isNativePlatform()
      ? `${window.location.origin}/#/auth`
      : `${window.location.origin}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setPasswordRecoveryPending(false);
    clearPendingPasswordRecoveryFlag();
  };

  return useMemo(
    () => ({
      user,
      loading,
      passwordRecoveryPending,
      signUp,
      signIn,
      signInWithOAuth,
      signOut,
      sendPasswordResetEmail,
      updatePassword,
    }),
    [user, loading, passwordRecoveryPending],
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useProvideAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

