import { loadStripe } from '@stripe/stripe-js';

// This reads your publishable key from .env (VITE_STRIPE_PUBLISHABLE_KEY)
export const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!
);