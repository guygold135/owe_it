import { getCharityById } from "./charities.ts";
import { applicationFeeStripeUnits } from "./platform-fee.ts";
import { stakeMajorToStripeUnits } from "./stripe-money.ts";

export type GoalPayoutRow = {
  id: string;
  stake: number | null;
  stake_currency?: string | null;
  charity_id?: string | null;
};

/** Fields for PaymentIntent.create (excluding customer / payment_method). */
export type FailedStakeIntentBase = {
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  application_fee_amount?: number;
  transfer_data?: { destination: string };
};

export async function buildFailedStakePaymentIntentBase(
  goal: GoalPayoutRow,
): Promise<FailedStakeIntentBase> {
  const currency = (goal.stake_currency ?? "usd").toLowerCase();
  const stake = Number(goal.stake ?? 0);
  const amount = stakeMajorToStripeUnits(stake, currency);
  const charity = getCharityById(goal.charity_id ?? undefined);
  const dest = charity?.stripeConnectAccountId ?? null;

  const metadata: Record<string, string> = {
    goal_id: goal.id,
    settlement_reason: "failed_or_expired",
    charity_id: charity?.id ?? "",
  };

  if (!dest || amount <= 0) {
    return { amount, currency, metadata };
  }

  const appFee = await applicationFeeStripeUnits(amount, currency);
  return {
    amount,
    currency,
    metadata,
    application_fee_amount: appFee,
    transfer_data: { destination: dest },
  };
}

type StripePiMinimal = {
  paymentIntents: {
    create: (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => Promise<{ id: string; status: string }>;
  };
};

/**
 * Create off-session failed-stake PaymentIntent. If Connect (destination + application fee) fails
 * (Connect not enabled, invalid acct_, etc.), retries once without split so the user is still charged.
 */
export async function createFailedStakePaymentIntent(
  stripe: StripePiMinimal,
  goal: GoalPayoutRow,
  args: { customerId: string; paymentMethodId: string; idempotencyKey: string },
): Promise<{ id: string; status: string }> {
  const base = await buildFailedStakePaymentIntentBase(goal);
  const full = {
    ...base,
    customer: args.customerId,
    payment_method: args.paymentMethodId,
    confirm: true,
    off_session: true,
  };
  try {
    return await stripe.paymentIntents.create(full, { idempotencyKey: args.idempotencyKey });
  } catch (err) {
    if (base.transfer_data != null || base.application_fee_amount != null) {
      const { application_fee_amount: _a, transfer_data: _t, ...rest } = base;
      console.warn(
        "Failed-stake PaymentIntent with Connect failed; retrying platform-only:",
        err instanceof Error ? err.message : err,
      );
      return await stripe.paymentIntents.create(
        {
          ...rest,
          customer: args.customerId,
          payment_method: args.paymentMethodId,
          confirm: true,
          off_session: true,
        },
        { idempotencyKey: `${args.idempotencyKey}-platform-only` },
      );
    }
    throw err;
  }
}
