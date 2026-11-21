import type { SupabaseClient } from '@supabase/supabase-js';
import {
  completedSessions,
  taskProgress,
  type TaskProgress,
} from '../../../shared/progress.js';
import { listAssignments } from '../assignments/assignment-api.js';
import { listStudySessions } from '../study-sessions/session-api.js';

export interface Progress {
  /** GP-06: completed and incomplete tasks. */
  tasks: TaskProgress;
  /** GP-07: how many study sessions are completed. */
  completedSessions: number;
}

/** Loads the student's records and computes their progress. */
export async function loadProgress(client: SupabaseClient): Promise<Progress> {
  const [tasks, sessions] = await Promise.all([
    listAssignments(client),
    listStudySessions(client),
  ]);
  return {
    tasks: taskProgress(tasks),
    completedSessions: completedSessions(sessions),
  };
}
