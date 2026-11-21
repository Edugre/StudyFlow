import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkPeriod,
  completedSessions,
  studyTime,
  taskProgress,
  type Period,
  type StudyTime,
  type TaskProgress,
} from '../../../shared/progress.js';
import { listAssignments } from '../assignments/assignment-api.js';
import { listStudySessions } from '../study-sessions/session-api.js';

export interface Progress {
  /** GP-06: completed and incomplete tasks. */
  tasks: TaskProgress;
  /** GP-07: how many study sessions are completed. */
  completedSessions: number;
  /** GP-08: planned versus completed study time in the viewed period. */
  studyTime: StudyTime;
}

/** What progress covers: GP-08's period applies to study time. */
export type Scope = Period;

/**
 * Loads the student's records and computes their progress. An invalid
 * period is rejected before any request is made.
 */
export async function loadProgress(
  client: SupabaseClient,
  scope: Scope = {},
): Promise<Progress> {
  checkPeriod(scope);
  const [tasks, sessions] = await Promise.all([
    listAssignments(client),
    listStudySessions(client),
  ]);
  return {
    tasks: taskProgress(tasks),
    completedSessions: completedSessions(sessions),
    studyTime: studyTime(sessions, scope),
  };
}
