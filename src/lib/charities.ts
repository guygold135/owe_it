/**
 * CHARITY CONFIG (client) — MUST stay in sync with `supabase/functions/_shared/charities.ts`
 * (same `id` values and names). Stripe Connect ids belong only in the server file for now.
 *
 * SETUP SUMMARY — see the long comment in the server `charities.ts` for the full checklist.
 */
export type CharityOption = {
  id: string;
  name: string;
  subtitle?: string;
};

export const DEFAULT_CHARITY_ID = 'default';

/** Mirror of server CHARITIES (`supabase/functions/_shared/charities.ts`) — same ids and names. */
export const CHARITY_OPTIONS: CharityOption[] = [
  {
    id: 'default',
    name: 'Let us decide which charity',
    subtitle: 'Failed stakes go to this pool after Stripe and platform fees.',
  },
];

export function getCharityOptionById(id: string | null | undefined): CharityOption | undefined {
  if (id && CHARITY_OPTIONS.some((c) => c.id === id)) {
    return CHARITY_OPTIONS.find((c) => c.id === id);
  }
  return CHARITY_OPTIONS.find((c) => c.id === DEFAULT_CHARITY_ID);
}
