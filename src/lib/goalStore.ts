import { Goal } from './types';
import { mockGoals } from './mockData';

let _goals = [...mockGoals];
let _listeners: (() => void)[] = [];

export function getGoals() { return _goals; }

export function addGoal(goal: Goal) {
  _goals = [goal, ..._goals];
  _listeners.forEach(l => l());
}

export function updateGoal(id: string, updates: Partial<Goal>) {
  _goals = _goals.map(g => g.id === id ? { ...g, ...updates } : g);
  _listeners.forEach(l => l());
}

export function subscribe(listener: () => void) {
  _listeners.push(listener);
  return () => { _listeners = _listeners.filter(l => l !== listener); };
}
