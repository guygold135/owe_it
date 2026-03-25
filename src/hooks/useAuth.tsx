import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useProvideAuth(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const ensuredProfileForUserRef = useRef<string | null>(null);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
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
        setUser(mapUser(session?.user ?? null));
        void ensureProfile(session?.user ?? null);
      } catch (err) {
        if (!alive) return;
        console.error('Auth bootstrap error', err);
        setUser(null);
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

  return useMemo(
    () => ({ user, loading, signUp, signIn, signInWithOAuth, signOut }),
    [user, loading],
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

