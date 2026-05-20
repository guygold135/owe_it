/** Fallback hex when CSS variables are unavailable (SSR / tests). */
export const BRAINTREE_THEME_FALLBACK = {
  sheet: '#0f0f0f',
  background: '#1e2329',
  muted: '#3a3f47',
  foreground: '#f2f3f5',
  mutedForeground: '#858b95',
  primary: '#3ee67a',
  destructive: '#e84a4a',
  /** Text inside Braintree iframes (white interior — not app foreground). */
  hostedFieldInk: '#1a1f26',
  hostedFieldPlaceholder: '#6b7280',
} as const;

export type BraintreeThemeColors = typeof BRAINTREE_THEME_FALLBACK;

export const BRAINTREE_STYLESHEET_ID = 'braintree-dropin-stylesheet';
export const OWE_BRAINTREE_OVERRIDE_STYLE_ID = 'owe-braintree-dropin-overrides';

function computedRgbToHex(rgb: string): string | null {
  const match = rgb.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]]
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Read a theme token from :root CSS variables (e.g. "--muted") as hex. */
function readCssVariableAsHex(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;

  const hslParts = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!hslParts) return fallback;

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;width:0;height:0;';
  document.documentElement.appendChild(probe);

  probe.style.backgroundColor = `hsl(${hslParts})`;
  const bgHex = computedRgbToHex(getComputedStyle(probe).backgroundColor);

  probe.style.backgroundColor = '';
  probe.style.color = `hsl(${hslParts})`;
  const fgHex = computedRgbToHex(getComputedStyle(probe).color);

  probe.remove();

  if (variable.includes('foreground') && !variable.includes('muted')) {
    return fgHex ?? fallback;
  }
  return bgHex ?? fgHex ?? fallback;
}

/** Live app palette — matches CreateGoalSheet inputs (bg-muted, text-foreground, etc.). */
export function getBraintreeThemeColors(): BraintreeThemeColors {
  const f = BRAINTREE_THEME_FALLBACK;
  return {
    sheet: readCssVariableAsHex('--background', f.sheet),
    background: readCssVariableAsHex('--background', f.background),
    muted: readCssVariableAsHex('--muted', f.muted),
    foreground: readCssVariableAsHex('--foreground', f.foreground),
    mutedForeground: readCssVariableAsHex('--muted-foreground', f.mutedForeground),
    primary: readCssVariableAsHex('--primary', f.primary),
    destructive: readCssVariableAsHex('--destructive', f.destructive),
    hostedFieldInk: readCssVariableAsHex('--primary-foreground', f.hostedFieldInk),
    hostedFieldPlaceholder: readCssVariableAsHex('--muted-foreground', f.hostedFieldPlaceholder),
  };
}
