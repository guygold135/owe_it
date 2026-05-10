import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { animate, motion } from 'framer-motion';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useGoals } from '@/hooks/useGoals';
import { useAuth } from '@/hooks/useAuth';
import { useDeadlineReminderTriggers } from '@/hooks/useDeadlineReminderTriggers';
import { useDeadlineLocalToasts } from '@/hooks/useDeadlineLocalToasts';
import { useAutoExpireGoals } from '@/hooks/useAutoExpireGoals';
import { useDashboardVisibleContracts } from '@/hooks/useDashboardVisibleContracts';
import { useResolvedGoalSpotlight } from '@/hooks/useResolvedGoalSpotlight';
import { StakeCard } from '@/components/StakeCard';
import { ResolvedGoalSpotlight } from '@/components/ResolvedGoalSpotlight';
import { ChevronDown, Edit2, Plus, Trash2, TriangleAlert, Trophy } from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { DashboardStatsSkeleton, GoalsListSkeleton } from '@/components/PageSkeletons';
import { convertStakeAmount, formatStakeAmount } from '@/lib/currency';
import { convertStakeAmountLive } from '@/lib/exchangeRates';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { unmarkTutorialCreatedGoal } from '@/lib/appTutorial';
import {
  loadDashboardGoalOrder,
  mergeGoalIdsWithSavedOrder,
  mergeServerGoalOrderWithContracts,
  parseGoalOrderIdsPayload,
  saveDashboardGoalOrder,
} from '@/lib/dashboardGoalOrder';
import { fetchUserDashboardLayout, upsertUserDashboardLayout } from '@/lib/dashboardLayoutRemote';
import { useCategoryHasSoonDeadline } from '@/hooks/useCountdown';
import type { Goal } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DASHBOARD_UNCATEGORIZED_DROP_ZONE,
  dashboardCategoryDropZoneId,
  defaultOrganizerState,
  ensureGoalRow,
  flattenGoalSectionOrderFromOrganizer,
  loadDashboardOrganizer,
  normalizeSectionOrder,
  parseDashboardOrganizerPayload,
  parseDashboardDropZone,
  parseSectionSortableId,
  partitionGoalsByCategorySections,
  pruneOrganizerGoals,
  saveDashboardOrganizer,
  sectionSortableId,
  UNCATEGORIZED_SECTION_KEY,
  type DashboardOrganizerState,
  type GoalAccentPreset,
} from '@/lib/dashboardGoalOrganizer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const DND_ACTIVATION_MS = 320;

/**
 * A single long cubic from the curl (p3) to the FAB aliases and looks jagged on tall viewports.
 * Keep the decorative cubics, then after a fixed distance along the chord use a straight segment.
 */
function emptyHintArrowTailFromP3(
  p3: { x: number; y: number },
  c1d: { x: number; y: number },
  ex: number,
  ey: number,
  clampY: (y: number) => number,
  fallbackC2d: { x: number; y: number },
): string[] {
  const chordDx = ex - p3.x;
  const chordDy = ey - p3.y;
  const chordLen = Math.hypot(chordDx, chordDy);
  if (chordLen < 2) {
    return [`C ${c1d.x} ${c1d.y}, ${fallbackC2d.x} ${fallbackC2d.y}, ${ex} ${ey}`];
  }
  const ux = chordDx / chordLen;
  const uy = chordDy / chordLen;

  const SPLIT_IF_LONGER_THAN = 280;
  if (chordLen < SPLIT_IF_LONGER_THAN) {
    return [`C ${c1d.x} ${c1d.y}, ${fallbackC2d.x} ${fallbackC2d.y}, ${ex} ${ey}`];
  }

  const STRAIGHT_START_ALONG = 210;
  const smoothCap = Math.min(115, chordLen * 0.18);
  const along = Math.min(Math.max(smoothCap, STRAIGHT_START_ALONG), chordLen - 32);

  const jx = p3.x + ux * along;
  const jy = clampY(p3.y + uy * along);
  const handle = Math.min(along * 0.38, 95);
  const c2d = { x: jx - ux * handle, y: clampY(jy - uy * handle) };

  return [`C ${c1d.x} ${c1d.y}, ${c2d.x} ${c2d.y}, ${jx} ${jy}`, `L ${ex} ${ey}`];
}

/** Insert vertical slack *above* the fixed loop when start→FAB gap exceeds a baseline (tall layouts). */
function emptyHintStretchAboveLoop(gapY: number): number {
  const STRETCH_AFTER_GAP = 400;
  const MAX_EXTRA = 280;
  if (gapY <= STRETCH_AFTER_GAP) return 0;
  return Math.min((gapY - STRETCH_AFTER_GAP) * 0.48, MAX_EXTRA);
}

/** Nested goals + section sortables confuse `closestCorners`; section drags must only hit section ids. */
function dashboardCollisionDetection(getGoalIds: () => string[]): CollisionDetection {
  return (args) => {
    const activeId = String(args.active.id);
    const sectionDrag = parseSectionSortableId(activeId) !== undefined;
    const filtered = args.droppableContainers.filter((c) => {
      const id = String(c.id);
      if (sectionDrag) return parseSectionSortableId(id) !== undefined;
      if (parseSectionSortableId(id) !== undefined) return true;
      if (parseDashboardDropZone(id) !== undefined) return true;
      return getGoalIds().includes(id);
    });
    const list = filtered.length > 0 ? filtered : args.droppableContainers;
    return closestCorners({ ...args, droppableContainers: list });
  };
}

type SectionContainerKey = 'uncategorized' | string;

function containerOfGoal(goalId: string, orderedIds: string[], organizer: DashboardOrganizerState): SectionContainerKey {
  const { uncategorized, byCategoryId } = partitionGoalsByCategorySections(orderedIds, organizer);
  if (uncategorized.includes(goalId)) return 'uncategorized';
  for (const c of organizer.categories) {
    if (byCategoryId[c.id]?.includes(goalId)) return c.id;
  }
  return 'uncategorized';
}

function DashboardDragOverlayPreview({
  overlayActiveId,
  organizerState,
  contractGoalById,
  goalsOrganizerEditMode,
  onOrganizerAccentChange,
}: {
  overlayActiveId: string;
  organizerState: DashboardOrganizerState;
  contractGoalById: Map<string, Goal>;
  goalsOrganizerEditMode: boolean;
  onOrganizerAccentChange: (goalId: string, accent: GoalAccentPreset) => void;
}) {
  const secKey = parseSectionSortableId(overlayActiveId);
  if (secKey !== undefined) {
    const title =
      secKey === UNCATEGORIZED_SECTION_KEY
        ? 'Uncategorized'
        : organizerState.categories.find((c) => c.id === secKey)?.name ?? 'Category';
    return (
      <div className="pointer-events-none rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl ring-2 ring-primary/20">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
    );
  }
  const overlayGoal = contractGoalById.get(overlayActiveId);
  if (!overlayGoal) return null;
  return (
    <div className="pointer-events-none w-[min(100vw-3rem,32rem)] max-w-lg">
      <StakeCard
        goal={overlayGoal}
        tutorialCreated={Boolean(overlayGoal.createdDuringAppTutorial)}
        organizerEditMode={goalsOrganizerEditMode}
        goalOrganizer={ensureGoalRow(organizerState, overlayGoal.id)}
        onOrganizerAccentChange={onOrganizerAccentChange}
        accentPickerOpen={false}
        onAccentPickerOpenChange={() => {}}
      />
    </div>
  );
}

function mergeSectionIntoFlatOrder(
  organizer: DashboardOrganizerState,
  previousOrdered: string[],
  sectionKey: SectionContainerKey,
  updatedSectionList: string[],
): string[] {
  const { uncategorized, byCategoryId } = partitionGoalsByCategorySections(previousOrdered, organizer);
  const nextUncat = sectionKey === 'uncategorized' ? updatedSectionList : uncategorized;
  const nextBy =
    sectionKey === 'uncategorized'
      ? byCategoryId
      : { ...byCategoryId, [sectionKey]: updatedSectionList };
  return flattenGoalSectionOrderFromOrganizer(organizer, nextUncat, nextBy);
}

/** Move goal to a category (or uncategorized) and return next organizer + flat goal order. */
function applyGoalToCategoryOrder(
  org: DashboardOrganizerState,
  activeGoalId: string,
  targetCatId: string | null,
  prevIds: string[],
): { nextOrg: DashboardOrganizerState; nextFlat: string[] } {
  const nextGoals = {
    ...org.goals,
    [activeGoalId]: { ...ensureGoalRow(org, activeGoalId), categoryId: targetCatId },
  };
  const nextOrg: DashboardOrganizerState = { ...org, goals: nextGoals };
  const rest = prevIds.filter((id) => id !== activeGoalId);
  const { uncategorized, byCategoryId } = partitionGoalsByCategorySections(rest, nextOrg);
  const nextFlat =
    targetCatId === null
      ? flattenGoalSectionOrderFromOrganizer(nextOrg, [...uncategorized, activeGoalId], byCategoryId)
      : flattenGoalSectionOrderFromOrganizer(nextOrg, uncategorized, {
          ...byCategoryId,
          [targetCatId]: [...(byCategoryId[targetCatId] ?? []), activeGoalId],
        });
  return { nextOrg, nextFlat };
}

/** Uncategorized goals (no section chrome); keeps uncategorized droppable for edit mode. */
function DashboardUncategorizedGoalsBlock({
  editMode,
  goalIds,
  children,
}: {
  editMode: boolean;
  goalIds: string[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: DASHBOARD_UNCATEGORIZED_DROP_ZONE,
    disabled: !editMode,
  });

  if (!editMode && goalIds.length === 0) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'space-y-4',
        editMode && goalIds.length === 0 && 'flex min-h-14 flex-col justify-center rounded-2xl border border-dashed border-border/80 px-2 py-2',
        editMode && goalIds.length > 0 && 'rounded-2xl px-0.5 py-0.5',
        editMode && isOver && 'bg-primary/[0.06] ring-2 ring-primary/25 ring-offset-2 ring-offset-background',
      )}
    >
      {children}
    </div>
  );
}

function DashboardSortableCategorySection({
  sectionKey,
  title,
  zoneId,
  editMode,
  goalIds,
  contractGoalById,
  onRemoveCategory,
  children,
}: {
  sectionKey: string;
  title: string;
  zoneId: string;
  editMode: boolean;
  goalIds: string[];
  contractGoalById: Map<string, Goal>;
  onRemoveCategory?: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasSoonDeadline = useCategoryHasSoonDeadline(goalIds, contractGoalById);
  const sortId = sectionSortableId(sectionKey);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortId,
    disabled: !editMode,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: zoneId, disabled: !editMode || collapsed });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        'space-y-2 rounded-2xl border border-border/90 bg-card/20 p-3 shadow-sm',
        isDragging && 'z-[1]',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3 py-2',
          editMode && 'cursor-grab active:cursor-grabbing',
        )}
        {...(editMode ? { ...attributes, ...listeners } : {})}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={`dashboard-category-goals-${sectionKey}`}
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200 ease-out',
                collapsed && '-rotate-90',
              )}
              aria-hidden
            />
          </button>
          <h3 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 font-display text-sm font-bold uppercase tracking-wide text-foreground">
            <span className="min-w-0 truncate">{title}</span>
            {collapsed && goalIds.length > 0 ? (
              <span className="shrink-0 tabular-nums text-muted-foreground">({goalIds.length})</span>
            ) : null}
          </h3>
          {collapsed && hasSoonDeadline ? (
            <TriangleAlert
              className="h-4 w-4 shrink-0 text-orange-500"
              aria-hidden
              title="Includes a goal due within 24 hours"
            />
          ) : null}
        </div>
        {editMode && onRemoveCategory ? (
          <button
            type="button"
            aria-label={`Remove category ${title}`}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveCategory();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <div
          id={`dashboard-category-goals-${sectionKey}`}
          ref={setDropRef}
          className={cn(
            'space-y-4',
            editMode &&
              goalIds.length === 0 &&
              'flex min-h-[252px] flex-col justify-center rounded-2xl border border-dashed border-border/80 px-2 py-3',
            editMode && goalIds.length > 0 && 'rounded-2xl px-0.5 py-0.5',
            editMode && isOver && 'bg-primary/[0.06] ring-2 ring-primary/25 ring-offset-2 ring-offset-background',
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function DashboardSortableGoalRow({
  goal,
  tutorialCreated,
  onDeleteTutorialGoal,
  dragPopSignal,
  dragPopTargetId,
  goalsOrganizerEditMode,
  goalOrganizer,
  onOrganizerAccentChange,
  accentPickerOpen,
  onAccentPickerOpenChange,
  dragDisabled,
}: {
  goal: Goal;
  tutorialCreated: boolean;
  onDeleteTutorialGoal?: (goalId: string) => void;
  dragPopSignal: number;
  dragPopTargetId: string | null;
  goalsOrganizerEditMode: boolean;
  goalOrganizer: ReturnType<typeof ensureGoalRow>;
  onOrganizerAccentChange: (goalId: string, accent: GoalAccentPreset) => void;
  accentPickerOpen: boolean;
  onAccentPickerOpenChange: (open: boolean) => void;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: goal.id,
    disabled: dragDisabled,
  });
  const popTargetRef = useRef<HTMLDivElement | null>(null);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  };

  useEffect(() => {
    if (goalsOrganizerEditMode) return;
    if (dragPopSignal === 0 || dragPopTargetId !== goal.id) return;
    const el = popTargetRef.current;
    if (!el) return;
    const controls = animate(
      el,
      { scale: [1, 1.02, 1] },
      { duration: 0.35, ease: [0.22, 1.28, 0.36, 1] },
    );
    return () => controls.stop();
  }, [goalsOrganizerEditMode, dragPopSignal, dragPopTargetId, goal.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && 'z-[1]',
        dragDisabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      )}
      {...attributes}
      {...listeners}
    >
      <div ref={popTargetRef} className="origin-center will-change-transform">
        <StakeCard
          goal={goal}
          tutorialCreated={tutorialCreated}
          onDeleteTutorialGoal={onDeleteTutorialGoal}
          organizerEditMode={goalsOrganizerEditMode}
          goalOrganizer={goalOrganizer}
          onOrganizerAccentChange={onOrganizerAccentChange}
          accentPickerOpen={accentPickerOpen}
          onAccentPickerOpenChange={onAccentPickerOpenChange}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { goals, loading, loadGoals, deleteGoal } = useGoals();
  const { currency: selectedCurrency } = useStakeCurrencyPreference({ listenForChanges: false });
  useAutoExpireGoals(goals, loadGoals, { enabled: true, loading });
  const activeGoals = useMemo(() => goals.filter(g => g.status === 'active'), [goals]);
  const activeGoalsFxKey = useMemo(
    () => activeGoals.map((g) => `${g.id}:${g.stake}:${g.stakeCurrency}`).join('|'),
    [activeGoals],
  );
  useDeadlineReminderTriggers(activeGoals);
  const deadlineLocalToastGoals = useMemo(
    () =>
      goals
        .filter((g) => g.status === 'active')
        .map((g) => ({ id: g.id, deadline: g.deadline, title: g.title, stake: g.stake, stakeCurrency: g.stakeCurrency })),
    [goals],
  );
  useDeadlineLocalToasts(deadlineLocalToastGoals);
  const totalAtRisk = activeGoals.reduce(
    (sum, g) => sum + convertStakeAmount(g.stake, g.stakeCurrency, selectedCurrency),
    0,
  );
  const [liveTotalAtRisk, setLiveTotalAtRisk] = useState(totalAtRisk);

  useEffect(() => {
    let cancelled = false;
    if (activeGoals.length === 0) {
      setLiveTotalAtRisk(0);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const converted = await Promise.all(
          activeGoals.map((g) => convertStakeAmountLive(g.stake, g.stakeCurrency, selectedCurrency)),
        );
        if (!cancelled) {
          setLiveTotalAtRisk(converted.reduce((sum, value) => sum + value, 0));
        }
      } catch {
        if (!cancelled) setLiveTotalAtRisk(totalAtRisk);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGoals, activeGoalsFxKey, selectedCurrency, totalAtRisk]);
  const watchingJudges = activeGoals.filter(g => !g.judge.isSelf).length;
  const completed = goals.filter(g => g.status === 'completed').length;
  const spotlightGoals = useResolvedGoalSpotlight(goals);
  const contractGoals = useDashboardVisibleContracts(goals);
  const spotlightGoalIds = useMemo(() => new Set(spotlightGoals.map((g) => g.id)), [spotlightGoals]);
  const [tutorialDeleteGoalId, setTutorialDeleteGoalId] = useState<string | null>(null);
  const emptyStateHintRef = useRef<HTMLDivElement | null>(null);
  const emptyStateInlinePlusRef = useRef<HTMLSpanElement | null>(null);
  const [emptyStateArrowPath, setEmptyStateArrowPath] = useState<string>('');
  const [emptyStateArrowCanvas, setEmptyStateArrowCanvas] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const emptyStateArrowPathRef = useRef('');
  const emptyStateArrowCanvasRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const sortedContractGoals = useMemo(
    () =>
      [...contractGoals]
        .filter((g) => !spotlightGoalIds.has(g.id))
        .sort((a, b) => {
        const aActive = a.status === 'active' ? 1 : 0;
        const bActive = b.status === 'active' ? 1 : 0;
        if (bActive !== aActive) return bActive - aActive;
        return (b.deadline?.getTime() ?? 0) - (a.deadline?.getTime() ?? 0);
      }),
    [contractGoals, spotlightGoalIds],
  );
  const showEmptyHint = sortedContractGoals.length === 0 && spotlightGoals.length === 0;

  useEffect(() => {
    if (!showEmptyHint) {
      emptyStateArrowPathRef.current = '';
      setEmptyStateArrowPath('');
      return;
    }

    let rafId = 0;
    const updateArrow = () => {
      const startEl = emptyStateInlinePlusRef.current;
      const hintEl = emptyStateHintRef.current;
      const endEl = document.querySelector('[data-create-goal-fab="true"]') as HTMLElement | null;
      const navInnerEl = document.querySelector('[data-bottom-nav-inner="true"]') as HTMLElement | null;
      if (!startEl || !hintEl || !endEl) {
        emptyStateArrowPathRef.current = '';
        setEmptyStateArrowPath('');
        return;
      }

      const start = startEl.getBoundingClientRect();
      const hint = hintEl.getBoundingClientRect();
      const end = endEl.getBoundingClientRect();
      // Anchor path in empty-hint local coordinates so the whole curve moves with the block.
      const sx = start.left + start.width / 2 - hint.left;
      const sy = start.top + start.height + 10 - hint.top;
      const ex = end.left + end.width / 2 - hint.left;
      const navTop = navInnerEl?.getBoundingClientRect().top ?? end.top;
      // Hard boundary: arrow must stay above the fixed bottom nav container.
      const navSafeTop = navTop - 18 - hint.top;
      // Lock endpoint toward FAB, but never allow touching/underlapping nav.
      const ey = Math.min(end.top + 8 - hint.top, navSafeTop);
      const clampY = (y: number) => Math.min(y, navSafeTop);

      const gapY = Math.max(ey - sy, 0);
      const extraY = emptyHintStretchAboveLoop(gapY);

      // Keep the existing mobile curve behavior exactly as-is.
      // On desktop/full-screen viewports, use a different end segment so the curl stays visible.
      const desktopWide = window.innerWidth >= 1000;
      const d = (() => {
        if (!desktopWide) {
          // Continuous cubic chain with tangent continuity, so the curve stays smooth near the bottom nav.
          // First segment only stretches vertically when `extraY` > 0; loop (p1→p2→p3) stays the same shape, shifted down.
          const span1 = extraY + 126;
          const p0 = { x: sx, y: sy };
          const p1 = { x: sx + 58, y: clampY(sy + extraY + 126) };
          const p2 = { x: sx + 78, y: clampY(sy + extraY + 76) };
          const p3 = { x: sx + 88, y: clampY(sy + extraY + 148) };

          const c1a = { x: sx - 6, y: clampY(sy + (64 / 126) * span1) };
          const c2a = { x: sx + 18, y: clampY(sy + (120 / 126) * span1) };

          const c1b = { x: 2 * p1.x - c2a.x, y: clampY(2 * p1.y - c2a.y) };
          const c2b = { x: sx + 108, y: clampY(p1.y - 30) };

          const c1c = { x: 2 * p2.x - c2b.x, y: clampY(2 * p2.y - c2b.y) };
          const c2c = { x: sx + 44, y: clampY(p1.y) };

          const c1d = { x: 2 * p3.x - c2c.x, y: clampY(2 * p3.y - c2c.y) };
          const c2dFallback = { x: ex - 22, y: clampY(ey - 118) };

          return [
            `M ${p0.x} ${p0.y}`,
            `C ${c1a.x} ${c1a.y}, ${c2a.x} ${c2a.y}, ${p1.x} ${p1.y}`,
            `C ${c1b.x} ${c1b.y}, ${c2b.x} ${c2b.y}, ${p2.x} ${p2.y}`,
            `C ${c1c.x} ${c1c.y}, ${c2c.x} ${c2c.y}, ${p3.x} ${p3.y}`,
            ...emptyHintArrowTailFromP3(p3, c1d, ex, ey, clampY, c2dFallback),
          ].join(' ');
        }

        const dx = Math.max(ex - sx, 0);
        const tailLift = Math.min(Math.max(dx * 0.22, 60), 120);

        const span1 = extraY + 132;
        const p0 = { x: sx, y: sy };
        const p1 = { x: sx + 64, y: clampY(sy + extraY + 132) };
        const p2 = { x: sx + 94, y: clampY(sy + extraY + 82) };
        const p3 = { x: sx + 104, y: clampY(sy + extraY + 156) };

        const c1a = { x: sx - 8, y: clampY(sy + (66 / 132) * span1) };
        const c2a = { x: sx + 22, y: clampY(sy + (124 / 132) * span1) };

        const c1b = { x: 2 * p1.x - c2a.x, y: clampY(2 * p1.y - c2a.y) };
        const c2b = { x: sx + 118, y: clampY(p1.y - 30) };

        const c1c = { x: 2 * p2.x - c2b.x, y: clampY(2 * p2.y - c2b.y) };
        const c2c = { x: sx + 50, y: clampY(p1.y) };

        const c1d = { x: 2 * p3.x - c2c.x, y: clampY(2 * p3.y - c2c.y) };
        const c2dFallback = {
          x: ex - Math.min(Math.max(dx * 0.06, 12), 26),
          y: clampY(ey - (132 + tailLift + Math.min(Math.max(dx * 0.1, 22), 44))),
        };

        return [
          `M ${p0.x} ${p0.y}`,
          `C ${c1a.x} ${c1a.y}, ${c2a.x} ${c2a.y}, ${p1.x} ${p1.y}`,
          `C ${c1b.x} ${c1b.y}, ${c2b.x} ${c2b.y}, ${p2.x} ${p2.y}`,
          `C ${c1c.x} ${c1c.y}, ${c2c.x} ${c2c.y}, ${p3.x} ${p3.y}`,
          ...emptyHintArrowTailFromP3(p3, c1d, ex, ey, clampY, c2dFallback),
        ].join(' ');
      })();

      if (emptyStateArrowPathRef.current !== d) {
        emptyStateArrowPathRef.current = d;
        setEmptyStateArrowPath(d);
      }

      const nextCanvas = {
        w: Math.max(Math.ceil(hint.width), Math.ceil(ex + 48), Math.ceil(sx + 120), 1),
        h: Math.max(Math.ceil(hint.height), Math.ceil(ey + 48), Math.ceil(sy + 180 + extraY), 1),
      };
      if (
        emptyStateArrowCanvasRef.current.w !== nextCanvas.w ||
        emptyStateArrowCanvasRef.current.h !== nextCanvas.h
      ) {
        emptyStateArrowCanvasRef.current = nextCanvas;
        setEmptyStateArrowCanvas(nextCanvas);
      }
    };

    const frameLoop = () => {
      updateArrow();
      rafId = requestAnimationFrame(frameLoop);
    };

    frameLoop();
    window.addEventListener('resize', updateArrow);
    window.visualViewport?.addEventListener('resize', updateArrow);
    // On refresh, BottomNav/FAB can mount slightly after the empty-state block.
    // Observe DOM mutations so the arrow draws as soon as both anchors exist.
    const observer = new MutationObserver(() => {
      updateArrow();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateArrow);
      window.visualViewport?.removeEventListener('resize', updateArrow);
      observer.disconnect();
    };
  }, [showEmptyHint]);

  const [orderedGoalIds, setOrderedGoalIds] = useState<string[]>([]);

  useEffect(() => {
    const ids = sortedContractGoals.map((g) => g.id);
    setOrderedGoalIds((prev) => {
      if (ids.length === 0) return [];
      if (prev.length === 0) return mergeGoalIdsWithSavedOrder(ids, user?.id);
      const idSet = new Set(ids);
      const kept = prev.filter((id) => idSet.has(id));
      const added = ids.filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [sortedContractGoals, user?.id]);

  const contractGoalById = useMemo(
    () => new Map(sortedContractGoals.map((g) => [g.id, g])),
    [sortedContractGoals],
  );

  const [organizerState, setOrganizerState] = useState<DashboardOrganizerState>(() => defaultOrganizerState());
  const [goalsOrganizerEditMode, setGoalsOrganizerEditMode] = useState(false);
  const [addCategoryPanelOpen, setAddCategoryPanelOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [accentPickerGoalId, setAccentPickerGoalId] = useState<string | null>(null);
  const [layoutRemoteReady, setLayoutRemoteReady] = useState(false);
  const layoutRemoteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutUpsertInFlightRef = useRef(false);

  const organizerStateRef = useRef(organizerState);
  organizerStateRef.current = organizerState;
  const goalsOrganizerEditModeRef = useRef(goalsOrganizerEditMode);
  goalsOrganizerEditModeRef.current = goalsOrganizerEditMode;

  useEffect(() => {
    if (!goalsOrganizerEditMode) {
      setAccentPickerGoalId(null);
      setAddCategoryPanelOpen(false);
    }
  }, [goalsOrganizerEditMode]);

  useEffect(() => {
    if (!user?.id) {
      setOrganizerState(defaultOrganizerState());
      setGoalsOrganizerEditMode(false);
      return;
    }
    setOrganizerState(loadDashboardOrganizer(user.id));
  }, [user?.id]);

  const contractIdsKey = useMemo(
    () => [...sortedContractGoals.map((g) => g.id)].sort().join(','),
    [sortedContractGoals],
  );

  useEffect(() => {
    if (!user?.id || loading) return;
    const ids = new Set(sortedContractGoals.map((g) => g.id));
    setOrganizerState((s) => pruneOrganizerGoals(s, ids));
  }, [user?.id, loading, contractIdsKey, sortedContractGoals]);

  useEffect(() => {
    if (!user?.id) {
      setLayoutRemoteReady(false);
      return;
    }
    if (loading) return;

    let cancelled = false;
    setLayoutRemoteReady(false);

    void (async () => {
      try {
        const row = await fetchUserDashboardLayout(user.id);
        if (cancelled) return;

        const contractIds = sortedContractGoals.map((g) => g.id);
        const idSet = new Set(contractIds);

        if (row?.organizer != null && typeof row.organizer === 'object') {
          const org = parseDashboardOrganizerPayload(row.organizer);
          const serverOrder = parseGoalOrderIdsPayload(row.goal_order_ids) ?? [];
          const mergedOrder = mergeServerGoalOrderWithContracts(serverOrder, contractIds);
          const pruned = pruneOrganizerGoals(org, idSet);
          // Don't replace local organizer with a fetch that started before recent edits: the server
          // row can be stale until the debounced upsert finishes (accent, categories, order).
          const remoteWouldOverwritePendingLocal =
            goalsOrganizerEditModeRef.current ||
            layoutRemoteSaveTimerRef.current !== null ||
            layoutUpsertInFlightRef.current;
          if (!remoteWouldOverwritePendingLocal) {
            setOrganizerState(pruned);
            setOrderedGoalIds(mergedOrder);
            saveDashboardOrganizer(user.id, pruned);
            saveDashboardGoalOrder(user.id, mergedOrder);
          }
        } else {
          const localOrg = loadDashboardOrganizer(user.id);
          const saved = loadDashboardGoalOrder(user.id);
          const pruned = pruneOrganizerGoals(localOrg, idSet);
          const mergedOrder =
            saved?.length && saved.length > 0
              ? mergeServerGoalOrderWithContracts(saved, contractIds)
              : mergeGoalIdsWithSavedOrder(contractIds, user.id);
          await upsertUserDashboardLayout(user.id, pruned, mergedOrder);
        }
      } catch (e) {
        console.warn('Dashboard layout sync failed', e);
      } finally {
        if (!cancelled) setLayoutRemoteReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, loading, contractIdsKey, sortedContractGoals]);

  useEffect(() => {
    if (!user?.id) return;
    saveDashboardOrganizer(user.id, organizerState);
  }, [user?.id, organizerState]);

  const addOrganizerCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = `cat_${Date.now().toString(36)}`;
    setOrganizerState((s) => {
      const nextCats = [{ id, name }, ...s.categories];
      const prevSO = normalizeSectionOrder(s);
      const tail = prevSO.filter((k) => k !== UNCATEGORIZED_SECTION_KEY && k !== id);
      const nextSO = [UNCATEGORIZED_SECTION_KEY, id, ...tail];
      return { ...s, categories: nextCats, sectionOrder: nextSO };
    });
    setNewCategoryName('');
  }, [newCategoryName]);

  const removeOrganizerCategory = useCallback((categoryId: string) => {
    setOrganizerState((s) => {
      const nextCats = s.categories.filter((c) => c.id !== categoryId);
      const nextGoals = Object.fromEntries(
        Object.entries(s.goals).map(([gid, row]) => [
          gid,
          row.categoryId === categoryId ? { ...row, categoryId: null } : row,
        ]),
      );
      const draft: DashboardOrganizerState = {
        ...s,
        categories: nextCats,
        goals: nextGoals,
        sectionOrder: normalizeSectionOrder(s).filter((k) => k !== categoryId),
      };
      return { ...draft, sectionOrder: normalizeSectionOrder(draft) };
    });
  }, []);

  const onOrganizerAccentChange = useCallback((goalId: string, accent: GoalAccentPreset) => {
    setOrganizerState((s) => ({
      ...s,
      goals: {
        ...s.goals,
        [goalId]: { ...ensureGoalRow(s, goalId), accent },
      },
    }));
  }, []);

  const sortableGoalIds = useMemo(() => {
    const ids = sortedContractGoals.map((g) => g.id);
    if (ids.length === 0) return [];
    const sameLength = orderedGoalIds.length === ids.length;
    const sameMembers =
      sameLength && ids.every((id) => orderedGoalIds.includes(id)) && orderedGoalIds.every((id) => ids.includes(id));
    if (sameMembers) return orderedGoalIds;
    return mergeGoalIdsWithSavedOrder(ids, user?.id);
  }, [sortedContractGoals, orderedGoalIds, user?.id]);

  const sectionedPartition = useMemo(
    () => partitionGoalsByCategorySections(sortableGoalIds, organizerState),
    [organizerState, sortableGoalIds],
  );

  const normalizedSectionOrder = useMemo(
    () =>
      organizerState.categories.length > 0 ? normalizeSectionOrder(organizerState) : [],
    [organizerState],
  );

  const categorySectionOrder = useMemo(
    () => normalizedSectionOrder.filter((k) => k !== UNCATEGORIZED_SECTION_KEY),
    [normalizedSectionOrder],
  );

  const sortableGoalIdsRef = useRef(sortableGoalIds);
  sortableGoalIdsRef.current = sortableGoalIds;

  useEffect(() => {
    if (!user?.id || !layoutRemoteReady) return;
    if (layoutRemoteSaveTimerRef.current) clearTimeout(layoutRemoteSaveTimerRef.current);
    layoutRemoteSaveTimerRef.current = setTimeout(() => {
      layoutRemoteSaveTimerRef.current = null;
      layoutUpsertInFlightRef.current = true;
      void upsertUserDashboardLayout(user.id, organizerStateRef.current, sortableGoalIdsRef.current)
        .catch((err) => {
          console.warn('Dashboard layout save failed', err);
        })
        .finally(() => {
          layoutUpsertInFlightRef.current = false;
        });
    }, 600);
    return () => {
      if (layoutRemoteSaveTimerRef.current) clearTimeout(layoutRemoteSaveTimerRef.current);
    };
  }, [user?.id, layoutRemoteReady, organizerState, sortableGoalIds]);

  const organizerEditSnapshotRef = useRef<{
    organizer: DashboardOrganizerState;
    orderedGoalIds: string[];
  } | null>(null);

  const beginOrganizerEdit = useCallback(() => {
    organizerEditSnapshotRef.current = {
      organizer: JSON.parse(JSON.stringify(organizerStateRef.current)) as DashboardOrganizerState,
      orderedGoalIds: [...sortableGoalIdsRef.current],
    };
    setGoalsOrganizerEditMode(true);
  }, []);

  const commitOrganizerEdit = useCallback(() => {
    organizerEditSnapshotRef.current = null;
    setGoalsOrganizerEditMode(false);
    setAddCategoryPanelOpen(false);
    setAccentPickerGoalId(null);
    setNewCategoryName('');
  }, []);

  const cancelOrganizerEdit = useCallback(() => {
    const snap = organizerEditSnapshotRef.current;
    if (snap) {
      setOrganizerState(snap.organizer);
      setOrderedGoalIds(snap.orderedGoalIds);
      if (user?.id) {
        saveDashboardOrganizer(user.id, snap.organizer);
        saveDashboardGoalOrder(user.id, snap.orderedGoalIds);
      }
    }
    organizerEditSnapshotRef.current = null;
    setGoalsOrganizerEditMode(false);
    setAddCategoryPanelOpen(false);
    setAccentPickerGoalId(null);
    setNewCategoryName('');
  }, [user?.id]);

  const reorderPointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: DND_ACTIVATION_MS, tolerance: 10 },
  });
  const organizerPointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 0, tolerance: 12 },
  });
  const sensors = useSensors(
    goalsOrganizerEditMode ? organizerPointerSensor : reorderPointerSensor,
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [dragPopSignal, setDragPopSignal] = useState(0);
  const [dragPopTargetId, setDragPopTargetId] = useState<string | null>(null);

  const clearDragPopVisual = useCallback(() => setDragPopTargetId(null), []);

  const [overlayActiveId, setOverlayActiveId] = useState<string | null>(null);
  const [dashboardDndActive, setDashboardDndActive] = useState(false);

  const resetDragUi = useCallback(() => {
    setOverlayActiveId(null);
    clearDragPopVisual();
    setDashboardDndActive(false);
  }, [clearDragPopVisual]);

  const organizerCollisionDetection = useMemo(
    () => dashboardCollisionDetection(() => sortableGoalIdsRef.current),
    [],
  );

  const handleGoalDragEnd = useCallback(
    (event: DragEndEvent) => {
      resetDragUi();
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      const org = organizerStateRef.current;
      const editMode = goalsOrganizerEditModeRef.current;
      const prevIds = sortableGoalIdsRef.current;

      const activeSectionKey = parseSectionSortableId(activeId);
      const overSectionKey = parseSectionSortableId(overId);

      if (editMode && activeSectionKey && overSectionKey) {
        const so = normalizeSectionOrder(org);
        const oldIndex = so.indexOf(activeSectionKey);
        const newIndex = so.indexOf(overSectionKey);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
        const nextSO = arrayMove(so, oldIndex, newIndex);
        setOrganizerState({ ...org, sectionOrder: nextSO });
        return;
      }

      if (editMode && overSectionKey !== undefined && activeSectionKey === undefined) {
        const targetCatId =
          overSectionKey === UNCATEGORIZED_SECTION_KEY ? null : overSectionKey;
        const { nextOrg, nextFlat } = applyGoalToCategoryOrder(org, activeId, targetCatId, prevIds);
        setOrganizerState(nextOrg);
        setOrderedGoalIds(nextFlat);
        if (user?.id) saveDashboardGoalOrder(user.id, nextFlat);
        return;
      }

      const zoneDrop = parseDashboardDropZone(overId);
      if (editMode && zoneDrop !== undefined) {
        const targetCatId: string | null = zoneDrop;
        const { nextOrg, nextFlat } = applyGoalToCategoryOrder(org, activeId, targetCatId, prevIds);
        setOrganizerState(nextOrg);
        setOrderedGoalIds(nextFlat);
        if (user?.id) saveDashboardGoalOrder(user.id, nextFlat);
        return;
      }

      if (org.categories.length === 0) {
        if (!editMode) return;
        const oldIndex = prevIds.indexOf(activeId);
        const newIndex = prevIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const next = arrayMove(prevIds, oldIndex, newIndex);
        setOrderedGoalIds(next);
        if (user?.id) saveDashboardGoalOrder(user.id, next);
        return;
      }

      if (!editMode) return;
      if (parseSectionSortableId(activeId) !== undefined) return;

      const fromC = containerOfGoal(activeId, prevIds, org);
      const toC = containerOfGoal(overId, prevIds, org);

      if (fromC === toC) {
        const { uncategorized, byCategoryId } = partitionGoalsByCategorySections(prevIds, org);
        const list =
          fromC === 'uncategorized' ? [...uncategorized] : [...(byCategoryId[fromC] ?? [])];
        const oldIndex = list.indexOf(activeId);
        const newIndex = list.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return;
        if (oldIndex === newIndex) return;
        const moved = arrayMove(list, oldIndex, newIndex);
        const nextFlat = mergeSectionIntoFlatOrder(org, prevIds, fromC, moved);
        setOrderedGoalIds(nextFlat);
        if (user?.id) saveDashboardGoalOrder(user.id, nextFlat);
        return;
      }

      const nextCatForActive: string | null = toC === 'uncategorized' ? null : toC;
      const prevRow = ensureGoalRow(org, activeId);
      const nextGoals = {
        ...org.goals,
        [activeId]: { ...prevRow, categoryId: nextCatForActive },
      };
      const nextOrg: DashboardOrganizerState = { ...org, goals: nextGoals };

      const rest = prevIds.filter((id) => id !== activeId);
      const p = partitionGoalsByCategorySections(rest, nextOrg);
      const destList =
        toC === 'uncategorized' ? [...p.uncategorized] : [...(p.byCategoryId[toC] ?? [])];
      const overIndex = destList.indexOf(overId);
      if (overIndex < 0) return;
      destList.splice(overIndex, 0, activeId);

      const nextUncat = toC === 'uncategorized' ? destList : p.uncategorized;
      const nextBy =
        toC === 'uncategorized' ? p.byCategoryId : { ...p.byCategoryId, [toC]: destList };
      const nextFlat = flattenGoalSectionOrderFromOrganizer(nextOrg, nextUncat, nextBy);

      if (prevRow.categoryId !== nextCatForActive) {
        setOrganizerState(nextOrg);
      }
      setOrderedGoalIds(nextFlat);
      if (user?.id) saveDashboardGoalOrder(user.id, nextFlat);
    },
    [resetDragUi, user?.id],
  );

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 pr-4 text-base sm:text-xl font-display font-extrabold leading-snug tracking-tight text-balance text-foreground"
          >
            <span className="block whitespace-nowrap">Win for yourself or give for a cause.</span>
            <span className="block whitespace-nowrap">Either way, something good happens.</span>
          </motion.h1>
        </div>
        <UserProfilePopover />
      </div>

      {loading ? (
        <>
          <DashboardStatsSkeleton />
          <div className="px-6">
            <div className="h-8 w-36 bg-muted/60 animate-pulse rounded mb-4" />
            <GoalsListSkeleton />
          </div>
        </>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-6 p-6 rounded-[24px] bg-card border border-border mb-8"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-moneybag w-5 h-5 text-primary"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M9.5 3h5a1.5 1.5 0 0 1 1.5 1.5a3.5 3.5 0 0 1 -3.5 3.5h-1a3.5 3.5 0 0 1 -3.5 -3.5a1.5 1.5 0 0 1 1.5 -1.5" />
                    <path d="M4 17v-1a8 8 0 1 1 16 0v1a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4" />
                  </svg>
                </div>
                <p className="text-2xl font-display font-extrabold text-primary tabular-nums">
                  {formatStakeAmount(liveTotalAtRisk, selectedCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">At Risk</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-orange-500/10 flex items-center justify-center mb-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-flame w-5 h-5 text-orange-400"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235" />
                  </svg>
                </div>
                <p className="text-2xl font-display font-extrabold text-orange-400 tabular-nums">{activeGoals.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center mb-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-2xl font-display font-extrabold text-amber-400 tabular-nums">{completed}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
              </div>
            </div>
            {liveTotalAtRisk > 0 && (
              <p className="text-center text-xs text-muted-foreground mt-4">
                {watchingJudges > 0
                  ? watchingJudges === 1
                    ? '1 judge is watching.'
                    : `${watchingJudges} judges are watching.`
                  : ''}
              </p>
            )}
          </motion.div>

          <div className="px-6">
            <div className="mb-4 flex min-h-9 items-center justify-between gap-2">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground shrink-0">Active Goals</h2>
              <div className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2">
                {sortedContractGoals.length > 0 && goalsOrganizerEditMode && !addCategoryPanelOpen && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-2 rounded-xl font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setAddCategoryPanelOpen(true)}
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    Add category
                  </Button>
                )}
                {sortedContractGoals.length > 0 && goalsOrganizerEditMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-2 rounded-xl font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={cancelOrganizerEdit}
                  >
                    Cancel
                  </Button>
                )}
                {sortedContractGoals.length > 0 && goalsOrganizerEditMode && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="shrink-0 rounded-xl font-semibold"
                    onClick={commitOrganizerEdit}
                  >
                    Save
                  </Button>
                )}
                {sortedContractGoals.length > 0 && !goalsOrganizerEditMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-2 rounded-xl font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={beginOrganizerEdit}
                  >
                    <Edit2 className="h-4 w-4 shrink-0" aria-hidden />
                    Edit
                  </Button>
                )}
              </div>
            </div>
            {goalsOrganizerEditMode && sortedContractGoals.length > 0 && addCategoryPanelOpen && (
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOrganizerCategory();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setAddCategoryPanelOpen(false);
                    }
                  }}
                />
                <Button type="button" size="sm" className="shrink-0 rounded-xl font-semibold" onClick={addOrganizerCategory}>
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 rounded-xl font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    setAddCategoryPanelOpen(false);
                    setNewCategoryName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
            <ResolvedGoalSpotlight goals={spotlightGoals} />
            {showEmptyHint ? (
              <>
                <div ref={emptyStateHintRef} className="relative text-center pt-2 pb-10">
                  <p className="text-muted-foreground">no active goals</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    tap{' '}
                    <span
                      ref={emptyStateInlinePlusRef}
                      className="mx-1 inline-flex h-5 w-5 align-[-0.125rem] items-center justify-center rounded-[6.5px] bg-primary glow-primary"
                    >
                      <Plus className="h-3 w-3 text-primary-foreground" aria-hidden />
                    </span>{' '}
                    to creat a goal!
                  </p>
                  {/* Empty-state hint arrow is defined inside this block so it stays attached while scrolling. */}
                  <div className="pointer-events-none absolute inset-0 z-[35] overflow-visible" aria-hidden>
                    <svg
                      viewBox={`0 0 ${Math.max(emptyStateArrowCanvas.w, 1)} ${Math.max(emptyStateArrowCanvas.h, 1)}`}
                      className="overflow-visible opacity-90"
                      style={{
                        width: `${Math.max(emptyStateArrowCanvas.w, 1)}px`,
                        height: `${Math.max(emptyStateArrowCanvas.h, 1)}px`,
                      }}
                      preserveAspectRatio="xMinYMin meet"
                    >
                      <defs>
                        <marker
                          id="dashboard-empty-goals-arrowhead"
                          viewBox="0 0 12 12"
                          refX="10.5"
                          refY="6"
                          markerWidth="5"
                          markerHeight="5"
                          orient="auto"
                        >
                          <path d="M 0 0 L 12 6 L 0 12 z" fill="hsl(var(--primary))" />
                        </marker>
                      </defs>
                      {emptyStateArrowPath ? (
                        <path
                          d={emptyStateArrowPath}
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="1.35"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          markerEnd="url(#dashboard-empty-goals-arrowhead)"
                        />
                      ) : null}
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={
                  organizerState.categories.length > 0 ? organizerCollisionDetection : closestCenter
                }
                onDragStart={(e) => {
                  setOverlayActiveId(String(e.active.id));
                  if (goalsOrganizerEditModeRef.current) {
                    setDashboardDndActive(true);
                  }
                  const id = String(e.active.id);
                  if (parseSectionSortableId(id) !== undefined) {
                    setDragPopTargetId(null);
                    return;
                  }
                  setDragPopTargetId(id);
                  setDragPopSignal((n) => n + 1);
                }}
                onDragCancel={resetDragUi}
                onDragEnd={handleGoalDragEnd}
              >
                {organizerState.categories.length === 0 ? (
                  <SortableContext items={sortableGoalIds} strategy={verticalListSortingStrategy}>
                    <div
                      className={cn(
                        'space-y-4',
                        goalsOrganizerEditMode &&
                          (dashboardDndActive ? 'cursor-grabbing' : 'cursor-grab'),
                      )}
                    >
                      {sortableGoalIds
                        .map((id) => contractGoalById.get(id))
                        .filter((g): g is Goal => Boolean(g))
                        .map((goal) => (
                          <DashboardSortableGoalRow
                            key={goal.id}
                            goal={goal}
                            tutorialCreated={Boolean(goal.createdDuringAppTutorial)}
                            onDeleteTutorialGoal={(goalId) => setTutorialDeleteGoalId(goalId)}
                            dragPopSignal={dragPopSignal}
                            dragPopTargetId={dragPopTargetId}
                            goalsOrganizerEditMode={goalsOrganizerEditMode}
                            goalOrganizer={ensureGoalRow(organizerState, goal.id)}
                            onOrganizerAccentChange={onOrganizerAccentChange}
                            accentPickerOpen={accentPickerGoalId === goal.id}
                            onAccentPickerOpenChange={(open) => setAccentPickerGoalId(open ? goal.id : null)}
                            dragDisabled={!goalsOrganizerEditMode}
                          />
                        ))}
                    </div>
                  </SortableContext>
                ) : (
                  <SortableContext
                    items={categorySectionOrder.map(sectionSortableId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      className={cn(
                        'space-y-8',
                        goalsOrganizerEditMode &&
                          (dashboardDndActive ? 'cursor-grabbing' : 'cursor-grab'),
                      )}
                    >
                      {(sectionedPartition.uncategorized.length > 0 || goalsOrganizerEditMode) && (
                        <DashboardUncategorizedGoalsBlock
                          editMode={goalsOrganizerEditMode}
                          goalIds={sectionedPartition.uncategorized}
                        >
                          {sectionedPartition.uncategorized.length > 0 ? (
                            <SortableContext
                              items={sectionedPartition.uncategorized}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-4">
                                {sectionedPartition.uncategorized
                                  .map((id) => contractGoalById.get(id))
                                  .filter((g): g is Goal => Boolean(g))
                                  .map((goal) => (
                                    <DashboardSortableGoalRow
                                      key={goal.id}
                                      goal={goal}
                                      tutorialCreated={Boolean(goal.createdDuringAppTutorial)}
                                      onDeleteTutorialGoal={(goalId) => setTutorialDeleteGoalId(goalId)}
                                      dragPopSignal={dragPopSignal}
                                      dragPopTargetId={dragPopTargetId}
                                      goalsOrganizerEditMode={goalsOrganizerEditMode}
                                      goalOrganizer={ensureGoalRow(organizerState, goal.id)}
                                      onOrganizerAccentChange={onOrganizerAccentChange}
                                      accentPickerOpen={accentPickerGoalId === goal.id}
                                      onAccentPickerOpenChange={(open) =>
                                        setAccentPickerGoalId(open ? goal.id : null)
                                      }
                                      dragDisabled={!goalsOrganizerEditMode}
                                    />
                                  ))}
                              </div>
                            </SortableContext>
                          ) : null}
                        </DashboardUncategorizedGoalsBlock>
                      )}
                      {categorySectionOrder.map((sectionKey) => {
                        const title =
                          organizerState.categories.find((c) => c.id === sectionKey)?.name ?? 'Category';
                        const goalIds = sectionedPartition.byCategoryId[sectionKey] ?? [];
                        const zoneId = dashboardCategoryDropZoneId(sectionKey);
                        return (
                          <DashboardSortableCategorySection
                            key={sectionKey}
                            sectionKey={sectionKey}
                            title={title}
                            zoneId={zoneId}
                            editMode={goalsOrganizerEditMode}
                            goalIds={goalIds}
                            contractGoalById={contractGoalById}
                            onRemoveCategory={() => removeOrganizerCategory(sectionKey)}
                          >
                            <SortableContext items={goalIds} strategy={verticalListSortingStrategy}>
                              <div className="space-y-4">
                                {goalIds
                                  .map((id) => contractGoalById.get(id))
                                  .filter((g): g is Goal => Boolean(g))
                                  .map((goal) => (
                                    <DashboardSortableGoalRow
                                      key={goal.id}
                                      goal={goal}
                                      tutorialCreated={Boolean(goal.createdDuringAppTutorial)}
                                      onDeleteTutorialGoal={(goalId) => setTutorialDeleteGoalId(goalId)}
                                      dragPopSignal={dragPopSignal}
                                      dragPopTargetId={dragPopTargetId}
                                      goalsOrganizerEditMode={goalsOrganizerEditMode}
                                      goalOrganizer={ensureGoalRow(organizerState, goal.id)}
                                      onOrganizerAccentChange={onOrganizerAccentChange}
                                      accentPickerOpen={accentPickerGoalId === goal.id}
                                      onAccentPickerOpenChange={(open) =>
                                        setAccentPickerGoalId(open ? goal.id : null)
                                      }
                                      dragDisabled={!goalsOrganizerEditMode}
                                    />
                                  ))}
                              </div>
                            </SortableContext>
                          </DashboardSortableCategorySection>
                        );
                      })}
                    </div>
                  </SortableContext>
                )}
                <DragOverlay dropAnimation={null} zIndex={200}>
                  {overlayActiveId ? (
                    <DashboardDragOverlayPreview
                      overlayActiveId={overlayActiveId}
                      organizerState={organizerState}
                      contractGoalById={contractGoalById}
                      goalsOrganizerEditMode={goalsOrganizerEditMode}
                      onOrganizerAccentChange={onOrganizerAccentChange}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </>
      )}
      <AlertDialog open={tutorialDeleteGoalId !== null} onOpenChange={(o) => !o && setTutorialDeleteGoalId(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete tutorial goal?</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-muted-foreground">
              This goal is deletable only because it was created during the tutorial. Future goals are real commitment
              contracts and cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-display font-semibold mt-0">Keep goal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-display font-bold"
              onClick={async () => {
                if (!tutorialDeleteGoalId) return;
                try {
                  await deleteGoal(tutorialDeleteGoalId);
                  unmarkTutorialCreatedGoal(tutorialDeleteGoalId);
                } finally {
                  setTutorialDeleteGoalId(null);
                }
              }}
            >
              Yes, delete tutorial goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
