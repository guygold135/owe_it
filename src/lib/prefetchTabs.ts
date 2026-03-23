import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchFriendsBundle, fetchGoalsAsJudge, fetchPulseItems, fetchUserGoals } from '@/lib/fetchers/tabData';

export function prefetchGoalsTab(queryClient: QueryClient, userId: string) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.goals(userId),
    queryFn: () => fetchUserGoals(userId),
  });
}

export function prefetchMyJudgesTab(queryClient: QueryClient, userId: string) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.goalsAsJudge(userId),
    queryFn: () => fetchGoalsAsJudge(userId),
  });
}

export function prefetchPulseTab(queryClient: QueryClient, userId: string) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.pulse(userId),
    queryFn: () => fetchPulseItems(userId),
  });
}

export function prefetchFriendsTab(queryClient: QueryClient, userId: string) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.friends(userId),
    queryFn: () => fetchFriendsBundle(userId),
  });
}

export function prefetchPath(queryClient: QueryClient, pathname: string, userId: string | undefined) {
  if (!userId) return;
  switch (pathname) {
    case '/':
      return prefetchGoalsTab(queryClient, userId);
    case '/my-judges':
      return prefetchMyJudgesTab(queryClient, userId);
    case '/pulse':
      return prefetchPulseTab(queryClient, userId);
    case '/friends':
      return prefetchFriendsTab(queryClient, userId);
    default:
      return;
  }
}
