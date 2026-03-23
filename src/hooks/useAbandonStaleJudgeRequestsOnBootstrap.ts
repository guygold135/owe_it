import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SESSION_BOOTSTRAP_AT_ISO } from '@/lib/sessionBootstrap';

/**
 * When the goal author refreshes or restarts the app, CreateGoalSheet no longer runs and cannot call
 * cancel_judge_request. Remove any pending rows they created before this JS session so judges do not
 * see stale invites.
 */
export function useAbandonStaleJudgeRequestsOnBootstrap(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    void supabase
      .rpc('cancel_pending_judge_requests_before_cutoff', { p_cutoff: SESSION_BOOTSTRAP_AT_ISO })
      .then(({ error }) => {
        if (error) console.error('cancel_pending_judge_requests_before_cutoff', error);
      });
  }, [userId]);
}
