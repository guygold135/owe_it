import {
  BRAINTREE_STYLESHEET_ID,
  getBraintreeThemeColors,
  OWE_BRAINTREE_OVERRIDE_STYLE_ID,
  type BraintreeThemeColors,
} from '@/components/braintree/braintreeTheme';

/** Injected after Braintree's CDN stylesheet so our rules win. */
function buildOverrideCss(theme: BraintreeThemeColors): string {
  const { sheet, muted, foreground, mutedForeground, destructive, primary } = theme;

  return `
.owe-braintree{color-scheme:dark;}
.owe-braintree .braintree-dropin .braintree-form__label{color:${mutedForeground}!important;}
.owe-braintree .braintree-dropin .braintree-sheet,
.owe-braintree .braintree-dropin .braintree-card,
.owe-braintree .braintree-dropin .braintree-form.braintree-sheet,
.owe-braintree .braintree-dropin .braintree-sheet__content,
.owe-braintree .braintree-dropin .braintree-sheet__content--form,
.owe-braintree .braintree-dropin .braintree-upper-container,
.owe-braintree .braintree-dropin .braintree-sheet__container{
  background:${sheet}!important;background-color:${sheet}!important;
  border:0!important;box-shadow:none!important;padding:0!important;margin:0!important;
}
.owe-braintree .braintree-dropin .braintree-sheet__header,
.owe-braintree .braintree-dropin .braintree-lower-container,
.owe-braintree .braintree-dropin [data-braintree-id="notice-of-collection"],
.owe-braintree .braintree-dropin .braintree-form__notice-of-collection{display:none!important;}
.owe-braintree .braintree-dropin .braintree-form__label{font-size:10px!important;letter-spacing:.08em!important;text-transform:uppercase!important;margin:0 0 4px!important;}
.owe-braintree .braintree-dropin .braintree-form__field-group{margin:0 0 8px!important;padding:0!important;background:transparent!important;}
.owe-braintree .braintree-dropin .braintree-form__field,
.owe-braintree .braintree-dropin .braintree-sheet__content--form .braintree-form__field-group .braintree-form__field{
  background:${muted}!important;background-color:${muted}!important;
  border:0!important;border-radius:12px!important;padding:8px 12px!important;margin:0!important;
  transition:box-shadow .15s ease!important;
}
.owe-braintree .braintree-dropin .braintree-form__field-group:focus-within .braintree-form__field,
.owe-braintree .braintree-dropin .braintree-form__field-group.braintree-form__field-group--is-focused .braintree-form__field{
  box-shadow:0 0 0 2px ${primary}!important;outline:2px solid ${primary}!important;outline-offset:0!important;
}
.owe-braintree .braintree-dropin .braintree-form__field-group.braintree-form__field-group--has-error .braintree-form__field{box-shadow:0 0 0 2px ${destructive}!important;}
.owe-braintree .braintree-dropin .braintree-form__hosted-field,
.owe-braintree .braintree-dropin .braintree-sheet__content--form .braintree-form__field-group .braintree-form__field .braintree-form__hosted-field{
  background:${muted}!important;background-color:${muted}!important;
  border:0!important;height:20px!important;min-height:20px!important;max-height:20px!important;margin:0!important;padding:0!important;
}
.owe-braintree .braintree-dropin .braintree-form__hosted-field iframe{
  background:${muted}!important;background-color:${muted}!important;
  border:0!important;height:20px!important;min-height:20px!important;color-scheme:dark;
}
.owe-braintree .braintree-dropin input.braintree-form__raw-input,
.owe-braintree .braintree-dropin .braintree-form__hosted-field input.braintree-form__raw-input{
  background:${muted}!important;background-color:${muted}!important;
  color:${foreground}!important;-webkit-text-fill-color:${foreground}!important;
  border:0!important;box-shadow:none!important;font-size:14px!important;height:20px!important;line-height:20px!important;
}
.owe-braintree .braintree-dropin input.braintree-form__raw-input::placeholder{color:${mutedForeground}!important;}
.owe-braintree .braintree-dropin input.braintree-form__raw-input:-webkit-autofill,
.owe-braintree .braintree-dropin input.braintree-form__raw-input:-webkit-autofill:hover,
.owe-braintree .braintree-dropin input.braintree-form__raw-input:-webkit-autofill:focus{
  -webkit-box-shadow:0 0 0 1000px ${muted} inset!important;
  -webkit-text-fill-color:${foreground}!important;
  caret-color:${foreground}!important;
}
.owe-braintree .braintree-dropin .braintree-form__flexible-fields{gap:8px!important;}
.owe-braintree .braintree-dropin .braintree-form__field-error{color:${destructive}!important;font-size:11px!important;}
`.replace(/\s+/g, ' ');
}

let injectScheduled = false;

export function injectOweBraintreeDropinOverrides(): void {
  if (typeof document === 'undefined') return;

  const css = buildOverrideCss(getBraintreeThemeColors());

  let style = document.getElementById(OWE_BRAINTREE_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = OWE_BRAINTREE_OVERRIDE_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;

  const braintreeLink = document.getElementById(BRAINTREE_STYLESHEET_ID);
  if (braintreeLink?.parentNode && style.previousSibling !== braintreeLink) {
    braintreeLink.parentNode.insertBefore(style, braintreeLink.nextSibling);
  }
}

/** Debounced inject — safe to call often; avoids head mutation loops. */
export function scheduleBraintreeOverrideInject(): void {
  if (injectScheduled) return;
  injectScheduled = true;
  window.requestAnimationFrame(() => {
    injectScheduled = false;
    injectOweBraintreeDropinOverrides();
  });
}

export function watchAndInjectBraintreeOverrides(): () => void {
  scheduleBraintreeOverrideInject();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id === BRAINTREE_STYLESHEET_ID) {
          scheduleBraintreeOverrideInject();
          return;
        }
      }
    }
  });
  observer.observe(document.head, { childList: true });

  const timer = window.setTimeout(scheduleBraintreeOverrideInject, 500);

  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}
