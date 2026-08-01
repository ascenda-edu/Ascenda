// Shared per-request context for /parent pages: auth + linked-children
// resolution in one place so every page scopes identically. Server-only
// (reads cookies()).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadLinkedChildren, pickActiveChild } from './data';
import { ACTIVE_CHILD_COOKIE } from '../model/active-child';
import type { LinkedChild } from '../model/types';

export interface ParentContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string;
  linkedChildren: LinkedChild[];
  /** null ⇒ the account has no active guardian_links — render NoLinkedChildren. */
  activeChild: LinkedChild | null;
}

export const resolveParentContext = async (): Promise<ParentContext> => {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const linkedChildren = await loadLinkedChildren(supabase, user.id);
  const activeChild = pickActiveChild(linkedChildren, (await cookies()).get(ACTIVE_CHILD_COOKIE)?.value);
  return { supabase, userId: user.id, linkedChildren, activeChild };
};
