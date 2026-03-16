import { create } from 'zustand';
import { Goal } from './types';
import { mockGoals } from './mockData';

interface GoalStore {
  goals: Goal[];
  addGoal: (goal: Goal) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
}

// Simple in-memory store (no persistence needed for demo)
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
