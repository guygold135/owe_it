import { Goal, Friend, PulseItem } from './types';

export const mockGoals: Goal[] = [
  {
    id: '1',
    title: 'Complete Q3 Audit',
    description: 'Finish all quarterly audit reports and submit to the board.',
    stake: 100,
    deadline: new Date(Date.now() + 5 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    status: 'active',
    judge: { id: 'j1', name: 'Alex Rivera', avatar: '', isSelf: false },
    isPrivate: false,
  },
  {
    id: '2',
    title: 'Ship Portfolio Site',
    description: 'Launch the personal portfolio with at least 5 projects.',
    stake: 50,
    deadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: 'active',
    judge: { id: 'j2', name: 'Sam Chen', avatar: '', isSelf: false },
    isPrivate: false,
  },
  {
    id: '3',
    title: '5am Wakeup Challenge',
    description: 'Wake up at 5am every day for 7 consecutive days.',
    stake: 75,
    deadline: new Date(Date.now() + 168 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    status: 'active',
    judge: { id: 'self', name: 'You', avatar: '', isSelf: true },
    isPrivate: true,
  },
];

export const mockFriends: Friend[] = [
  { id: 'f1', name: 'Alex Rivera', avatar: '', activeGoals: 3, completedGoals: 12, totalStaked: 450 },
  { id: 'f2', name: 'Sam Chen', avatar: '', activeGoals: 1, completedGoals: 8, totalStaked: 200 },
  { id: 'f3', name: 'Jordan Lee', avatar: '', activeGoals: 5, completedGoals: 22, totalStaked: 1100 },
  { id: 'f4', name: 'Casey Brooks', avatar: '', activeGoals: 2, completedGoals: 6, totalStaked: 300 },
];

export const mockPulse: PulseItem[] = [
  { id: 'p1', userId: 'f3', userName: 'Jordan Lee', userAvatar: '', action: 'staked', goalTitle: 'Run a Marathon', stake: 200, timestamp: new Date(Date.now() - 30 * 60 * 1000) },
  { id: 'p2', userId: 'f1', userName: 'Alex Rivera', userAvatar: '', action: 'completed', goalTitle: 'Read 3 Books', stake: 50, timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { id: 'p3', userId: 'f2', userName: 'Sam Chen', userAvatar: '', action: 'created', goalTitle: 'Learn TypeScript', stake: 75, timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) },
  { id: 'p4', userId: 'f4', userName: 'Casey Brooks', userAvatar: '', action: 'failed', goalTitle: 'No Sugar Week', stake: 30, timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000) },
];
