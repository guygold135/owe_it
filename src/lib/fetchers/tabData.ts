import { supabase } from '@/integrations/supabase/client';
import { Friend, Goal, Judge, JudgeGoal, PulseItem } from '@/lib/types';
import { normalizeStakeCurrency } from '@/lib/currency';

const AUX_QUERY_TIMEOUT_MS = 2500;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Aux query timed out')), timeoutMs);
    }),
  ]);
}

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  stake: number;
  stake_currency?: string | null;
  charity_id?: string | null;
  deadline: string;
  created_at: string;
  resolved_at: string | null;
  status: 'active' | 'completed' | 'failed';
  judge_name: string | null;
  judge_user_id?: string | null;
  is_private: boolean;
  created_during_app_tutorial?: boolean | null;
};

function mapRowToGoal(row: GoalRow, avatarById: Map<string, string | null>): Goal {
  const isSelf = !row.judge_name;
  const judgeId = row.judge_user_id ?? 'self';
  const avatarUrl =
    row.judge_user_id != null ? (avatarById.get(row.judge_user_id) ?? '') : '';

  const judge: Judge = {
    id: judgeId,
    name: row.judge_name ?? 'You',
    avatar: avatarUrl,
    isSelf,
  };

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    stake: row.stake,
    stakeCurrency: normalizeStakeCurrency(row.stake_currency),
    charityId: row.charity_id ?? null,
    deadline: new Date(row.deadline),
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    status: row.status,
    judge,
    isPrivate: row.is_private,
    createdDuringAppTutorial: Boolean(row.created_during_app_tutorial),
  };
}

export async function fetchUserGoals(userId: string): Promise<Goal[]> {
  const fieldsWithCurrency =
    'id,title,description,stake,stake_currency,charity_id,deadline,created_at,resolved_at,status,judge_name,is_private,user_id,judge_user_id,created_during_app_tutorial';
  const fallbackFields =
    'id,title,description,stake,deadline,created_at,resolved_at,status,judge_name,is_private,user_id,judge_user_id,created_during_app_tutorial';

  let { data, error } = await supabase
    .from('goals')
    .select(fieldsWithCurrency)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const errMsg = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  if (error && (errMsg.includes('stake_currency') || errMsg.includes('charity_id'))) {
    const retry = await supabase
      .from('goals')
      .select(fallbackFields)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('Error loading goals', error);
    throw error;
  }

  const rows = (data ?? []) as GoalRow[];
  const judgeIds = [...new Set(rows.map((r) => r.judge_user_id).filter(Boolean))] as string[];
  let avatarById = new Map<string, string | null>();
  if (judgeIds.length > 0) {
    try {
      const { data: profiles } = await withTimeout(
        supabase.from('profiles').select('id, avatar_url').in('id', judgeIds),
        AUX_QUERY_TIMEOUT_MS,
      );
      avatarById = new Map(
        (profiles ?? []).map((p: { id: string; avatar_url: string | null }) => [p.id, p.avatar_url]),
      );
    } catch (e) {
      console.warn('Profile avatar fetch skipped (timeout/error)', e);
    }
  }

  return rows.map((row) => mapRowToGoal(row, avatarById));
}

type JudgeGoalRow = GoalRow & { user_id: string };

function mapJudgeRowToGoal(row: JudgeGoalRow, creatorName: string, creatorAvatar: string): JudgeGoal {
  const judge: Judge = {
    id: row.judge_name ?? 'self',
    name: row.judge_name ?? 'You',
    avatar: '',
    isSelf: false,
  };

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    stake: row.stake,
    stakeCurrency: normalizeStakeCurrency(row.stake_currency),
    charityId: row.charity_id ?? null,
    deadline: new Date(row.deadline),
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    status: row.status,
    judge,
    isPrivate: row.is_private,
    creatorId: row.user_id,
    creatorName,
    creatorAvatar,
  };
}

export async function fetchGoalsAsJudge(userId: string): Promise<JudgeGoal[]> {
  const fieldsWithCurrency =
    'id,title,description,stake,stake_currency,charity_id,deadline,created_at,resolved_at,status,judge_name,is_private,user_id';
  const fallbackFields = 'id,title,description,stake,deadline,created_at,resolved_at,status,judge_name,is_private,user_id';

  let { data: rows, error } = await supabase
    .from('goals')
    .select(fieldsWithCurrency)
    .eq('judge_user_id', userId)
    .order('created_at', { ascending: false });

  const judgeErrMsg = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  if (error && (judgeErrMsg.includes('stake_currency') || judgeErrMsg.includes('charity_id'))) {
    const retry = await supabase
      .from('goals')
      .select(fallbackFields)
      .eq('judge_user_id', userId)
      .order('created_at', { ascending: false });
    rows = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('Error loading goals as judge', error);
    throw error;
  }

  const list = (rows ?? []) as JudgeGoalRow[];
  if (list.length === 0) return [];

  const creatorIds = [...new Set(list.map((r) => r.user_id))];
  const creatorById = new Map<string, { name: string; avatar: string }>();
  try {
    const { data: profiles } = await withTimeout(
      supabase.from('profiles').select('id,display_name,avatar_url').in('id', creatorIds),
      AUX_QUERY_TIMEOUT_MS,
    );
    (profiles ?? []).forEach((p: { id: string; display_name: string | null; avatar_url: string | null }) => {
      creatorById.set(p.id, { name: p.display_name ?? 'Someone', avatar: p.avatar_url ?? '' });
    });
  } catch (e) {
    console.warn('Creator profile fetch skipped (timeout/error)', e);
  }

  return list.map((row) => {
    const creator = creatorById.get(row.user_id);
    return mapJudgeRowToGoal(row, creator?.name ?? 'Someone', creator?.avatar ?? '');
  });
}

export async function fetchPulseItems(userId: string): Promise<PulseItem[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: edges, error: edgesError } = await supabase
    .from('friendships')
    .select('friend_user_id')
    .eq('user_id', userId);

  if (edgesError) {
    console.error('Error loading friendships for pulse', edgesError);
    return [];
  }

  const friendIds = (edges ?? []).map((e: { friend_user_id: string }) => e.friend_user_id).filter(Boolean);
  if (friendIds.length === 0) return [];

  const { data: events, error: eventsError } = await supabase
    .from('pulse_events')
    .select('id,user_id,action,goal_title,stake,created_at')
    .in('user_id', friendIds)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  if (eventsError) {
    console.error('Error loading pulse events', eventsError);
    return [];
  }

  const uniqueUserIds = Array.from(new Set((events ?? []).map((e: { user_id: string }) => e.user_id)));
  if (uniqueUserIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url')
    .in('id', uniqueUserIds);

  const nameById = new Map<string, { name: string; avatar: string }>();
  (profiles ?? []).forEach((p: { id: string; display_name: string | null; avatar_url: string | null }) => {
    nameById.set(p.id, { name: p.display_name ?? 'User', avatar: p.avatar_url ?? '' });
  });

  type PulseEventRow = {
    id: string;
    user_id: string;
    action: PulseItem['action'];
    goal_title: string;
    stake: number | string | null;
    created_at: string;
  };

  return (events ?? []).map((e: PulseEventRow) => {
    const profile = nameById.get(e.user_id);
    return {
      id: e.id,
      userId: e.user_id,
      userName: profile?.name ?? 'User',
      userAvatar: profile?.avatar ?? '',
      action: e.action,
      goalTitle: e.goal_title,
      stake: Number(e.stake ?? 0),
      timestamp: new Date(e.created_at),
    } satisfies PulseItem;
  });
}

export type ProfileLite = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  friend_code: string | null;
};

export type IncomingRequest = {
  id: string;
  from_user_id: string;
  created_at: string;
  fromProfile?: ProfileLite | null;
};

export type JudgeRequest = {
  id: string;
  requester_user_id: string;
  created_at: string;
  goal_payload: unknown;
  requesterProfile?: ProfileLite | null;
};

export type FriendsBundle = {
  friends: Friend[];
  incoming: IncomingRequest[];
  judgeRequests: JudgeRequest[];
};

export async function fetchFriendsBundle(userId: string): Promise<FriendsBundle> {
  const [edgesRes, reqsRes, jreqsRes] = await Promise.all([
    supabase.from('friendships').select('friend_user_id, created_at').eq('user_id', userId),
    supabase
      .from('friend_requests')
      .select('id, from_user_id, created_at, status')
      .eq('to_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('judge_requests')
      .select('id, requester_user_id, created_at, goal_payload, status')
      .eq('judge_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ]);

  if (edgesRes.error) {
    console.error('Error loading friendships', edgesRes.error);
  }
  if (reqsRes.error) {
    console.error('Error loading friend requests', reqsRes.error);
  }
  if (jreqsRes.error) {
    console.error('Error loading judge requests', jreqsRes.error);
  }

  const edges = edgesRes.data ?? [];
  const reqs = reqsRes.data ?? [];
  const jreqs = jreqsRes.data ?? [];

  const friendIds = [...new Set(edges.map((e: { friend_user_id: string }) => e.friend_user_id).filter(Boolean))];
  const fromIds = Array.from(new Set(reqs.map((r: { from_user_id: string }) => r.from_user_id).filter(Boolean)));
  const requesterIds = Array.from(
    new Set(jreqs.map((r: { requester_user_id: string }) => r.requester_user_id).filter(Boolean))
  );

  const profileIds = [...new Set([...friendIds, ...fromIds, ...requesterIds])];

  const { data: allProfiles } =
    profileIds.length === 0
      ? { data: [] as { id: string; display_name: string | null; avatar_url: string | null; friend_code: string | null }[] }
      : await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, friend_code')
          .in('id', profileIds);

  const profilesById = new Map<string, ProfileLite>();
  const profileRows = (allProfiles ?? []) as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    friend_code: string | null;
  }[];
  profileRows.forEach((p) => {
    profilesById.set(p.id, {
      id: p.id,
      display_name: p.display_name ?? '',
      avatar_url: p.avatar_url ?? null,
      friend_code: p.friend_code ?? null,
    });
  });

  let friends: Friend[] = [];
  if (!edgesRes.error && friendIds.length > 0) {
    const mapped: Friend[] = friendIds
      .map((id: string) => {
        const p = profilesById.get(id);
        if (!p) return null;
        return {
          id: p.id,
          name: p.display_name ?? 'Friend',
          avatar: p.avatar_url ?? '',
          activeGoals: 0,
          completedGoals: 0,
          totalStaked: 0,
        } as Friend;
      })
      .filter(Boolean) as Friend[];
    mapped.sort((a, b) => a.name.localeCompare(b.name));
    friends = mapped;
  }

  type FriendReqRow = { id: string; from_user_id: string; created_at: string };
  type JudgeReqRow = {
    id: string;
    requester_user_id: string;
    created_at: string;
    goal_payload: unknown;
  };

  const incoming: IncomingRequest[] = !reqsRes.error
    ? (reqs as FriendReqRow[]).map((r) => ({
        id: r.id,
        from_user_id: r.from_user_id,
        created_at: r.created_at,
        fromProfile: profilesById.get(r.from_user_id) ?? null,
      }))
    : [];

  const judgeRequests: JudgeRequest[] = !jreqsRes.error
    ? (jreqs as JudgeReqRow[]).map((r) => ({
        id: r.id,
        requester_user_id: r.requester_user_id,
        created_at: r.created_at,
        goal_payload: r.goal_payload,
        requesterProfile: profilesById.get(r.requester_user_id) ?? null,
      }))
    : [];

  return { friends, incoming, judgeRequests };
}
