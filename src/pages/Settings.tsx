import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { HoldToConfirmButton } from '@/components/ui/hold-to-confirm-button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_STAKE_CURRENCIES, formatStakeCurrencyLabel, type StakeCurrency } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { useShortDeadlineTesting } from '@/hooks/useShortDeadlineTesting';
import { useGoals } from '@/hooks/useGoals';
import UserProfilePopover from '@/components/UserProfilePopover';

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { goals } = useGoals();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { currency, setCurrency } = useStakeCurrencyPreference();
  const { enabled: allowShortDeadlines, setEnabled: setAllowShortDeadlines } = useShortDeadlineTesting();
  const [currencySearch, setCurrencySearch] = useState('');
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const currencyPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrencySearch(formatStakeCurrencyLabel(currency));
  }, [currency]);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return SUPPORTED_STAKE_CURRENCIES;
    return SUPPORTED_STAKE_CURRENCIES.filter((code) => {
      const label = formatStakeCurrencyLabel(code).toLowerCase();
      return label.includes(q) || code.toLowerCase().includes(q);
    });
  }, [currencySearch]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!currencyPickerRef.current) return;
      if (!currencyPickerRef.current.contains(event.target as Node)) {
        setCurrencyPickerOpen(false);
        setCurrencySearch(formatStakeCurrencyLabel(currency));
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [currency]);

  const activeStakesGoals = useMemo(
    () => goals.filter((g) => g.status === 'active' && g.stake > 0),
    [goals],
  );
  const activeStakesCount = activeStakesGoals.length;

  const confirmDeleteAccount = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
        body: {},
      });

      if (error) {
        throw new Error(error.message || 'Account deletion failed.');
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String((data as { error: string }).error));
      }

      setDeleteDialogOpen(false);
      await signOut();
      toast.success('Your account and app data have been deleted.');
      navigate('/auth', { replace: true });
    } catch (error: unknown) {
      console.error('Error deleting account', error);
      const msg = error instanceof Error ? error.message : 'Could not delete account.';
      toast.error(
        `${msg} If you are the project owner, deploy the Edge Function: supabase functions deploy delete-account`,
        { duration: 12_000 },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-display font-extrabold text-foreground tracking-tight"
          >
            Settings
          </motion.h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your account and data.
          </p>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-6">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Stake currency</p>
            <p className="text-xs text-muted-foreground">
              New goals and card charges will use this currency. Existing goals keep their original currency.
            </p>
          </div>
          <div ref={currencyPickerRef} className="relative">
            <input
              type="text"
              value={currencySearch}
              onFocus={() => {
                setCurrencyPickerOpen(true);
                setCurrencySearch('');
              }}
              onChange={(e) => {
                setCurrencySearch(e.target.value);
                setCurrencyPickerOpen(true);
              }}
              placeholder="Search currency..."
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {currencyPickerOpen && (
              <div className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                {filteredCurrencies.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No currencies found.</p>
                ) : (
                  filteredCurrencies.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCurrency(code as StakeCurrency);
                        setCurrencySearch(formatStakeCurrencyLabel(code as StakeCurrency));
                        setCurrencyPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        code === currency
                          ? 'bg-muted text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      {formatStakeCurrencyLabel(code as StakeCurrency)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Allow short deadlines (testing)</p>
              <p className="text-xs text-muted-foreground">
                Enables creating goals with deadlines in less than 24 hours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAllowShortDeadlines(!allowShortDeadlines)}
              className={`w-12 h-7 rounded-full transition-colors relative ${allowShortDeadlines ? 'bg-primary' : 'bg-border'}`}
              aria-label="Toggle short deadline testing mode"
            >
              <div className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${allowShortDeadlines ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground">
                Sign out of this device and return to the login screen.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={() => setSignOutDialogOpen(true)}
          >
            Sign out
          </Button>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Delete account</p>
              <p className="text-xs text-muted-foreground">
                Permanently removes your login and related data stored for this app (goals, friends,
                notifications, activity, and more), then signs you out.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            className="w-full"
            disabled={loading}
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete my account
          </Button>
        </div>
      </div>

      <AlertDialog
        open={signOutDialogOpen}
        onOpenChange={(open) => {
          if (!loading) setSignOutDialogOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Sign out now?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              You&apos;ll be signed out of this device and returned to the login screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={loading} className="mt-0 sm:mt-0">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              className="w-full sm:w-auto"
              onClick={async () => {
                setSignOutDialogOpen(false);
                await signOut();
              }}
            >
              Yes, sign out
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!loading) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              This permanently removes your login and all data stored for this app (goals, friends,
              notifications, feedback, judge requests, and more). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {activeStakesCount > 0 && (
            <div
              role="alert"
              className="rounded-xl border-2 border-destructive bg-destructive/15 px-4 py-3 text-left shadow-sm ring-2 ring-destructive/20"
            >
              <p className="text-sm font-bold uppercase tracking-wide text-destructive">
                Active stakes
              </p>
              <p className="mt-1.5 text-sm font-semibold text-destructive">
                You have {activeStakesCount} active goal{activeStakesCount === 1 ? '' : 's'} with money
                at stake right now.
              </p>
              <p className="mt-2 text-xs font-medium leading-relaxed text-destructive/95">
                Deleting your account removes this data from the app. If you are unsure about charges,
                judges, or deadlines, resolve or finish those goals before you delete.
              </p>
            </div>
          )}

          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
            Hold to accept
          </p>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={loading} className="mt-0 sm:mt-0">
              Cancel
            </AlertDialogCancel>
            {loading ? (
              <Button
                type="button"
                variant="destructive"
                disabled
                className="w-full sm:w-auto"
              >
                Deleting…
              </Button>
            ) : (
              <HoldToConfirmButton
                variant="destructive"
                className="w-full sm:w-auto"
                idleLabel="Yes, delete my account"
                holdingLabel="Sure?"
                onConfirm={() => confirmDeleteAccount()}
              />
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

