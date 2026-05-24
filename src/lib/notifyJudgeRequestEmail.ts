import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type NotifyJudgeEmailResult = {
  success?: boolean;
  emailed?: boolean;
  reason?: string;
  error?: string;
  resendError?: string;
  fromAddress?: string;
  fromDomain?: string;
};

async function readInvokeFailure(
  error: unknown,
  result: NotifyJudgeEmailResult,
): Promise<string> {
  if (result.error) return result.error;
  if (result.emailed === false) return judgeEmailFailureMessage(result);

  if (error && typeof error === 'object') {
    const maybeContext = (error as { context?: Response }).context;
    if (maybeContext instanceof Response) {
      try {
        const payload = (await maybeContext.clone().json()) as NotifyJudgeEmailResult & { error?: string };
        if (payload.error) return payload.error;
        if (payload.emailed === false) return judgeEmailFailureMessage(payload);
      } catch {
        try {
          const text = (await maybeContext.clone().text()).trim();
          if (text) return text.slice(0, 300);
        } catch {
          /* ignore */
        }
      }
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }

  return judgeEmailFailureMessage(result);
}

function judgeEmailFailureMessage(result: NotifyJudgeEmailResult): string {
  if (result.reason === 'judge_has_no_email') {
    return 'Your friend has no email on their account. They can still accept in the app.';
  }
  if (result.reason === 'email_not_configured') {
    return 'In-app invite sent. Email is not configured on the server yet.';
  }
  if (result.reason === 'email_send_failed') {
    const detail = result.resendError?.trim();
    if (detail?.includes('verify a domain') || detail?.includes('domain is not verified')) {
      const fromHint = result.fromAddress ? ` Current sender: ${result.fromAddress}.` : '';
      return `Judge emails must send from your verified domain (oweit.site).${fromHint} Set FEEDBACK_FROM_EMAIL in Supabase to something like notifications@oweit.site. Your friend can still accept in the app.`;
    }
    if (detail) {
      return `Could not email your judge (${detail}). They can still accept in the app.`;
    }
    return 'Could not email your judge. They can still accept in the app.';
  }
  if (result.error) return result.error;
  return 'Could not email your judge. They can still accept in the app.';
}

export async function notifyJudgeRequestByEmail(judgeRequestId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('notify-judge-request', {
    body: { judgeRequestId },
  });

  const result = (data ?? {}) as NotifyJudgeEmailResult;

  if (error) {
    const message = await readInvokeFailure(error, result);
    console.error('notify-judge-request invoke error', error, result);
    toast.error(message);
    return false;
  }

  if (result.error) {
    console.error('notify-judge-request response error', result);
    toast.error(result.error);
    return false;
  }

  if (result.emailed === false) {
    toast.message(judgeEmailFailureMessage(result));
    return false;
  }

  return true;
}
