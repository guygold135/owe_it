/** True when the trimmed name is exactly 11 ASCII digits (reserved vs IDs / codes). */
export function isElevenDigitDisplayName(value: string): boolean {
  return /^[0-9]{11}$/.test(value.trim());
}
