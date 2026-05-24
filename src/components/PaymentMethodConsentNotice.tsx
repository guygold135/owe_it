import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function PaymentMethodConsentNotice({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputId = 'payment-method-consent';

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 text-left cursor-pointer',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-describedby={`${inputId}-description`}
      />
      <span id={`${inputId}-description`} className="text-xs leading-snug text-muted-foreground">
        I agree to the{' '}
        <Link
          to="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/90"
          onClick={(e) => e.stopPropagation()}
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          to="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/90"
          onClick={(e) => e.stopPropagation()}
        >
          Privacy Policy
        </Link>
        {' '}
        and authorize Owe It and its payment processors to store and charge my payment method for goal
        outcomes, as described in those Terms.
      </span>
    </label>
  );
}
