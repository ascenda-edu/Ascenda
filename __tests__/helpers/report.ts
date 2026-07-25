/**
 * Test diagnostics reporter
 * ─────────────────────────
 * The scoring / matching suites print large human-readable reports — score
 * breakdowns, band tables, per-profile programme matches — that exist so a
 * human can eyeball algorithm behaviour after a tuning change. They are
 * genuinely useful on demand, and pure noise by default: unconditional, they
 * added ~1,450 lines of `● Console` blocks to every `npm test` run, which is
 * its own hazard (a real warning disappears inside them).
 *
 * So they are gated. Quiet by default, full fidelity on request:
 *
 *   npm test                                  # quiet
 *   VERBOSE_SCORING=1 npm test                # scoring/matching diagnostics
 *   VERBOSE_TESTS=1 npm test                  # same — the catch-all switch
 *   VERBOSE_SCORING=1 npx jest student_scoring
 *
 * Accepted truthy values: `1` or `true` (case-insensitive). Anything else,
 * including unset, means quiet.
 *
 * Gating happens HERE and at the call sites — never as a global console
 * override in `jest.setup.ts`, which would also swallow legitimate warnings
 * from every other suite in the repo.
 *
 * Note: this file lives under `__tests__/` but contains no tests, so the
 * `__tests__/helpers/` prefix is listed in `testPathIgnorePatterns` in
 * `jest.config.ts`, alongside the other fixture/helper modules.
 */

const TRUTHY = new Set(['1', 'true']);

const flagSet = (name: string): boolean =>
  TRUTHY.has((process.env[name] ?? '').trim().toLowerCase());

const noop = (): void => {};

/**
 * `console.log` when diagnostics are on, a no-op otherwise.
 *
 * Deliberately *bound* to `console.log` rather than wrapped in a forwarding
 * function: Jest annotates each console line with the frame that produced it,
 * and a wrapper would make every single line read `at report (report.ts:…)`
 * instead of the test line that actually printed it. Binding keeps the
 * original attribution, so verbose output is identical to the pre-gating
 * output down to the stack traces.
 *
 * Reassignable (hence `let`) so `setVerbose` can flip it — named imports are
 * live bindings, so callers see the change.
 */
export let report: (...args: unknown[]) => void = flagSet('VERBOSE_SCORING') ||
  flagSet('VERBOSE_TESTS')
  ? console.log.bind(console)
  : noop;

/**
 * Force diagnostics on or off at runtime, ignoring the environment.
 * Used when a harness module is executed directly as a script, where printing
 * the report is the whole point.
 */
export function setVerbose(on: boolean): void {
  report = on ? console.log.bind(console) : noop;
}

/** Whether diagnostics are currently switched on. */
export const isVerbose = (): boolean => report !== noop;
