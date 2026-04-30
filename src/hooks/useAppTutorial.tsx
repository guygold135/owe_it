import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  APP_TUTORIAL_SHEET_STEP_TO_PHASE,
  type AppTutorialPhase,
  isAppTutorialSheetPhase,
} from '@/lib/appTutorial';

export type { AppTutorialPhase };

type AppTutorialContextValue = {
  phase: AppTutorialPhase;
  /** While deciding whether first-run tutorial should open, block underlying UI. */
  tutorialBootBlocking: boolean;
  /** True while the user should see the tour (not completed and not skipped). */
  tutorialActive: boolean;
  /** Blur nav links; only FAB is interactive. */
  fabSpotlight: boolean;
  /** Block closing the create sheet except via tutorial Exit. */
  sheetCloseLocked: boolean;
  /** Highlight a bottom-nav tab during the tab tour. */
  highlightNavTab: 'goals' | 'judge' | 'pulse' | 'friends' | null;
  /** Open profile popover for the last step. */
  profileMenuTutorial: boolean;
  /** Paid stake in the current create flow (known after leaving the stake step). */
  createHadPaidStake: boolean | null;
  /** Create sheet reported a new step index (0–4). */
  onCreateSheetStep: (step: number) => void;
  /** After user picks Continue on stake step (step still 1 until they tap sheet Continue). */
  registerStakeChoice: (hasPaidStake: boolean) => void;
  onWelcomeContinue: () => void;
  /** From the FAB spotlight step, return to the welcome dialog. */
  goBackToWelcomeFromFab: () => void;
  /** Close the create sheet flow and return to the FAB spotlight step. */
  goBackToFabFromSheet: () => void;
  /** From tab_goals in tutorial: undo created tutorial goal and reopen the sheet on previous step. */
  goBackFromTabGoalsToSheet: () => Promise<void>;
  onFabPhaseCreateOpened: () => void;
  onGoalCreatedInTutorial: (goalId?: string | null) => void;
  advanceTabTour: () => void;
  goBackTabTour: () => void;
  exitTutorial: () => Promise<void>;
  /** Step counter for UI (1-based). */
  progressCurrent: number;
  progressTotal: number;
};

const AppTutorialContext = createContext<AppTutorialContextValue | null>(null);

export function AppTutorialProvider({
  children,
  createGoalOpen,
  onRequestOpenCreateGoal,
}: {
  children: ReactNode;
  createGoalOpen: boolean;
  onRequestOpenCreateGoal: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<AppTutorialPhase>('off');
  const [loadingFlag, setLoadingFlag] = useState(true);
  const [createHadPaidStake, setCreateHadPaidStake] = useState<boolean | null>(null);
  const [tutorialCreatedGoalId, setTutorialCreatedGoalId] = useState<string | null>(null);

  useEffect(() => {
    // Do not show onboarding tutorial chrome while user is on the auth/sign-up screen.
    // This prevents the "Step 1 of 12..." dialog from appearing during signup.
    if (location.pathname === '/auth') {
      setPhase('off');
      setLoadingFlag(false);
      return;
    }

    if (!user?.id) {
      setPhase('off');
      setLoadingFlag(false);
      return;
    }

    let alive = true;
    const uid = user.id;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const isSchemaOrColumnError = (err: { message?: string } | null) => {
      const msg = String(err?.message ?? '').toLowerCase();
      return (
        msg.includes('app_tutorial') ||
        msg.includes('column') ||
        msg.includes('schema') ||
        msg.includes('does not exist')
      );
    };

    (async () => {
      const { data: sessionRes } = await supabase.auth.getSession();
      const metaNeedsTutorial = sessionRes.session?.user?.user_metadata?.needs_app_tutorial === true;

      const delays = [0, 450, 1400];
      let lastError: { message?: string } | null = null;

      for (let i = 0; i < delays.length && alive; i += 1) {
        if (delays[i]! > 0) await sleep(delays[i]!);

        const { data, error } = await supabase
          .from('profiles')
          .select('app_tutorial_done_at')
          .eq('id', uid)
          .maybeSingle();

        if (!alive) return;

        if (!error) {
          const done = (data as { app_tutorial_done_at?: string | null } | null)?.app_tutorial_done_at;
          if (done != null) {
            setPhase('off');
          } else {
            // Only show the tutorial if the backend/user metadata explicitly opted-in.
            // This prevents onboarding chrome from appearing right after sign-up.
            setPhase(metaNeedsTutorial ? 'welcome' : 'off');
          }
          setLoadingFlag(false);
          return;
        }

        lastError = error;
        if (isSchemaOrColumnError(error)) {
          break;
        }
      }

      if (!alive) return;

      if (lastError) {
        console.error('app tutorial profile load', lastError);
        // New email signups set needs_app_tutorial so we still open the tour if the profile query fails.
        if (metaNeedsTutorial) {
          setPhase('welcome');
        } else {
          setPhase('off');
        }
        setLoadingFlag(false);
        return;
      }

      setPhase('off');
      setLoadingFlag(false);
    })();

    return () => {
      alive = false;
    };
  }, [user?.id, user?.needsAppTutorial, location.pathname]);

  const persistDone = useCallback(async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({ app_tutorial_done_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) console.error('app tutorial persist', error);
    const { error: metaErr } = await supabase.auth.updateUser({
      data: { needs_app_tutorial: false },
    });
    if (metaErr) console.error('app tutorial clear user metadata', metaErr);
  }, [user?.id]);

  const exitTutorial = useCallback(async () => {
    await persistDone();
    setPhase('off');
    setCreateHadPaidStake(null);
  }, [persistDone]);

  const onWelcomeContinue = useCallback(() => {
    void persistDone();
    setPhase('off');
    setCreateHadPaidStake(null);
  }, [persistDone]);

  const goBackToWelcomeFromFab = useCallback(() => {
    setPhase('welcome');
  }, []);

  const goBackToFabFromSheet = useCallback(() => {
    setPhase('fab');
  }, []);

  const goBackFromTabGoalsToSheet = useCallback(async () => {
    if (phase !== 'tab_goals') return;
    if (tutorialCreatedGoalId && user?.id) {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', tutorialCreatedGoalId)
        .eq('user_id', user.id);
      if (error) {
        console.error('Could not delete tutorial goal on go back', error);
      }
    }
    setTutorialCreatedGoalId(null);
    setPhase('sheet_confirm');
    onRequestOpenCreateGoal();
  }, [phase, tutorialCreatedGoalId, user?.id, onRequestOpenCreateGoal]);

  const onFabPhaseCreateOpened = useCallback(() => {
    if (phase !== 'fab') return;
    setPhase('sheet_goal');
    setCreateHadPaidStake(null);
    onRequestOpenCreateGoal();
  }, [phase, onRequestOpenCreateGoal]);

  const onCreateSheetStep = useCallback(
    (step: number) => {
      if (phase === 'off' || phase === 'welcome' || !user?.id) return;
      const p = APP_TUTORIAL_SHEET_STEP_TO_PHASE[step];
      if (!p) return;
      if (!isAppTutorialSheetPhase(phase) && phase !== 'fab') return;
      setPhase(p);
    },
    [phase, user?.id],
  );

  const registerStakeChoice = useCallback((hasPaidStake: boolean) => {
    if (phase === 'off' || phase === 'welcome' || phase === 'fab') return;
    setCreateHadPaidStake(hasPaidStake);
  }, [phase]);

  const onGoalCreatedInTutorial = useCallback((_goalId?: string | null) => {
    setTutorialCreatedGoalId(_goalId ?? null);
    setPhase('tab_goals');
    setCreateHadPaidStake(null);
    navigate('/');
  }, [navigate]);

  const advanceTabTour = useCallback(() => {
    setPhase((prev) => {
      switch (prev) {
        case 'tab_goals':
          navigate('/my-judges');
          return 'tab_my_judges';
        case 'tab_my_judges':
          navigate('/pulse');
          return 'tab_pulse';
        case 'tab_pulse':
          navigate('/friends');
          return 'tab_friends';
        case 'tab_friends':
          navigate('/');
          return 'tab_profile_menu';
        case 'tab_profile_menu':
          void persistDone();
          return 'off';
        default:
          return prev;
      }
    });
  }, [navigate, persistDone]);

  const goBackTabTour = useCallback(() => {
    setPhase((prev) => {
      switch (prev) {
        case 'tab_my_judges':
          navigate('/');
          return 'tab_goals';
        case 'tab_pulse':
          navigate('/my-judges');
          return 'tab_my_judges';
        case 'tab_friends':
          navigate('/pulse');
          return 'tab_pulse';
        case 'tab_profile_menu':
          navigate('/friends');
          return 'tab_friends';
        default:
          return prev;
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (phase === 'fab' && createGoalOpen) {
      setPhase('sheet_goal');
    }
  }, [phase, createGoalOpen]);

  const tutorialBootBlocking = loadingFlag && Boolean(user?.id) && location.pathname !== '/auth';
  const tutorialActive = phase !== 'off' && !loadingFlag;
  const fabSpotlight = phase === 'fab';
  const sheetCloseLocked = isAppTutorialSheetPhase(phase) && createGoalOpen;
  const profileMenuTutorial = phase === 'tab_profile_menu';

  const highlightNavTab =
    phase === 'tab_goals'
      ? 'goals'
      : phase === 'tab_my_judges'
        ? 'judge'
        : phase === 'tab_pulse'
          ? 'pulse'
          : phase === 'tab_friends'
            ? 'friends'
            : null;

  const { progressCurrent, progressTotal } = useMemo(() => {
    const sheetPhases: AppTutorialPhase[] = [
      'sheet_goal',
      'sheet_stake',
      'sheet_judge',
      ...(createHadPaidStake !== false ? (['sheet_card'] as const) : []),
      'sheet_confirm',
    ];
    const tail: AppTutorialPhase[] = [
      'tab_goals',
      'tab_my_judges',
      'tab_pulse',
      'tab_friends',
      'tab_profile_menu',
    ];
    const ordered: AppTutorialPhase[] = ['welcome', 'fab', ...sheetPhases, ...tail];
    const idx = ordered.indexOf(phase);
    const current = idx >= 0 ? idx + 1 : 0;
    const total = ordered.length;
    return { progressCurrent: current, progressTotal: total };
  }, [phase, createHadPaidStake]);

  const value = useMemo(
    (): AppTutorialContextValue => ({
      phase,
      tutorialBootBlocking,
      tutorialActive,
      fabSpotlight,
      sheetCloseLocked,
      highlightNavTab,
      profileMenuTutorial,
      createHadPaidStake,
      onCreateSheetStep,
      registerStakeChoice,
      onWelcomeContinue,
      goBackToWelcomeFromFab,
      goBackToFabFromSheet,
      goBackFromTabGoalsToSheet,
      onFabPhaseCreateOpened,
      onGoalCreatedInTutorial,
      advanceTabTour,
      goBackTabTour,
      exitTutorial,
      progressCurrent,
      progressTotal,
    }),
    [
      phase,
      tutorialBootBlocking,
      tutorialActive,
      fabSpotlight,
      sheetCloseLocked,
      highlightNavTab,
      profileMenuTutorial,
      createHadPaidStake,
      onCreateSheetStep,
      registerStakeChoice,
      onWelcomeContinue,
      goBackToWelcomeFromFab,
      goBackToFabFromSheet,
      goBackFromTabGoalsToSheet,
      onFabPhaseCreateOpened,
      onGoalCreatedInTutorial,
      advanceTabTour,
      goBackTabTour,
      exitTutorial,
      progressCurrent,
      progressTotal,
    ],
  );

  return <AppTutorialContext.Provider value={value}>{children}</AppTutorialContext.Provider>;
}

export function useAppTutorial(): AppTutorialContextValue {
  const ctx = useContext(AppTutorialContext);
  if (!ctx) {
    throw new Error('useAppTutorial must be used within AppTutorialProvider');
  }
  return ctx;
}
