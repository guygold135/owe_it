import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function judgeAcceptedToastId(judgeRequestId: string): string {
  return `judge_request_accepted_${judgeRequestId}`;
}

/** Permanently dismiss the judge-accepted toast (X or goal created). */
export async function dismissJudgeAcceptedNotice(
  userId: string,
  judgeRequestId: string,
): Promise<void> {
  const id = judgeRequestId.trim();
  if (!id) return;
  toast.dismiss(judgeAcceptedToastId(id));
  await supabase
    .from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('judge_request_id', id)
    .eq('kind', 'judge_request_accepted')
    .is('read_at', null);
}
