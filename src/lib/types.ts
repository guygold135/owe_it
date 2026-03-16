export interface Goal {
  id: string;
  title: string;
  description: string;
  stake: number;
  deadline: Date;
  createdAt: Date;
  status: 'active' | 'completed' | 'failed';
  judge: Judge;
  isPrivate: boolean;
  proof?: string;
}

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
