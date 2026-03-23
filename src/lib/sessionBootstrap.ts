/** ISO time at first module load (before React). Pending judge requests older than this are abandoned after refresh. */
export const SESSION_BOOTSTRAP_AT_ISO = new Date().toISOString();
