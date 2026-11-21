import type { SupabaseClient } from '@supabase/supabase-js';
import type { Goal } from '../../../shared/goal.js';
import {
  checkPeriod,
  completedSessions,
  studyTime,
  taskProgress,
  type Period,
  type StudyTime,
  type TaskProgress,
} from '../../../shared/progress.js';
import { isId } from '../../lib/linked-course.js';
import { listAssignments } from '../assignments/assignment-api.js';
import { listGoals } from '../goals/goal-api.js';
import { listStudySessions } from '../study-sessions/session-api.js';

export interface Progress {
  /** GP-06: completed and incomplete tasks. */
  tasks: TaskProgress;
  /** GP-07: how many study sessions are completed. */
  completedSessions: number;
  /** GP-08: planned versus completed study time in the viewed period. */
  studyTime: StudyTime;
  /** GP-09: the goals in scope, newest first. */
  goals: Goal[];
}

/**
 * What progress covers. GP-09: with a course, every figure counts only that
 * course's tasks, sessions and goals. GP-08: the period applies to study
 * time.
 */
export type Scope = Period & { courseId?: string };

/**
 * Loads the student's records and computes their progress. An invalid
 * period is rejected before any request is made.
 */
export async function loadProgress(
  client: SupabaseClient,
  scope: Scope = {},
): Promise<Progress> {
  checkPeriod(scope);
  const { courseId } = scope;
  if (courseId !== undefined && !isId(courseId))
    throw new Error('Course not found');
  const [tasks, sessions, goals] = await Promise.all([
    listAssignments(client, courseId),
    listStudySessions(client, courseId),
    listGoals(client, courseId),
  ]);
  return {
    tasks: taskProgress(tasks),
    completedSessions: completedSessions(sessions),
    studyTime: studyTime(sessions, scope),
    goals,
  };
}
