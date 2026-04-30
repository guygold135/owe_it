import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus } from 'lucide-react';
import { TutorialCard } from '@/components/TutorialCard';
import { useAppTutorial } from '@/hooks/useAppTutorial';

export function AppTutorialChrome({ onCloseCreateSheet }: { onCloseCreateSheet: () => void }) {
  const {
    phase,
    tutorialBootBlocking,
    tutorialActive,
    fabSpotlight,
    onWelcomeContinue,
    goBackToWelcomeFromFab,
    goBackFromTabGoalsToSheet,
    advanceTabTour,
    goBackTabTour,
    exitTutorial,
    progressCurrent,
    progressTotal,
  } = useAppTutorial();

  const handleExit = async () => {
    await exitTutorial();
    onCloseCreateSheet();
  };

  if (tutorialBootBlocking) {
    return <div className="fixed inset-0 z-[120] bg-background" aria-hidden />;
  }

  if (!tutorialActive) return null;

  return (
    <>
      <AlertDialog open={phase === 'welcome'}>
        <AlertDialogContent
          overlayClassName="bg-background"
          className="max-w-xl rounded-3xl border border-white/10 bg-[#141414] p-6 pt-5 text-foreground shadow-xl sm:p-7 sm:pt-6"
        >
          <AlertDialogHeader className="space-y-3 text-center sm:text-center">
            <AlertDialogTitle className="font-display text-center text-xl text-foreground">
              Welcome to Owe It!
            </AlertDialogTitle>
            <AlertDialogDescription
              asChild
              className="text-center text-base font-medium leading-relaxed text-pretty text-foreground sm:text-lg"
            >
              <p>
                if you got here then you are ready to commit.
                <br />
                press the continue button if that is the case.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="!flex-row w-full sm:justify-stretch">
            <AlertDialogAction
              className="m-0 h-11 w-full rounded-xl text-base font-display font-bold bg-primary text-primary-foreground sm:mt-0"
              onClick={onWelcomeContinue}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {fabSpotlight ? (
        <>
          {/* Block and dim the whole app except layers above z-[42] (nav + FAB at z-[43], card at z-[44]). */}
          <div
            className="fixed inset-0 z-[42] bg-background/70 backdrop-blur-[3px] pointer-events-auto"
            aria-hidden
          />
          <div className="fixed inset-0 z-[44] pointer-events-none">
          {/* Only the card captures clicks; do not use a full-width bottom strip or padding with pointer-events-auto or it blocks the + button. */}
          <div className="pointer-events-none absolute left-0 right-0 mx-auto max-w-xl px-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6">
            <div className="pointer-events-auto w-full">
              <TutorialCard
                variant="chrome"
                body={
                  <p className="text-pretty">
                    <span className="text-foreground">Let&apos;s start with how to create a goal.</span> Tap the{' '}
                    <span className="mx-1 inline-flex h-5 w-5 items-center justify-center rounded-[6.5px] bg-primary align-[-0.125rem] glow-primary">
                      <Plus className="h-3 w-3 text-primary-foreground" />
                    </span>{' '}
                    button below.
                  </p>
                }
                exitPlacement="top-right"
                onGoBack={goBackToWelcomeFromFab}
                onExit={() => void handleExit()}
                progressCurrent={progressCurrent}
                progressTotal={progressTotal}
              />
            </div>
          </div>
        </div>
        </>
      ) : null}

      {phase === 'tab_goals' ? (
        <>
          <div className="fixed inset-0 z-[45] bg-background/70 backdrop-blur-[2px]" aria-hidden />
          <div className="fixed bottom-0 left-0 right-0 z-[46] mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pointer-events-auto sm:px-6">
            <TutorialCard
              variant="chrome"
              title="Your goals"
              body={
                <p className="text-pretty">Here you can see all of your active goals.</p>
              }
              exitPlacement="top-right"
              primaryLabel="Continue"
              onPrimary={advanceTabTour}
              onGoBack={() => void goBackFromTabGoalsToSheet()}
              onExit={() => void handleExit()}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
            />
          </div>
        </>
      ) : null}

      {phase === 'tab_my_judges' ? (
        <>
          <div className="fixed inset-0 z-[45] bg-background/70 backdrop-blur-[2px]" aria-hidden />
          <div className="fixed bottom-0 left-0 right-0 z-[46] mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pointer-events-auto sm:px-6">
            <TutorialCard
              variant="chrome"
              title="Goals you judge"
              body={
                <p className="text-pretty">
                  Here you can see and manage your friends goals that have intrusted you to judge them.
                </p>
              }
              exitPlacement="top-right"
              primaryLabel="Continue"
              onPrimary={advanceTabTour}
              onGoBack={goBackTabTour}
              onExit={() => void handleExit()}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
            />
          </div>
        </>
      ) : null}

      {phase === 'tab_pulse' ? (
        <>
          <div className="fixed inset-0 z-[45] bg-background/70 backdrop-blur-[2px]" aria-hidden />
          <div className="fixed bottom-0 left-0 right-0 z-[46] mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pointer-events-auto sm:px-6">
            <TutorialCard
              variant="chrome"
              title="Pulse"
              body={
                <p className="text-pretty">
                  Here you will be able to see recent actions that your friends have made.
                </p>
              }
              exitPlacement="top-right"
              primaryLabel="Continue"
              onPrimary={advanceTabTour}
              onGoBack={goBackTabTour}
              onExit={() => void handleExit()}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
            />
          </div>
        </>
      ) : null}

      {phase === 'tab_friends' ? (
        <>
          <div className="fixed inset-0 z-[45] bg-background/70 backdrop-blur-[2px]" aria-hidden />
          <div className="fixed bottom-0 left-0 right-0 z-[46] mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pointer-events-auto sm:px-6">
            <TutorialCard
              variant="chrome"
              title="Friends"
              body={
                <p className="text-pretty">
                  Here you can see your friends and invite new ones, make sure you add your trusted friends so they can
                  judge your future goals honestly and help you achive them.
                </p>
              }
              exitPlacement="top-right"
              primaryLabel="Continue"
              onPrimary={advanceTabTour}
              onGoBack={goBackTabTour}
              onExit={() => void handleExit()}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
            />
          </div>
        </>
      ) : null}

      {phase === 'tab_profile_menu' ? (
        <>
          <div className="fixed inset-0 z-[45] bg-background/70 backdrop-blur-[2px]" aria-hidden />
          <div className="fixed bottom-0 left-0 right-0 z-[46] mx-auto max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pointer-events-auto sm:px-6">
            <TutorialCard
              variant="chrome"
              title="More options"
              body={
                <p className="text-pretty">
                  Tap the avatar button to open this menu. Here you can find more options.
                </p>
              }
              exitPlacement="top-right"
              primaryLabel="Finish"
              onPrimary={advanceTabTour}
              onExit={() => void handleExit()}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
