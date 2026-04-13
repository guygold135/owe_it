import { loadStripe, type Stripe } from '@stripe/stripe-js';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/** Null when the key is missing (avoids loadStripe throwing or rejecting in production misconfigs). */
export const stripePromise: Promise<Stripe | null> | null =
  publishableKey && publishableKey.trim().length > 0 ? loadStripe(publishableKey) : null;