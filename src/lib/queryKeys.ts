export const queryKeys = {
  goals: (userId: string) => ['goals', userId] as const,
  goalsAsJudge: (userId: string) => ['goalsAsJudge', userId] as const,
  pulse: (userId: string) => ['pulse', userId] as const,
  friends: (userId: string) => ['friends', userId] as const,
};
