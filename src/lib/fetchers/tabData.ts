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
  deadline: string;
  created_at: string;
  resolved_at: string | null;
  status: 'active' | 'completed' | 'failed';
  judge_name: string | null;
  judge_user_id?: string | null;
  is_private: boolean;
  stake_recipient_user_id?: string | null;
  stake_charity_id?: string | null;
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
    deadline: new Date(row.deadline),
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    status: row.status,
    judge,
    isPrivate: row.is_private,
    stakeRecipientUserId: row.stake_recipient_user_id ?? null,
    stakeCharityId: row.stake_charity_id ?? null,
  };
}

export async function fetchUserGoals(userId: string): Promise<Goal[]> {
  const fieldsWithCurrency =
    'id,title,description,stake,stake_currency,deadline,created_at,resolved_at,status,judge_name,is_private,user_id,judge_user_id,stake_recipient_user_id,stake_charity_id';
  const fieldsNoCharity =
    'id,title,description,stake,stake_currency,deadline,created_at,resolved_at,status,judge_name,is_private,user_id,judge_user_id,stake_recipient_user_id';
  const fallbackFields =
    'id,title,description,stake,deadline,created_at,resolved_at,status,judge_name,is_private,user_id,judge_user_id,stake_recipient_user_id';

  let { data, error } = await supabase
    .from('goals')
    .select(fieldsWithCurrency)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  let msg = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  if (error && msg.includes('stake_charity_id')) {
    const retry = await supabase
      .from('goals')
      .select(fieldsNoCharity)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    data = retry.data;
    error = retry.error;
    msg = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  }
  if (error && msg.includes('stake_currency')) {
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
  const recipientIds = [...new Set(rows.map((r) => r.stake_recipient_user_id).filter(Boolean))] as string[];
  const charityIds = [...new Set(rows.map((r) => r.stake_charity_id).filter(Boolean))] as string[];
  const profileIdsForAux = [...new Set([...judgeIds, ...recipientIds])];
  let avatarById = new Map<string, string | null>();
  let recipientNameById = new Map<string, string>();
  let charityNameById = new Map<string, string>();
  if (profileIdsForAux.length > 0) {
    try {
      const { data: profiles } = await withTimeout(
        supabase.from('profiles').select('id, avatar_url, display_name').in('id', profileIdsForAux),
        AUX_QUERY_TIMEOUT_MS,
      );
      avatarById = new Map(
        (profiles ?? []).map((p: { id: string; avatar_url: string | null }) => [p.id, p.avatar_url]),
      );
      recipientNameById = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null }) => [
          p.id,
          p.display_name ?? 'Friend',
        ]),
      );
    } catch (e) {
      console.warn('Profile avatar fetch skipped (timeout/error)', e);
    }
  }

  if (charityIds.length > 0) {
    try {
      const { data: charityRows } = await withTimeout(
        supabase.from('charities').select('id, name').in('id', charityIds),
        AUX_QUERY_TIMEOUT_MS,
      );
      charityNameById = new Map(
        (charityRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
      );
    } catch (e) {
      console.warn('Charity name fetch skipped (timeout/error)', e);
    }
  }

  return rows.map((row) => {
    const g = mapRowToGoal(row, avatarById);
    const rid = row.stake_recipient_user_id;
    if (rid) {
      g.stakeRecipientName = recipientNameById.get(rid) ?? null;
    }
    const cid = row.stake_charity_id;
    if (cid) {
      g.stakeCharityName = charityNameById.get(cid) ?? null;
    }
    return g;
  });
}

type JudgeGoalRow = GoalRow & { user_id: string };

function mapJudgeRowToGoal(row: JudgeGoalRow, creatorName: string): JudgeGoal {
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
    deadline: new Date(row.deadline),
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    status: row.status,
    judge,
    isPrivate: row.is_private,
    creatorId: row.user_id,
    creatorName,
  };
}

export async function fetchGoalsAsJudge(userId: string): Promise<JudgeGoal[]> {
  const fieldsWithCurrency = 'id,title,description,stake,stake_currency,deadline,created_at,resolved_at,status,judge_name,is_private,user_id';
  const fallbackFields = 'id,title,description,stake,deadline,created_at,resolved_at,status,judge_name,is_private,user_id';

  let { data: rows, error } = await supabase
    .from('goals')
    .select(fieldsWithCurrency)
    .eq('judge_user_id', userId)
    .order('created_at', { ascending: false });

  if (error && String((error as { message?: unknown })?.message ?? '').toLowerCase().includes('stake_currency')) {
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
  const nameById = new Map<string, string>();
  try {
    const { data: profiles } = await withTimeout(
      supabase.from('profiles').select('id,display_name').in('id', creatorIds),
      AUX_QUERY_TIMEOUT_MS,
    );
    (profiles ?? []).forEach((p: { id: string; display_name: string | null }) => {
      nameById.set(p.id, p.display_name ?? 'Someone');
    });
  } catch (e) {
    console.warn('Creator profile fetch skipped (timeout/error)', e);
  }

  return list.map((row) => mapJudgeRowToGoal(row, nameById.get(row.user_id) ?? 'Someone'));
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
  stakePayoutsReady?: boolean;
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
      ? {
          data: [] as {
            id: string;
            display_name: string | null;
            avatar_url: string | null;
            friend_code: string | null;
            stake_payouts_ready?: boolean | null;
          }[],
        }
      : await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, friend_code, stake_payouts_ready')
          .in('id', profileIds);

  const profilesById = new Map<string, ProfileLite>();
  const profileRows = (allProfiles ?? []) as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    friend_code: string | null;
    stake_payouts_ready?: boolean | null;
  }[];
  profileRows.forEach((p) => {
    profilesById.set(p.id, {
      id: p.id,
      display_name: p.display_name ?? '',
      avatar_url: p.avatar_url ?? null,
      friend_code: p.friend_code ?? null,
      stakePayoutsReady: !!p.stake_payouts_ready,
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
          stakePayoutsReady: p.stakePayoutsReady,
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
