'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Param writes across the whole page are coordinated through two module-level values.
 * There is one document, hence one URL, so module scope is the correct scope: two hook
 * instances writing different keys must build on each other's work, not race it.
 *
 * ── The bug this exists to kill ─────────────────────────────────────────────
 * This hook used to build each next URL from `window.location.search`, with a comment
 * claiming that stopped setters clobbering each other. It did the opposite.
 * `router.replace` is a SOFT navigation: it does not touch `window.location` until the
 * server round-trip resolves. Measured on `/counsellor/students`, a `force-dynamic`
 * route: `router.replace` called at 0ms, `history.replaceState` at **1697ms**. So for
 * ~1.7s every writer read a pre-write URL and each built a URL undoing the others.
 *
 * Two distinct failures came out of that, and both were live:
 *  - Same tick: "Reset all filters" fires five setters at once. All five read the same
 *    string, the last router call won, and four resets vanished.
 *  - Later tick: the roster's 250ms-debounced query write landed inside that 1.7s
 *    window, read the pre-reset URL, and put every cleared param back. The URL ended
 *    one param different from where it started.
 *
 * ── The fix ────────────────────────────────────────────────────────────────
 * `batch` coalesces all writes in one tick into a single navigation. `intent` remembers
 * the query string we last ASKED for, so a write in a later tick builds on our intent
 * rather than on a `window.location` that has not caught up yet.
 *
 * `intent` is abandoned when it stops representing the user's wishes: on a pathname
 * change, once the router confirms it landed, or on `popstate` — a back/forward press
 * is the user overriding us, and honouring stale intent after it would resurrect params
 * they just navigated away from. That last one is why the listener below exists.
 */
let batch: { pathname: string; params: URLSearchParams; push: boolean } | null = null
let intent: { pathname: string; query: string } | null = null

/** Order-insensitive compare: `searchParams.toString()` need not match our insertion order. */
const normalise = (query: string) => {
  const params = new URLSearchParams(query)
  params.sort()
  return params.toString()
}

let popstateBound = false
const bindPopstate = () => {
  if (popstateBound || typeof window === 'undefined') return
  popstateBound = true
  // Back/forward is the user overriding whatever we were mid-way through requesting.
  window.addEventListener('popstate', () => {
    intent = null
    batch = null
  })
}

/**
 * Sync a piece of UI state (filter, tab, view mode) to a URL query param so the
 * view is deep-linkable and back/forward restore it.
 *
 * - Reads from `useSearchParams()`, so browser navigation re-renders with the right value.
 * - Writes via `router.replace` with `scroll: false` (no history spam while filtering);
 *   pass `push: true` for state that should create history entries (e.g. wizard steps).
 * - Setting the default value, or `''`, removes the param, keeping URLs clean.
 * - Setters in the same tick batch into one navigation; later setters build on the
 *   pending intent rather than on a stale `window.location` (see above).
 */
export function useSearchParamState(
  key: string,
  defaultValue: string,
  options?: { push?: boolean }
): [string, (next: string) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const push = options?.push ?? false

  const value = searchParams.get(key) ?? defaultValue

  bindPopstate()

  // Release the intent once it has served its purpose, so the URL — not a stale
  // in-memory wish — is the seed for the next write.
  useEffect(() => {
    if (!intent) return
    if (intent.pathname !== pathname || normalise(searchParams.toString()) === normalise(intent.query)) {
      intent = null
    }
  }, [pathname, searchParams])

  const setValue = useCallback(
    (next: string) => {
      if (!batch || batch.pathname !== pathname) {
        // Prefer our own outstanding intent over `window.location`, which lags a soft
        // navigation by however long the server takes.
        const seed = intent && intent.pathname === pathname ? intent.query : window.location.search
        batch = { pathname, params: new URLSearchParams(seed), push: false }
      }
      const pending = batch

      if (next === defaultValue || next === '') {
        pending.params.delete(key)
      } else {
        pending.params.set(key, next)
      }
      // If anything in the batch wants a history entry the whole batch gets one; the
      // alternative is two navigations, which is what this is here to avoid.
      pending.push = pending.push || push

      queueMicrotask(() => {
        // Whichever setter's microtask runs first flushes the batch; the rest see it
        // already claimed and do nothing. One navigation per tick.
        if (batch !== pending) return
        batch = null

        const query = pending.params.toString()
        // Nothing new to ask for. Without this, a debounced writer that agrees with
        // the pending intent still costs a redundant server round-trip.
        if (intent && intent.pathname === pending.pathname && normalise(intent.query) === normalise(query)) {
          return
        }
        intent = { pathname: pending.pathname, query }

        const url = query ? `${pending.pathname}?${query}` : pending.pathname
        if (pending.push) {
          router.push(url, { scroll: false })
        } else {
          router.replace(url, { scroll: false })
        }
      })
    },
    [key, defaultValue, pathname, push, router]
  )

  return useMemo(() => [value, setValue], [value, setValue])
}
