# Baseline health — measured 2026-08-01, branch `fix/ui-phase0-bugs`

## Tree size
| Metric | Value |
|---|---|
| TS/TSX files under `src/` | 441 |
| LOC under `src/` | 69,899 |
| Pages (`page.tsx`) | 46 |
| API route handlers | 23 |
| Test files | 31 (28 suites) |

## Gates (all green)
| Gate | Result |
|---|---|
| `tsc --noEmit` | **clean**, exit 0 |
| `jest` | **265 passed**, 28/28 suites, 7.1s |

The tree is *healthy by its own gates*. Every problem in this audit is a problem the
current gates cannot see. That is itself the headline finding.

## Coverage — 13.14% statements / 8.49% functions
```
Statements   : 13.14% ( 2495/18976 )
Branches     :  9.43% ( 1135/12024 )
Functions    :  8.49% (  374/4405  )
Lines        : 13.29% ( 2159/16234 )
```
No coverage threshold is configured, so this number is neither tracked nor enforced.

## Coverage by directory — the shape matters more than the number

Testing is concentrated almost entirely in one subsystem (`lib/chat`, the most
recently built feature) and is effectively absent everywhere else.

**Tested (the chat/agentic subsystem + a few pure libs):**
| dir | files | stmts | cov% |
|---|---|---|---|
| lib/university-search | 1 | 157 | 96.8 |
| lib/applications | 4 | 121 | 87.6 |
| lib/chat | 18 | 1050 | 79.0 |
| lib/scoring | 3 | 433 | 70.9 |
| lib/utils | 3 | 78 | 56.4 |
| app/api | 24 | 1123 | 39.8 |
| lib/matching | 2 | 671 | 26.2 |

**Zero-coverage surfaces, ranked by size — 8,000+ statements untested:**
| dir | files | stmts | cov% |
|---|---|---|---|
| app/counsellor | 59 | 2377 | **0.0** |
| components/landing-preview | 16 | 1274 | **0.0** |
| app/profile | 9 | 1061 | **0.0** |
| components/university-search | 22 | 1046 | **0.0** |
| components/layout | 15 | 640 | **0.0** |
| components/toolbox | 8 | 582 | **0.0** |
| app/course | 19 | 528 | **0.0** |
| components/applications | 7 | 504 | **0.0** |
| app/university-search | 11 | 399 | **0.0** |
| app/parent | 21 | 380 | **0.0** |
| components/chat | 3 | 309 | **0.0** |
| components/ui | 16 | 300 | **0.0** |
| lib/tiering | 1 | 106 | **0.0** |
| lib/supabase | 3 | 41 | **0.0** |
| lib/validation | 2 | 29 | **0.0** |

Notable: `app/counsellor` is the single largest surface in the app (59 files) and has
no tests at all. `lib/tiering` — business rules — is at 0%. `hooks/` (952 stmts,
including the 1,010-line `use-search-results.ts`) is at 8%.

## Largest files (refactor targets by mass)
```
2740  src/lib/types/database.ts            (generated — excluded from judgement)
2553  src/app/profile/_components/StudentIntakeForm.tsx
1023  src/lib/matching/service.ts
1010  src/hooks/use-search-results.ts
 986  src/app/counsellor/universities/_universities-client.tsx
 919  src/components/help/help-thread-drawer.tsx
 901  src/lib/counsellor/data.ts
 822  src/components/assistant/assistant-workspace.tsx
 795  src/lib/scoring/student_scoring.ts
 738  src/app/university-search/search/page.tsx
 737  src/components/chat/chatbot-widget.tsx
```
