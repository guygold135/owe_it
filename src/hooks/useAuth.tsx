import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { decodeJwtPayload } from '@/lib/jwtPayload';
import {
  clearPendingPasswordRecoveryFlag,
  hasPendingPasswordRecoveryFlag,
} from '@/lib/sessionBootstrap';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isElevenDigitDisplayName } from '@/lib/displayName';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
  /** From user_metadata; used to open the first-run app tutorial. */
  needsAppTutorial?: boolean;
};

/**
 * `confirm_email` — new user; must confirm via link.
 * `repeat_signup` — email already registered; Supabase does not send another signup confirmation on this request (see `user_repeated_signup` in logs).
 */
export type SignUpOutcome = 'signed_in' | 'confirm_email' | 'repeat_signup';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  passwordRecoveryPending: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<SignUpOutcome>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  resendSignupConfirmation: (email: string) => Promise<void>;
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

      // Do not set avatar_url here — it would overwrite the user's saved photo on every session refresh.
      const { error } = await supabase.from('profiles').upsert(
        {
          id: u.id,
          display_name: displayName ?? '',
        } as any,
        { onConflict: 'id' } as any
      );

      if (error) {
        // Profile creation shouldn't block auth; log for debugging.
        console.error('Error ensuring profile', error);
        return;
      }

      // OAuth (and similar) signups do not pass needs_app_tutorial in signUp options. If the profile is brand new and
      // the tutorial has not been completed, set metadata so AppTutorial can pick it up after USER_UPDATED.
      const alreadyMeta = u.user_metadata?.needs_app_tutorial === true;
      if (!alreadyMeta) {
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('app_tutorial_done_at, created_at')
          .eq('id', u.id)
          .maybeSingle();

        if (!profErr && prof && (prof as { app_tutorial_done_at?: string | null }).app_tutorial_done_at == null) {
          const createdRaw = (prof as { created_at?: string }).created_at;
          const createdMs = createdRaw ? new Date(createdRaw).getTime() : 0;
          const isFreshProfile =
            createdMs > 0 && !Number.isNaN(createdMs) && Date.now() - createdMs < 5 * 60 * 1000;
          if (isFreshProfile) {
            const { error: metaErr } = await supabase.auth.updateUser({ data: { needs_app_tutorial: true } });
            if (metaErr) console.error('Error setting tutorial metadata', metaErr);
          }
        }
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
        needsAppTutorial: u.user_metadata?.needs_app_tutorial === true,
      };
    };

    /**
     * Controls whether this *tab* should show PasswordRecoveryScreen.
     *
     * - `hasPendingPasswordRecoveryFlag()` / `recoveryFromUrlRef.current` are only set in the tab
     *   that visited the recovery link (captured in `src/lib/sessionBootstrap.ts` before React runs).
     * - Some auth artifacts are shared across tabs (Supabase session storage). When a recovery
     *   session appears in other tabs, we sign those tabs out instead of flipping their UI.
     */
    const applyRecoveryDetection = (session: Session | null): boolean => {
      if (!session?.user) return true;
      const fromJwt = sessionAccessTokenIndicatesPasswordRecovery(session);
      const fromFlag = hasPendingPasswordRecoveryFlag();
      const fromRef = recoveryFromUrlRef.current;

      // This tab explicitly came from a recovery link: show the recovery UI and keep the
      // pending flag until the user actually updates their password.
      if (fromFlag || fromRef) {
        setPasswordRecoveryPending(true);
        recoveryFromUrlRef.current = false; // consume in-memory intent; keep sessionStorage flag
        return true;
      }

      // Another tab picked up a recovery session but wasn't started via the recovery link:
      // prevent it from being treated as "signed in".
      if (fromJwt) {
        setPasswordRecoveryPending(false);
        recoveryFromUrlRef.current = false;
        clearPendingPasswordRecoveryFlag();
        setUser(null);
        void ensureProfile(null);
        void supabase.auth.signOut();
        return false;
      }

      // Normal session for this tab.
      setPasswordRecoveryPending(false);
      return true;
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
      if (session?.user) {
        const ok = applyRecoveryDetection(session);
        if (!ok) {
          setLoading(false);
          return;
        }
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
          const ok = applyRecoveryDetection(session);
          if (!ok) return;
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

  const authEmailRedirectTo = () =>
    Capacitor.isNativePlatform()
      ? `${window.location.origin}/#/`
      : `${window.location.origin}/`;

  const signUp = async (email: string, password: string, displayName?: string) => {
    const trimmedName = String(displayName ?? '').trim();
    if (!trimmedName) {
      throw new Error('Display name is required.');
    }
    if (isElevenDigitDisplayName(trimmedName)) {
      throw new Error(
        'Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.',
      );
    }
    const { data: isAvailable, error: availabilityError } = await supabase.rpc('is_display_name_available', {
      p_display_name: trimmedName,
      p_exclude_user_id: null,
    });
    if (availabilityError) {
      throw availabilityError;
    }
    if (!isAvailable) {
      throw new Error('That username is already taken. Please choose another.');
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: trimmedName },
        emailRedirectTo: authEmailRedirectTo(),
      },
    });

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

    if (signUpError && shouldFallbackToSignIn) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      return 'signed_in';
    }

    if (!data?.user) {
      throw new Error('Sign up failed.');
    }
    if (data.session) {
      return 'signed_in';
    }
    // Duplicate signup: same email already exists — GoTrue logs `user_repeated_signup` and does not send another confirmation email.
    const identities = data.user.identities ?? [];
    if (identities.length === 0) {
      return 'repeat_signup';
    }
    return 'confirm_email';
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    const u = data.user;
    if (!u) return;
    // If Supabase allows sessions before confirmation, block until email_confirmed_at is set (email provider only).
    const usesEmailProvider =
      u.identities?.some((i) => i.provider === 'email') ||
      u.app_metadata?.provider === 'email';
    if (usesEmailProvider && !u.email_confirmed_at) {
      await supabase.auth.signOut();
      throw new Error(
        'Confirm your email before signing in. Check your inbox and spam folder, or use “Resend confirmation email” below.',
      );
    }
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
    const redirectTo = Capacitor.isNativePlatform()
      ? `${window.location.origin}/#/auth`
      : `${window.location.origin}/`;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    if (error) throw error;
  };

  const resendSignupConfirmation = async (email: string) => {
    const trimmed = email.trim();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: trimmed,
      options: { emailRedirectTo: authEmailRedirectTo() },
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setPasswordRecoveryPending(false);
    clearPendingPasswordRecoveryFlag();
    recoveryFromUrlRef.current = false;
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
      resendSignupConfirmation,
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

