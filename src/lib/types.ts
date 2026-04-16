export interface Goal {
  id: string;
  title: string;
  description: string;
  stake: number;
  stakeCurrency: string;
  /** Matches `charities.ts` / server CHARITIES `id`; null for legacy rows or free goals */
  charityId?: string | null;
  deadline: Date;
  createdAt: Date;
  /** Set when the goal is resolved (completed / failed); from DB `resolved_at`. */
  resolvedAt: Date | null;
  status: 'active' | 'completed' | 'failed';
  judge: Judge;
  isPrivate: boolean;
  /** From DB; true for goals created during the app tutorial (same on all devices for this account). */
  createdDuringAppTutorial?: boolean;
  proof?: string;
}

/** Goal shown on "My judges" — includes creator info for cards */
export type JudgeGoal = Goal & { creatorId: string; creatorName: string; creatorAvatar: string };

export interface Judge {
  id: string;
  name: string;
  avatar: string;
  isSelf: boolean;
}

export interface Friend {
  id: string;
  name: string;
  avatar: string;
  activeGoals: number;
  completedGoals: number;
  totalStaked: number;
}

export interface PulseItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  action: 'created' | 'completed' | 'failed' | 'staked';
  goalTitle: string;
  stake: number;
  timestamp: Date;
}
