import type { SupabaseClient } from '@supabase/supabase-js';

export type Goal = {
  id: string;
  title: string;
  message: string;
  created_at: string;
};

const columns = 'id, title, message, created_at';

/** Retrieves signed-in student's goals, newest first. */
export async function listGoals(client: SupabaseClient) {
  const { data, error } = await client
    .from('goals')
    .select(columns)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load goals.');

  return (data ?? []) as Goal[];
}

export async function createGoal(
  client: SupabaseClient,
  input: Record<string, unknown>,
) {
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 120
  )
    throw new Error('Enter a goal title of 1–120 characters.');
  if (
    typeof input.message !== 'string' ||
    !input.message.trim() ||
    input.message.length > 500
  )
    throw new Error('Enter a goal message of 1–500 characters.');

  const row = {
    title: input.title.trim(),
    message: input.message.trim(),
  };
  const { data, error } = await client
    .from('goals')
    .insert(row)
    .select(columns)
    .single<Goal>();
  if (error) throw new Error('Unable to create goal.');
  return data;
}

export async function deleteGoal(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from('goals')
    .delete()
    .eq('id', id)
    .select('id');
  if (error?.code === '22P02') return false;
  if (error) throw new Error('Unable to delete goal.');
  return data.length > 0;
}
