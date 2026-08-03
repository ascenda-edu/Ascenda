/**
 * Next.js instrumentation hook.
 *
 * Next 15 loads `src/instrumentation.ts` automatically — `instrumentation` left
 * experimental in Next 15, so there is NO `experimental.instrumentationHook`
 * flag to set in `next.config.mjs` (adding one would produce an "unrecognised
 * key" warning). Verified against next@15.5.21; the exported shape matches
 * `next/dist/server/instrumentation/types.d.ts` (`InstrumentationModule`).
 *
 * The file must live at `src/instrumentation.ts` because the app dir is
 * `src/app` — the same rule that already applies to `src/middleware.ts`, where
 * putting it at the repo root shipped an auth bypass to production once.
 *
 * `register()` runs once per server instance, in each runtime (Node and Edge),
 * before any request is handled. That makes it the correct place — the only
 * correct place — to fail on bad configuration: a missing `NEXT_PUBLIC_SUPABASE_URL`
 * becomes one loud startup crash instead of a 500 on every request from every
 * user, with no error boundary above middleware to catch it.
 */
import { assertEnv, EnvValidationError, PRODUCTION_RECOMMENDED, getServerEnv } from '@/lib/env';
import { logger } from '@/lib/observability';

/**
 * Matches `InstrumentationOnRequestError` in
 * `next/dist/server/instrumentation/types.d.ts`. Declared locally rather than
 * imported: next@15.5.21 does not re-export the `Instrumentation` namespace from
 * the `next` entry point, and importing through `next/dist/**` is a private path
 * that breaks on a patch release.
 */
type RequestErrorContext = Readonly<{
  routerKind: 'Pages Router' | 'App Router';
  routePath: string;
  routeType: 'render' | 'route' | 'action' | 'middleware';
  renderSource?: 'react-server-components' | 'react-server-components-payload' | 'server-rendering';
  revalidateReason: 'on-demand' | 'stale' | undefined;
}>;

type ErrorRequest = Readonly<{
  path: string;
  method: string;
  headers: NodeJS.Dict<string | string[]>;
}>;

export async function register(): Promise<void> {
  const runtime = process.env.NEXT_RUNTIME;

  // Validate fully in the Node runtime only.
  //
  // The Edge runtime resolves `process.env` by static textual substitution at
  // build time, so a full server-schema parse there would report "missing" for
  // variables that are in fact present at runtime on the Node side. The two
  // required variables are both `NEXT_PUBLIC_*`, which Edge does inline, and the
  // Node runtime always boots first — so nothing is lost by scoping this.
  if (runtime === 'edge') {
    logger.debug('Instrumentation registered (edge runtime)');
    return;
  }

  try {
    assertEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // Log before rethrowing: on Vercel the thrown error is truncated in the
      // function log, while this line survives intact with every offending name.
      logger.error('Environment validation failed at startup', error, {
        variables: error.variables
      });
    }
    // Rethrow. A server that cannot read its own configuration must not accept
    // traffic — that is the entire point of validating here rather than lazily.
    throw error;
  }

  const env = getServerEnv();

  if (env.NODE_ENV === 'production') {
    for (const item of PRODUCTION_RECOMMENDED) {
      if (!process.env[item.name]) {
        logger.warn(`${item.name} is not set`, { consequence: item.consequence });
      }
    }
  }

  logger.info('Ascenda server starting', {
    runtime: runtime ?? 'nodejs',
    nodeEnv: env.NODE_ENV,
    // No error-monitoring provider is configured yet — see the wiring block in
    // `src/lib/observability/logger.ts`. This line is the reminder.
    errorReporting: 'console-only'
  });
}

/**
 * Next 15 calls this for every uncaught error in a render, route handler, server
 * action or middleware — including errors that an `error.tsx` boundary swallows.
 * Those boundaries currently report to nobody; this is the single place that
 * changes when a provider is wired.
 *
 * Must never throw: an exception here escapes into Next's error path and can
 * mask the original error.
 */
export function onRequestError(error: unknown, request: ErrorRequest, context: RequestErrorContext): void {
  try {
    logger.error('Unhandled request error', error, {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason
    });
  } catch {
    // Deliberately silent — see above.
  }
}
