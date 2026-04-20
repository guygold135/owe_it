import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { DashboardOrganizerState } from '@/lib/dashboardGoalOrganizer';

export async function fetchUserDashboardLayout(userId: string) {
  const { data, error } = await supabase
    .from('user_dashboard_layout')
    .select('organizer, goal_order_ids, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertUserDashboardLayout(
  userId: string,
  organizer: DashboardOrganizerState,
  goalOrderIds: string[],
) {
  const payload = {
    user_id: userId,
    organizer: JSON.parse(JSON.stringify(organizer)) as Json,
    goal_order_ids: goalOrderIds as unknown as Json,
  };
  const { error } = await supabase.from('user_dashboard_layout').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
}
