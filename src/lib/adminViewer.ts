import type { AuthUser } from "@/hooks/useAuth";

/** Matches server-side admin secrets (ADMIN_USER_ID / ADMIN_EMAIL). */
export function isAdminViewer(user: AuthUser | null): boolean {
  if (!user) return false;
  const adminId = import.meta.env.VITE_ADMIN_USER_ID as string | undefined;
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
  if (adminId && user.id === adminId) return true;
  if (adminEmail && user.email?.toLowerCase() === adminEmail.trim().toLowerCase()) {
    return true;
  }
  return false;
}
