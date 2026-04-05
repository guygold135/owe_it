import type { JudgeRequest } from '@/lib/fetchers/tabData';
import { formatStakeAmount, normalizeStakeCurrency } from '@/lib/currency';
import { getCharityOptionById } from '@/lib/charities';

export function judgeRequestPayloadLines(goal_payload: unknown): {
  title: string;
  /** Locale string for after the word "Deadline" */
  deadlineFormatted?: string;
  stakeFormatted?: string;
  charitySummary?: string;
  visibility?: 'public' | 'private';
} {
  const p = goal_payload as Record<string, unknown> | null;
  const title = String((p?.title as string) ?? 'a goal').trim();
  if (!p) return { title };
  const deadlineFormatted =
    p.deadline != null ? new Date(String(p.deadline)).toLocaleString() : undefined;
  const stake = Number(p.stake ?? 0);
  const stakeCurrency = normalizeStakeCurrency(p.stakeCurrency);
  const stakeFormatted = stake > 0 ? formatStakeAmount(stake, stakeCurrency) : undefined;
  const rawCharity = p.charityId ?? p.charity_id;
  const charityId = typeof rawCharity === 'string' ? rawCharity : undefined;
  const charity = stake > 0 ? getCharityOptionById(charityId) : undefined;
  const charitySummary = charity?.name;
  const visibility = (p.isPrivate ? 'private' : 'public') as 'public' | 'private';
  return { title, deadlineFormatted, stakeFormatted, charitySummary, visibility };
}

export function judgeRequestDescriptionLine(r: JudgeRequest): string | undefined {
  const p = r.goal_payload as Record<string, unknown> | undefined;
  const d = p?.description;
  if (typeof d !== 'string' || !d.trim()) return undefined;
  return d;
}
