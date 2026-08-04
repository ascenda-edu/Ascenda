import { getIdentity } from '@/lib/auth/identity';
import { getOnboardingState } from '@/lib/onboarding/read';
import { AscendiCoach } from './ascendi-coach';
import { CoachDevTools } from './coach-devtools';

/**
 * One line to give a page the Ascendi coach: `<AscendiCoachMount />`.
 *
 * WHY THIS IS A SERVER COMPONENT AND NOT PART OF THE SHELL
 * -------------------------------------------------------
 * `layout/shell.tsx` is the obvious home and it cannot be. The shell is imported
 * by seven `loading.tsx` files and by `app/appointment/page.tsx`, which is a
 * CLIENT component — so it must stay renderable without awaiting anything. An
 * `await` inside it would put a suspending server component inside a Suspense
 * *fallback*, which is exactly the trap its own `role` prop is documented to avoid.
 *
 * A zero-prop server component sidesteps the whole problem: pages that want a
 * coach render one line, pages that cannot (or should not — `/welcome`, `/login`,
 * `/role-select`) simply do not. `CoachProvider` still lives in the shell, because
 * it is pure client state and needs to wrap both this and the chat launcher.
 *
 * IT COSTS NO EXTRA ROUND TRIP FOR IDENTITY
 * -----------------------------------------
 * `getIdentity` is `React.cache`-wrapped, so the page that already called it
 * shares this one. The onboarding read is a single indexed `select` on one column
 * of one row, and it is the same read `dashboard/page.tsx` was already doing.
 *
 * Render it near the end of a page's tree. It emits only portals and fixed-position
 * overlays, so its position in the DOM does not affect layout — but the anchors it
 * points at must have rendered by the time it mounts.
 */
export async function AscendiCoachMount() {
  const identity = await getIdentity();
  // Anonymous visitors have nothing to be onboarded into and no row to record it
  // against. This can legitimately happen: a page may render this before its own
  // auth guard resolves.
  if (!identity) return null;

  // Memoised per request, so a page that already read this state (the dashboard does,
  // for its getting-started card) shares the one query. See lib/onboarding/read.ts.
  const state = await getOnboardingState(identity.userId);

  return (
    <>
      <AscendiCoach state={state} />
      {/* Development only, and it enforces that itself rather than trusting this
          comment — see the component, and the server-side guard on the reset
          action it calls. */}
      <CoachDevTools />
    </>
  );
}
