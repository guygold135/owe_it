import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { fetchFriendsBundle, type FriendsBundle } from '@/lib/fetchers/tabData';
import { supabase } from '@/integrations/supabase/client';

const empty: FriendsBundle = { friends: [], incoming: [], judgeRequests: [] };
const FRIENDS_TIMEOUT_MS = 7000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

export function useFriendsData() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.friends(userId ?? ''),
    queryFn: async () => {
      try {
        return await withTimeout(fetchFriendsBundle(userId!), FRIENDS_TIMEOUT_MS, 'friends');
      } catch (e) {
        console.error('Error loading friends data', e);
        return empty;
      }
    },
    enabled: !!userId && !authLoading,
    retry: false,
  });

  useEffect(() => {
    if (!userId) return;

    const tick = () => {
      if (document.visibilityState === 'visible') void query.refetch();
    };
    const intervalId = window.setInterval(tick, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userId, query]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`friends_bundle_refresh_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          void query.refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          void query.refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_requests' },
        () => {
          void query.refetch();
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Friends data realtime channel error', err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, query]);

  const data = query.data ?? empty;

  return {
    friends: data.friends,
    incoming: data.incoming,
    judgeRequests: data.judgeRequests,
    loading: query.isPending,
    refetch: query.refetch,
  };
}
