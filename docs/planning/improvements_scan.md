# App Improvements Scan

## Executive Summary
After scanning the codebase, I have identified several key areas for improvement. The application has a solid foundation with Next.js 14 and Supabase, but there are opportunities to enhance type safety, feature flexibility, and design consistency.

## 1. Type Safety & Validation
**Severity:** High
**Location:** `src/app/api/match/route.ts`, `src/lib/validation/profile.ts`

-   **Issue:** The matching API route uses unsafe `as unknown as` casting to convert database records (snake_case) to `MatchInput` types. This bypasses type checking and can lead to runtime errors if the database schema changes.
-   **Cause:** Mismatch between database column names (snake_case) and Zod schema keys (camelCase).
-   **Recommendation:** Update Zod schemas in `src/lib/validation/profile.ts` to handle the transformation using `.transform()` or align schema keys with database columns. This will allow removing the unsafe casts.

## 2. Matching Engine Flexibility
**Severity:** Medium
**Location:** `src/app/api/match/route.ts`, `src/lib/matching/engine.ts`

-   **Issue:** The matching engine logic (`scoreMatch`) supports dynamic weighting, but the API route does not expose this functionality to the client.
-   **Impact:** Users cannot adjust the importance of different factors (e.g., prioritizing budget over location).
-   **Recommendation:** Update the `GET` handler in `src/app/api/match/route.ts` to accept query parameters for weights (e.g., `?w_academic=0.4`) and pass them to the `rankMatches` function.

## 3. UI Theming & Consistency
**Severity:** Medium
**Location:** `src/components/inputs/home-country-select.tsx`, `src/components/ui/button.tsx`

-   **Issue:** `HomeCountrySelect` uses hardcoded hex colors (e.g., `#E0E0E0`, `#1C1C1C`) instead of semantic Tailwind theme variables.
-   **Impact:** This breaks dark mode support and makes global theme changes difficult.
-   **Recommendation:** Refactor `HomeCountrySelect` to use `border-input`, `bg-background`, and `text-foreground`.
-   **Issue:** `Button` uses specific rgba shadow values. While likely for a "premium" feel, verify they look good in dark mode or use CSS variables for shadows.

## 4. Component Architecture
**Severity:** Low
**Location:** `src/components/inputs/home-country-select.tsx`

-   **Issue:** The component mixes Radix UI Themes components (`Select.Root` from `@radix-ui/themes`) with custom Tailwind styling.
-   **Recommendation:** Use the headless `@radix-ui/react-select` primitives with Tailwind styling (like the standard shadcn/ui `Select` component) for full control and consistency.

## Proposed Action Plan

1.  **Fix Type Safety:** Refactor `src/lib/validation/profile.ts` and `src/app/api/match/route.ts` to ensure strict type safety without casting.
2.  **Enable Dynamic Weights:** Update the matching API to accept and use weight parameters.
3.  **Refactor UI:** Update `HomeCountrySelect` and `Button` to fully embrace the design system variables.
