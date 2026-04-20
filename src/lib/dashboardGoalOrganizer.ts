export type GoalAccentPreset =
  | 'default'
  | 'primary'
  | 'warning'
  | 'sky'
  | 'violet'
  | 'rose'
  | 'emerald'
  | 'orange';

export type DashboardCategory = {
  id: string;
  name: string;
};

export type GoalOrganizerRow = {
  categoryId: string | null;
  accent: GoalAccentPreset;
};

export type DashboardOrganizerState = {
  categories: DashboardCategory[];
  /** Per goal id */
  goals: Record<string, GoalOrganizerRow>;
  /**
   * Visual order of sections: `uncategorized` token, then category ids.
   * Omitted in storage until first category exists; normalized on load.
   */
  sectionOrder?: string[];
};

const storageKey = (userId: string) => `oweit_dashboard_organizer:${userId}`;

/** Section key for the uncategorized bucket (matches drop-zone semantics). */
export const UNCATEGORIZED_SECTION_KEY = 'uncategorized';

export const GOAL_ACCENT_PRESETS: {
  id: GoalAccentPreset;
  label: string;
  /** HSL triplet for `hsl(var(--goal-border-accent) / …)` */
  hsl: string;
}[] = [
  /** Neutral swatch — distinct from Mint; card still uses theme border when accent is default */
  { id: 'default', label: 'Auto', hsl: '220 14% 58%' },
  { id: 'primary', label: 'Mint', hsl: '145 80% 55%' },
  /** Yellow-amber — separated from Orange on the hue wheel */
  { id: 'warning', label: 'Amber', hsl: '44 96% 52%' },
  { id: 'sky', label: 'Sky', hsl: '199 89% 58%' },
  { id: 'violet', label: 'Violet', hsl: '263 70% 65%' },
  { id: 'rose', label: 'Rose', hsl: '350 89% 60%' },
  /** Teal — clearly cooler than Mint */
  { id: 'emerald', label: 'Emerald', hsl: '168 58% 42%' },
  /** Red-orange — clearly warmer / more red than Amber */
  { id: 'orange', label: 'Orange', hsl: '18 92% 54%' },
];

export function defaultOrganizerState(): DashboardOrganizerState {
  return { categories: [], goals: {} };
}

/** Sortable id for a dashboard section (never equals a goal UUID). */
export function sectionSortableId(sectionKey: string): string {
  return sectionKey === UNCATEGORIZED_SECTION_KEY
    ? 'dashsec:uncategorized'
    : `dashsec:cat:${sectionKey}`;
}

/** Returns internal section key, or undefined if `id` is not a section sortable. */
export function parseSectionSortableId(id: string): string | undefined {
  if (id === 'dashsec:uncategorized') return UNCATEGORIZED_SECTION_KEY;
  if (id.startsWith('dashsec:cat:')) return id.slice('dashsec:cat:'.length);
  return undefined;
}

export function normalizeSectionOrder(state: DashboardOrganizerState): string[] {
  const catIds = state.categories.map((c) => c.id);
  const catSet = new Set(catIds);
  const raw =
    Array.isArray(state.sectionOrder) && state.sectionOrder.length > 0
      ? [...state.sectionOrder]
      : [UNCATEGORIZED_SECTION_KEY, ...catIds];

  const seen = new Set<string>();
  const order: string[] = [];
  for (const k of raw) {
    if (k === UNCATEGORIZED_SECTION_KEY) {
      if (!seen.has(UNCATEGORIZED_SECTION_KEY)) {
        seen.add(UNCATEGORIZED_SECTION_KEY);
        order.push(UNCATEGORIZED_SECTION_KEY);
      }
    } else if (catSet.has(k) && !seen.has(k)) {
      seen.add(k);
      order.push(k);
    }
  }
  if (!seen.has(UNCATEGORIZED_SECTION_KEY)) {
    order.unshift(UNCATEGORIZED_SECTION_KEY);
  }
  for (const id of catIds) {
    if (!seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  return order;
}

/** Clear categoryId when the category no longer exists (stale localStorage). */
export function sanitizeOrganizerCategories(state: DashboardOrganizerState): DashboardOrganizerState {
  const catIds = new Set(state.categories.map((c) => c.id));
  const goals: Record<string, GoalOrganizerRow> = { ...state.goals };
  for (const [id, row] of Object.entries(goals)) {
    if (row.categoryId && !catIds.has(row.categoryId)) {
      goals[id] = { ...row, categoryId: null };
    }
  }
  const next: DashboardOrganizerState = { ...state, goals };
  return { ...next, sectionOrder: normalizeSectionOrder(next) };
}

/** Parse organizer JSON from localStorage or Supabase `jsonb`. */
export function parseDashboardOrganizerPayload(parsed: unknown): DashboardOrganizerState {
  if (!parsed || typeof parsed !== 'object') return defaultOrganizerState();
  const p = parsed as Partial<DashboardOrganizerState>;
  const categories = Array.isArray(p.categories)
    ? p.categories.filter(
        (c): c is DashboardCategory =>
          c &&
          typeof c === 'object' &&
          typeof (c as DashboardCategory).id === 'string' &&
          typeof (c as DashboardCategory).name === 'string',
      )
    : [];
  const goals =
    p.goals && typeof p.goals === 'object' && !Array.isArray(p.goals)
      ? (p.goals as Record<string, GoalOrganizerRow>)
      : {};
  const sectionOrder = Array.isArray(p.sectionOrder)
    ? p.sectionOrder.filter((k): k is string => typeof k === 'string')
    : undefined;
  return sanitizeOrganizerCategories({ categories, goals, sectionOrder });
}

export function loadDashboardOrganizer(userId: string): DashboardOrganizerState {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return defaultOrganizerState();
    return parseDashboardOrganizerPayload(JSON.parse(raw));
  } catch {
    return defaultOrganizerState();
  }
}

export function saveDashboardOrganizer(userId: string, state: DashboardOrganizerState) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Drop organizer entries for goals that no longer exist. */
export function pruneOrganizerGoals(
  state: DashboardOrganizerState,
  validGoalIds: Set<string>,
): DashboardOrganizerState {
  const goals: Record<string, GoalOrganizerRow> = {};
  for (const id of validGoalIds) {
    if (state.goals[id]) goals[id] = state.goals[id];
  }
  const next: DashboardOrganizerState = { ...state, goals };
  return { ...next, sectionOrder: normalizeSectionOrder(next) };
}

export function ensureGoalRow(state: DashboardOrganizerState, goalId: string): GoalOrganizerRow {
  return state.goals[goalId] ?? { categoryId: null, accent: 'default' };
}

/** DnD droppable ids — never collide with goal UUIDs */
export const DASHBOARD_UNCATEGORIZED_DROP_ZONE = 'dashdz:uncategorized';

export function dashboardCategoryDropZoneId(categoryId: string): string {
  return `dashdz:cat:${categoryId}`;
}

export function parseDashboardDropZone(overId: string): string | null | undefined {
  if (overId === DASHBOARD_UNCATEGORIZED_DROP_ZONE) return null;
  if (overId.startsWith('dashdz:cat:')) return overId.slice('dashdz:cat:'.length);
  return undefined;
}

/** Split ordered goal ids into uncategorized vs known categories (invalid categoryId → uncategorized). */
export function partitionGoalsByCategorySections(
  orderedIds: string[],
  organizer: DashboardOrganizerState,
): { uncategorized: string[]; byCategoryId: Record<string, string[]> } {
  const byCategoryId: Record<string, string[]> = {};
  for (const c of organizer.categories) byCategoryId[c.id] = [];
  const validCat = new Set(organizer.categories.map((c) => c.id));
  const uncategorized: string[] = [];
  for (const id of orderedIds) {
    const cid = ensureGoalRow(organizer, id).categoryId;
    if (cid && validCat.has(cid)) byCategoryId[cid].push(id);
    else uncategorized.push(id);
  }
  return { uncategorized, byCategoryId };
}

/** Flatten goal ids using `sectionOrder` keys. */
export function flattenGoalSectionOrder(
  sectionOrder: string[],
  uncategorized: string[],
  byCategoryId: Record<string, string[]>,
): string[] {
  const out: string[] = [];
  for (const key of sectionOrder) {
    if (key === UNCATEGORIZED_SECTION_KEY) out.push(...uncategorized);
    else out.push(...(byCategoryId[key] ?? []));
  }
  return out;
}

export function flattenGoalSectionOrderFromOrganizer(
  organizer: DashboardOrganizerState,
  uncategorized: string[],
  byCategoryId: Record<string, string[]>,
): string[] {
  return flattenGoalSectionOrder(normalizeSectionOrder(organizer), uncategorized, byCategoryId);
}
