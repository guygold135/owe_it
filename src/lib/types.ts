export interface Goal {
  id: string;
  title: string;
  description: string;
  stake: number;
  stakeCurrency: string;
  deadline: Date;
  createdAt: Date;
  /** Set when the goal is resolved (completed / failed); from DB `resolved_at`. */
  resolvedAt: Date | null;
  status: 'active' | 'completed' | 'failed';
  judge: Judge;
  isPrivate: boolean;
  proof?: string;
  /** If set, failed stake is paid out to this friend (Stripe Connect). */
  stakeRecipientUserId?: string | null;
  stakeRecipientName?: string | null;
  /** If set, failed stake is paid out to this charity (Stripe Connect). */
  stakeCharityId?: string | null;
  stakeCharityName?: string | null;
}

/** Goal shown on "My judges" — includes creator info for cards */
export type JudgeGoal = Goal & { creatorId: string; creatorName: string };

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
  /** Friend finished Stripe Connect onboarding and can receive failed stakes. */
  stakePayoutsReady?: boolean;
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
