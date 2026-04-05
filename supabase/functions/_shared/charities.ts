/**
 * CHARITY CONFIG (server) — keep in sync with `src/lib/charities.ts`.
 *
 * SETUP (do these in order):
 * 1. In Stripe Dashboard: enable Connect (Standard or Express) for your platform account.
 * 2. Onboard each charity as a Connected account; copy its account id (`acct_...`).
 * 3. Add an entry below with `stripeConnectAccountId: "acct_..."`.
 * 4. Deploy Supabase Edge Functions so `resolve-goal`, `resolve-goal-direct`, and
 *    `settle-expired-goal-payments` pick up this file.
 * 5. Run the DB migration that adds `goals.charity_id` if you have not already.
 *
 * Until `stripeConnectAccountId` is set, failed-stake charges still succeed but the full
 * amount (minus Stripe’s own processing fee) stays on your platform balance — use Dashboard
 * or manual transfers to move funds to the charity.
 */
export type CharityDef = {
  id: string;
  name: string;
  /** Shown in the app under the charity name */
  subtitle?: string;
  /** Stripe Connect account id, e.g. acct_1ABC... — null until onboarded */
  stripeConnectAccountId: string | null;
};

export const DEFAULT_CHARITY_ID = "default";

export const CHARITIES: CharityDef[] = [
  {
    id: "default",
    name: "Default charity pool",
    subtitle: "Failed stakes go here after fees (configure Stripe Connect to pay out automatically).",
    stripeConnectAccountId: null,
  },
  // Example — duplicate this block and fill in `stripeConnectAccountId` when ready:
  // {
  //   id: "red-cross-example",
  //   name: "Example Charity",
  //   subtitle: "Replace with a real organization.",
  //   stripeConnectAccountId: "acct_REPLACE_ME",
  // },
];

export function isValidCharityId(id: string): boolean {
  return CHARITIES.some((c) => c.id === id);
}

export function getCharityById(id: string | null | undefined): CharityDef | undefined {
  if (id && isValidCharityId(id)) {
    return CHARITIES.find((c) => c.id === id);
  }
  return CHARITIES.find((c) => c.id === DEFAULT_CHARITY_ID);
}
