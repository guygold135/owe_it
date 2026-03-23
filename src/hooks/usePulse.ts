import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { fetchPulseItems } from '@/lib/fetchers/tabData';

const PULSE_TIMEOUT_MS = 7000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

export function usePulse() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.pulse(userId ?? ''),
    queryFn: async () => {
      try {
        return await withTimeout(fetchPulseItems(userId!), PULSE_TIMEOUT_MS, 'pulse');
      } catch (e) {
        console.error('Error loading pulse', e);
        return [];
      }
    },
    enabled: !!userId && !authLoading,
    retry: false,
  });

  return {
    items: query.data ?? [],
    loading: query.isPending,
  };
}
