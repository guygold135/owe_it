import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { fetchFriendsBundle, type FriendsBundle } from '@/lib/fetchers/tabData';

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

  const data = query.data ?? empty;

  return {
    friends: data.friends,
    incoming: data.incoming,
    judgeRequests: data.judgeRequests,
    loading: query.isPending,
    refetch: query.refetch,
  };
}
