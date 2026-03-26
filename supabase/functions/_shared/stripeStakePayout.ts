import Stripe from "npm:stripe@16.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

export type GoalStakeFields = {
  id: string;
  stake: number | null;
  stake_currency?: string | null;
  payment_intent_id?: string | null;
  payment_method_id?: string | null;
  stripe_customer_id?: string | null;
  stake_recipient_user_id?: string | null;
  stake_charity_id?: string | null;
  payment_retry_count?: number | null;
};

/** Stripe Connect destination for failed stake: charity row or friend profile (not both). */
export async function getDestinationConnectAccountId(
  supabase: ReturnType<typeof createClient>,
  goal: Pick<GoalStakeFields, "stake_recipient_user_id" | "stake_charity_id">,
): Promise<string | null> {
  const charityId = goal.stake_charity_id;
  if (charityId) {
    const { data } = await supabase
      .from("charities")
      .select("stripe_connect_account_id, stake_payouts_ready, active")
      .eq("id", charityId)
      .maybeSingle();
    if (!data?.active || !data?.stake_payouts_ready || !data?.stripe_connect_account_id) {
      return null;
    }
    return data.stripe_connect_account_id as string;
  }

  const rid = goal.stake_recipient_user_id;
  if (!rid) return null;
  const { data } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id, stake_payouts_ready")
    .eq("id", rid)
    .maybeSingle();
  if (!data?.stake_payouts_ready || !data?.stripe_connect_account_id) return null;
  return data.stripe_connect_account_id as string;
}

/** When the charge used manual capture without destination on the PaymentIntent, move funds after capture. */
export async function transferStakeToRecipientIfNeeded(
  stripe: Stripe,
  supabase: ReturnType<typeof createClient>,
  goal: GoalStakeFields,
  paymentIntentId: string,
  idempotencyKey: string,
): Promise<void> {
  const connectId = await getDestinationConnectAccountId(supabase, goal);
  if (!connectId) return;

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") return;
  if (pi.transfer_data?.destination) return;

  const stake = Number(goal.stake ?? 0);
  if (stake <= 0) return;

  const currency = (goal.stake_currency ?? "usd").toLowerCase();
  const amount = Math.round(stake * 100);

  await stripe.transfers.create(
    {
      amount,
      currency,
      destination: connectId,
      metadata: { goal_id: goal.id },
    },
    { idempotencyKey },
  );
}
