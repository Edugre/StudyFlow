import type { SupabaseClient } from '@supabase/supabase-js';
import { taskProgress, type TaskProgress } from '../../../shared/progress.js';
import { listAssignments } from '../assignments/assignment-api.js';

export interface Progress {
  /** GP-06: completed and incomplete tasks. */
  tasks: TaskProgress;
}

/** Loads the student's records and computes their progress. */
export async function loadProgress(client: SupabaseClient): Promise<Progress> {
  const tasks = await listAssignments(client);
  return { tasks: taskProgress(tasks) };
}
