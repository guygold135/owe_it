import { supabase } from '@/integrations/supabase/client';

export async function notifyRequesterJudgeAccepted(judgeRequestId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('notify-judge-accepted', {
    body: { judgeRequestId },
  });
  if (error) {
    console.warn('notify-judge-accepted', error);
  }
}
