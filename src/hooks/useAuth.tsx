import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ensureProfile = async (u: any | null) => {
      if (!u?.id) return;
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
      setUser(mapUser(session?.user ?? null));
      void ensureProfile(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(mapUser(session?.user ?? null));
      void ensureProfile(session?.user ?? null);
      setLoading(false);
    });

    return () => {
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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return { user, loading, signUp, signIn, signOut };
}

