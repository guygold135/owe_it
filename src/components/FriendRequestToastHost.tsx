import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsData } from '@/hooks/useFriendsData';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Shows a lightweight in-app toast when a new incoming friend request appears.
 * Initial pending requests are treated as already known, so only newly arrived ones notify.
 */
export function FriendRequestToastHost() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { incoming, loading, refetch } = useFriendsData();
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const invalidate = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.pulse(userId) });
  }, [queryClient, userId]);

  useEffect(() => {
    if (loading) return;

    const nextIds = new Set(incoming.map((request) => request.id));
    if (!initializedRef.current) {
      knownIdsRef.current = nextIds;
      initializedRef.current = true;
      return;
    }

    incoming.forEach((request) => {
      if (knownIdsRef.current.has(request.id)) return;

      const requesterName = request.fromProfile?.display_name?.trim() || 'Someone';
      toast.message('New friend request', {
        id: `friend-request-${request.id}`,
        description: `${requesterName} sent you a friend request.`,
        action: {
          label: 'View',
          onClick: () => navigate('/friends'),
        },
      });
    });

    knownIdsRef.current = nextIds;
  }, [incoming, loading, navigate]);

  useEffect(() => {
    initializedRef.current = false;
    knownIdsRef.current = new Set();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const tick = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
  }, [userId, refetch]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`friend_requests_invalidate_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          invalidate();
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Friend request realtime channel error', err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, invalidate]);

  return null;
}
