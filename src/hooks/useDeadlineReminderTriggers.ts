import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const MS_24H = 24 * 60 * 60 * 1000;
const TICK_MS = 60_000;

/** After in-app reminders are recorded, ask the server to send deadline emails. */
async function requestDeadlineReminderEmails(goalId: string) {
  const { error } = await supabase.functions.invoke('send-deadline-reminders', {
    body: { goalId },
  });
  if (error) console.error('send-deadline-reminders', error);
}

/**
 * While a creator or judge has the app open, periodically asks the server to
 * record 24h / 6h deadline reminders (deduped in DB) and email both parties.
 */
export function useDeadlineReminderTriggers(goals: { id: string; deadline: Date; status: string }[]) {
  const { user } = useAuth();
  const userId = user?.id;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;

  useEffect(() => {
    if (!userId) return;

    const run = () => {
      for (const g of goalsRef.current) {
        if (g.status !== 'active') continue;
        const ms = g.deadline.getTime() - Date.now();
        if (ms <= 0 || ms > MS_24H) continue;
        void supabase.rpc('try_goal_deadline_reminders', { p_goal_id: g.id }).then(({ error }) => {
          if (error) console.error('try_goal_deadline_reminders', error);
        });
        void requestDeadlineReminderEmails(g.id);
      }
    };

    run();
    const id = window.setInterval(run, TICK_MS);
    return () => window.clearInterval(id);
  }, [userId]);
}
