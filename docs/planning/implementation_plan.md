# Implementation Plan - App Improvements

## Goal
Implement the improvements identified in the scan, focusing on UI consistency, matching engine flexibility, and type safety.

## User Review Required
> [!IMPORTANT]
> **Type Safety Strategy:** I will align the `MatchInput` types with the Zod schemas. This might involve renaming properties in `src/lib/matching/engine.ts` from snake_case to camelCase to match standard TypeScript conventions and the Zod definitions. This is a refactor that touches the core matching logic.

## Proposed Changes

### UI Components

#### [MODIFY] [home-country-select.tsx](file:///Users/gregfranck/Downloads/Ascenda-main/src/components/inputs/home-country-select.tsx)
-   Replace hardcoded hex colors with Tailwind semantic variables (`bg-background`, `border-input`, `text-foreground`).
-   Ensure dark mode compatibility.

#### [MODIFY] [button.tsx](file:///Users/gregfranck/Downloads/Ascenda-main/src/components/ui/button.tsx)
-   Review and refine shadow values for better dark mode support (using CSS variables if needed).

### Matching Engine API

#### [MODIFY] [route.ts](file:///Users/gregfranck/Downloads/Ascenda-main/src/app/api/match/route.ts)
-   Extract query parameters for weights (e.g., `eligibility`, `academicFit`, `preferenceFit`, `outcomes`).
-   Pass these weights to `rankMatches`.
-   Implement type-safe data transformation from Supabase (snake_case) to Zod-inferred types (camelCase).

### Type Safety & Logic

#### [MODIFY] [engine.ts](file:///Users/gregfranck/Downloads/Ascenda-main/src/lib/matching/engine.ts)
-   Refactor `MatchInput` and related types to be inferred from Zod schemas (or align manually if inference is circular).
-   Update logic to use camelCase properties (e.g., `budget_min` -> `budgetMin`).

#### [MODIFY] [profile.ts](file:///Users/gregfranck/Downloads/Ascenda-main/src/lib/validation/profile.ts)
-   Ensure schemas cover all fields needed for matching.

## Verification Plan

### Automated Tests
-   Run existing tests: `npm test`
-   I may need to update tests in `__tests__` if I change property names in `engine.ts`.

### Manual Verification
-   **UI:** Check `HomeCountrySelect` in light and dark modes.
-   **API:** Call `/api/match` with and without weight parameters and verify results.
