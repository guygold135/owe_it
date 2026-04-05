import {
  getCurrencyUnitsPerOneUsd,
  stakeMajorToStripeUnits,
} from "./stripe-money.ts";

/** Platform fee on failed-stake charges: 3.8% + US$0.20 (converted to stake currency). */
const PLATFORM_FEE_BPS = 380;
const PLATFORM_FLAT_USD = 0.2;

/**
 * Application fee in Stripe’s smallest currency unit (same basis as PaymentIntent amount).
 * Capped so at least 1 minor unit can go to the connected account when using Connect.
 */
export async function applicationFeeStripeUnits(
  stakeStripeUnits: number,
  currency: string,
): Promise<number> {
  const c = currency.toLowerCase();
  const pctPart = Math.round((stakeStripeUnits * PLATFORM_FEE_BPS) / 10_000);
  const unitsPerUsd = await getCurrencyUnitsPerOneUsd(c);
  const flatMajor = PLATFORM_FLAT_USD * unitsPerUsd;
  const flatPart = stakeMajorToStripeUnits(flatMajor, c);
  const raw = pctPart + flatPart;
  const max = Math.max(0, stakeStripeUnits - 1);
  return Math.min(raw, max);
}
