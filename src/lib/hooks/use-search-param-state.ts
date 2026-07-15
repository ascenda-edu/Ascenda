'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Sync a piece of UI state (filter, tab, view mode) to a URL query param so the
 * view is deep-linkable and back/forward restore it.
 *
 * - Reads from `useSearchParams()`, so browser navigation re-renders with the right value.
 * - Writes via `router.replace` with `scroll: false` (no history spam while filtering);
 *   pass `push: true` for state that should create history entries (e.g. wizard steps).
 * - Setting the default value removes the param, keeping URLs clean.
 * - Writes read `window.location.search` at call time so multiple setters in the same
 *   tick don't clobber each other.
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

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search)
      if (next === defaultValue || next === '') {
        params.delete(key)
      } else {
        params.set(key, next)
      }
      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (push) {
        router.push(url, { scroll: false })
      } else {
        router.replace(url, { scroll: false })
      }
    },
    [key, defaultValue, pathname, push, router]
  )

  return useMemo(() => [value, setValue], [value, setValue])
}
