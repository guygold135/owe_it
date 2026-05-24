/** Verified sending domain in Resend (see resend.com/domains). */
export const DEFAULT_SENDING_DOMAIN = "oweit.site";

export function getResendFromAddress(): string {
  const configured = Deno.env.get("FEEDBACK_FROM_EMAIL")?.trim();
  if (configured) return configured;
  return `Owe It <notifications@${DEFAULT_SENDING_DOMAIN}>`;
}

export function getFromEmailDomain(from: string): string | null {
  const match = from.match(/<([^>]+)>/) ?? from.match(/([^\s@]+@[^\s@]+)/);
  const email = match?.[1]?.trim();
  if (!email || !email.includes("@")) return null;
  return email.split("@")[1]?.toLowerCase() ?? null;
}
