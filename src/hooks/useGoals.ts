import { useEffect, useState, useSyncExternalStore } from 'react';
import { getGoals, subscribe, addGoal, updateGoal } from '@/lib/goalStore';
import { Goal } from '@/lib/types';

export function useGoals() {
  const goals = useSyncExternalStore(subscribe, getGoals);
  return { goals, addGoal, updateGoal };
}
