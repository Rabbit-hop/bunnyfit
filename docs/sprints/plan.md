### Three-Sprint Plan

**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Document Version:**  1.2.0
**SRS Baseline Version:**  1.1.0
**Date:**  9 November 2026
**Status:**  Draft (review-pending)
**Team:**  Nakagamon (67070501064) & Onsinee (67070501078)

--------------------------------------------------------------------------------

#### Document Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 4 Nov 2026 | Initial draft: sprint goals, feature allocation, dependencies, schedule against the course calendar, Lab alignment, risks, Product Definition of Done | Nakagamon (67070501064) & Onsinee (67070501078) | Draft |
| **1.0.0** | 4 Nov 2026 | Finalized baseline v1.0.0. Clarified FR-03 allocation across Sprint 1 (F-03: initial goal setting) and Sprint 2 (F-07: mid-month reconfiguration & plan versioning). Aligned RTM AC coverage, error codes, and persisted `ReminderSetting` scope with SRS 1.0.0 and SDS 1.0.0. | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |
| **1.1.0** | 6 Nov 2026 | Scope checkpoint executed (Section 4.7): no Tier A test had been written yet, so **all 14 Tier B AC** moved to Sprint 2 and were recorded as CHANGE-03 … CHANGE-08 in RTM 1.1.0 — Sprint 1 47 → **38** atomic AC, Sprint 2 20 → **34**. Added the 5 AC proposed by the Sprint 1 contracts (AC-01f Tier A; AC-02d, AC-03d, AC-04d, AC-06g Tier B), raising the RTM total from 75 to **80** atomic AC. Updated Sections 1, 2, 3, 4.3, 4.7, 5.2, 7 and 11 to match RTM 1.1.0. Review-fix pass before merge: SRS Baseline Version header 1.1.0 (SRS and Feature Inventory also 1.1.0); Section 4.2 / 4.3 / 4.5 no longer list profile (FR-08), AC-15, AC-17 or AC-21a as Sprint 1 work; Section 7 BR-03 → Sprint 1, 2 and FR-04 notes its deferred F-04 AC. Review-fix pass (PR #13): §4.7 AC-21a is Sprint 2 and the four added AC are no longer called "proposed"; NFR-03 target 1, 2, 3; §8 ownership updated — Nakagamon authored the F-03, F-04 and F-06 contracts and Onsinee reviews (the earlier proposal had them reversed). | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |
| **1.2.0** | 9 Nov 2026 | Deliverable 1 due date moved from Sun 8 Nov to **Sun 15 Nov 2026** (same day as Lab 5); the team sets **development freeze Thu 12 Nov**, release PR and tag `sprint1-v1.0.0` on Fri 13 Nov, submission Sun 15 Nov before 20:00 (hard limit 23:59). This supersedes the Thu 12 Nov due date still written in issues #12, #21 and #22, which are edited to match. Updated Sections 2, 3, 4 (title, 4.5 schedule rewritten from actual state on 9 Nov, 4.6, 4.7 second checkpoint and cut line), 5 (Sprint 2 window and 5.3), 9 (Lab 5) and 11 (R1–R3). Sprint 2 and Sprint 3 deadlines (29 Nov, 13 Dec) are unchanged, so Sprint 2 loses about one week of build time. **No AC, feature or sprint allocation changed**; the cut line in 4.7 is conditional, a cut that moves an AC to another sprint is recorded as CHANGE-09 … in RTM Section 4, and a cut that only lowers an AC's evidence is a same-day update of the RTM Section 3.1 register (4.7). The 15 Nov 23:59 closing time was confirmed by Nakagamon on 9 Nov 2026 (not independently checked against LEB2). Section 1 now cites RTM and SDS 1.1.1. | Nakagamon (67070501064) | Draft (review-pending) |

--------------------------------------------------------------------------------

#### 1. Purpose and Inputs
This plan allocates every baseline requirement to one of three sprints and states, for each sprint, its **goal, included feature IDs, dependencies and completion outcome**. It is built from the Feature Inventory 1.1.0 (features F-01 – F-11, SYS-01), the RTM 1.1.1 (28 AC groups, 80 atomic AC) and the System-Level SDS 1.1.1. Dates come from the course calendar; owners are agreed upon by the team.

--------------------------------------------------------------------------------

#### 2. Calendar and Checkpoints
| Date (2026) | Event | Effect on the plan |
| ------ | ------ | ------ |
| Wed 4 Nov | SRS, FI, RTM, SDS, and Plan baselined (v1.0.0) | Sprint 1 opened (originally 4 days, 5 – 8 Nov; extended by the due-date move below) |
| Thu 5 Nov | Workshop and Lab 5 session | Contracts and CI/Docker groundwork |
| **Fri 6 Nov** | Scope checkpoint executed: all 14 Tier B AC moved to Sprint 2 (CHANGE-03 … CHANGE-08); RTM, SDS and plan baselined at 1.1.0 | Sprint 1 scope = 38 atomic AC (Section 4.7) |
| ~~Sun 8 Nov~~ | ~~Deliverable 1 due~~ — moved by the instructor to Sun 15 Nov (v1.2.0) | Sprint 1 build window extended |
| Mon 9 – Wed 11 Nov | Sprint 1 build days; **Wed 11 Nov end of day: checkpoint 2** (Section 4.7) | Cut line applied if F-04 is not merged into `staging/sprint-1` |
| Tue 10, Thu 12 Nov | Lab 6 sessions (cross-team UAT) | A deployed Sprint 1 build will not exist yet; use the R2 fallback (runnable build, arrangement with the instructor) |
| **Thu 12 Nov** | **Sprint 1 development freeze** (team decision) | No new Sprint 1 feature work after this point: only integration fixes, RTM register, PDF material and Lab 5 (separate evidence, Section 9) |
| Fri 13 Nov | Release PR `staging/sprint-1` → `main`, tag `sprint1-v1.0.0`, build and test run on the release commit | Lab 5 work starts from the tagged release |
| **Sun 15 Nov** | **Deliverable 1 due (80 points)** — submit before 20:00 | Same day as Lab 5; evidence kept separate |
| Sun 15 Nov | Lab 5 due (Docker, CI/CD, GCP) — same day as Deliverable 1 | Sprint 1 release (tag of 13 Nov) deployed through the pipeline; Lab 5 work is done Fri 13 – Sat 14 Nov, not left to the last day |
| Tue 17, Thu 19 Nov | Lab 7 sessions (maintenance, metrics, readiness) | One bounded change with regression evidence |
| Sun 22 Nov | Lab 6 due | UAT report, defect register |
| Tue 24, Thu 26 Nov | Final exam review; Deliverable 2 discussion | Sprint 2 release candidate frozen by Wed 25 Nov |
| **Sun 29 Nov** | **Deliverable 2 due (70 points); Lab 7 due** | Sprint 2 complete; Sprint 3 contracts and one working Sprint 3 workflow |
| 1 – 11 Dec | Final examination period | Reduced capacity: bounded completion tasks only |
| **Sun 13 Dec** | **Final Delivery due (100 points)** | Release tagged by Fri 11 Dec; video and PDF on 12 Dec |

--------------------------------------------------------------------------------

#### 3. Sprint Overview
| Sprint | Window | Goal | Features | Atomic AC (first introduced) | Checkpoint |
| :---: | ------ | ------ | ------ | :---: | ------ |
| **1** | 4 – 12 Nov (freeze); submit 15 Nov | Small working domain slice with authentication, permissions and persistence | F-01, F-02, F-03, F-04, F-06 | 38 | Deliverable 1, 15 Nov |
| **2** | 13 – 29 Nov (contracts 13 – 16 Nov; build from 16 Nov) | Completed core expansion under engineering contracts | F-07, F-11, F-05, F-08 | 34 | Deliverable 2, 29 Nov |
| **3** | contracts by 29 Nov; build to 11 Dec | Remaining features, integration and product hardening | F-09, F-10, SYS-01 | 8 (+ extensions of AC-12c, AC-22c, AC-23, AC-21b for F-06 re-verification) | Progress 29 Nov; complete 13 Dec |

All 24 requirements are covered by the three sprints (Section 7), and every feature appears in exactly one sprint.

--------------------------------------------------------------------------------

#### 4. Sprint 1 — Small Working Slice (4 – 12 Nov; submit 15 Nov)
##### 4.1 Goal
A **Program Manager** defines an exercise template; a **Participant** logs in, selects it, sets a goal, records activity (manual and Quick Complete) and sees computed progress, with real login/logout/current-user, backend role and ownership enforcement, and PostgreSQL persistence. Released on `main` with documented local setup.

##### 4.2 Why This Scope
This is the course example for this theme (define template → select → set goal → record activity → see progress) plus the mandatory authentication foundation. Features are limited to what that journey needs:

| Included | Reason |
| ------ | ------ |
| F-01 Authentication & authorization | Mandatory from Sprint 1; every later feature depends on it |
| F-02 Categories & base exercises | Manager side of the journey; read-only Participant access gives the permission test |
| F-03 Initial Goal Configuration | Participant selects a template and sets an initial goal; snapshot design (Decision 12) must exist from the start |
| F-04 Daily logging (+ Rest Day; profile moved to Sprint 2 by CHANGE-04) | The domain transaction: ledger accumulation, Quick Complete, no-backdating and boundary rejections (`QUICK_COMPLETE_NOT_AVAILABLE` on Rest Days) |
| F-06 Computed progress | The visible result of logging; pure domain functions with strong unit tests |

Deliberately **moved out** of Sprint 1 and recorded as CHANGE-01 / CHANGE-02: F-05 (entry edit/delete) and F-11 (calorie estimation). F-07, F-08, F-09, F-10 depend on this foundation.

##### 4.3 Included Requirements and AC
- **Requirements:** FR-01, FR-02, FR-03 (initial goal setting), FR-04, FR-05; BR-01 to BR-07 (BR-01, BR-03 and BR-07 keep their deferred edge-case AC in Sprint 2; FR-04 defers AC-04c/04d); NFR-02, NFR-03, NFR-04. **Not in Sprint 1:** FR-08 (profile, CHANGE-04), BR-08 (CHANGE-05) and NFR-01 (AC-21a latency, CHANGE-03) are verified in Sprint 2.
- **AC groups (38 atomic):** AC-01, 02, 03, 04, 06, 10, 11, 12, 13, 14, 22, 23, 24a, 25, 27. (AC-15, AC-16, AC-17 and AC-21a moved wholly to Sprint 2; the deferred members of the remaining groups are AC-02d, AC-03d, AC-04c–d, AC-06g and AC-10c — CHANGE-03 … CHANGE-08.)

##### 4.4 Dependencies and Build Order
`Foundation (schema, migrations, seed, route-policy registry, test harness, Clock)` → `F-01` → `F-02` → `F-03` → `F-04` → `F-06` → UI integration → `AC-25` journey.
Each feature contract (AC + STS + DoD) is written and committed **before** its implementation; rule work (BR-01, BR-02, BR-05, BR-03) follows TDD with red and green commits.

##### 4.5 Schedule
| Day | Nakagamon (67070501064) | Onsinee (67070501078) | Together |
| ------ | ------ | ------ | ------ |
| Wed 4 Nov – Sun 8 Nov (done) | Foundation (PR #16), F-01 (PR #19, merged 8 Nov), contracts F-01, F-02, F-03, F-04, F-06 and API/UI specs written; register of contract approvals prepared | UI foundation and API/UI specs; review of F-01 | Scope checkpoint on 6 Nov executed (4.7) |
| Mon 9 Nov | F-06 pure domain functions (TDD); start F-02 backend | UI shell, API client, login screen (#7) | **Reviewer approval of the F-02, F-03, F-04 and F-06 contracts (blocks implementation)** |
| Tue 10 Nov | F-02 PR opened and merged into `staging/sprint-1` the same day; F-03 backend (AC-03, AC-27), F-03 PR opened | Exercise Library UI | Same-day PR review |
| Wed 11 Nov | F-03 PR merged (morning); F-04 backend incl. Quick Complete (AC-04, AC-10, AC-13, AC-14, AC-24a); F-06 endpoint; **F-04 PR opened and merged the same day** (checkpoint 2 evaluates it at end of day) | Plan configuration UI | **Checkpoint 2, end of day (4.7)** |
| Thu 12 Nov | Access Matrix over real routes (AC-12, AC-22c); APP_TIMEZONE wiring (if not cut at checkpoint 2); integrate into `staging/sprint-1` | Today/dashboard UI | Playwright journey AC-25 (AC-23 if time and not cut at checkpoint 2); **development freeze, end of day** |
| Fri 13 Nov | RTM Section 3.1 register; release PR → `main`, tag `sprint1-v1.0.0`; build and test run on the release commit; then start Lab 5 | Assemble Deliverable 1 PDF | Bug fixes only, no new features |
| Sat 14 Nov | Lab 5: Dockerfile, CI, GCP (separate branch and evidence) | PDF Parts A – F, evidence index | Buffer for failures |
| Sun 15 Nov | Lab 5 submission | Final PDF check | Final review; **submit Deliverable 1 before 20:00** (hard limit 23:59, confirmed 9 Nov) |

##### 4.6 Completion Outcome (Exit Criteria)
- Journey AC-25 passes through the UI, API and PostgreSQL (if cut (3) of checkpoint 2 in 4.7 is used, this criterion is evaluated at API level for the Sprint 1 release, the UI journey must pass before the Sprint 2 release (5.4), and the gap is stated in the RTM register and the PDF); a normal workflow, a business-rule rejection (e.g. `LOG_DATE_MISMATCH`, Quick Complete on a Rest Day via `QUICK_COMPLETE_NOT_AVAILABLE`) and 401/403/cross-user checks are demonstrated.
- Local build and test results are recorded against the release commit; README setup works from a clean clone.
- Sprint 1 contracts, PRs with teammate review, staging integration and the tagged release on `main` are traceable.
- RTM Section 3.1 register updated for Sprint 1 AC (actual test names, results, commit).

##### 4.7 Feasibility and Contingency
38 atomic AC in the original four days for two people was demanding, so the scope has a **pre-agreed cut line**. At the checkpoint on **Fri 6 Nov** (end of day), if the Tier A tests are not at least half written and passing, the Tier B items below are moved to Sprint 2 in this order, each recorded as an approved change (CHANGE-03 …) with the RTM updated the same day:

| Tier | AC | Count | Notes |
| ------ | ------ | :---: | ------ |
| **A (must)** | All Sprint 1 AC not in Tier B — auth, roles, ownership, templates, goal, logging, Quick Complete, no-backdating, boundaries, scoring, persistence, journey AC-25; plus AC-01f (login validation, added 6 Nov, Tier A) | 38 | Needed for the course's minimum Sprint 1 outcome; only checkpoint 2 (below) may reduce Tier A, in its stated order |
| **B (cut candidates, in order)** | 1. AC-21a (Sprint 2 latency; AC-21b is the Sprint 3 full re-verification) · 2. AC-17a–d (profile endpoints, move with F-11) · 3. AC-16a–b (custom exercise defaults) · 4. AC-15 (monthly average) · 5. AC-10c and AC-04c (edge cases) · 6. AC-02d, AC-03d, AC-04d, AC-06g (AC added and approved with the Sprint 1 contracts, 6 Nov) | 14 | Each is already covered again or can start in Sprint 2 without breaking the journey |

**Checkpoint 2 (added in v1.2.0), Wed 11 Nov end of day:** if F-04 is not merged into `staging/sprint-1`, cut in this order, each applied with the RTM updated the same day: (1) the AC-23 end-to-end test (TEST-23 stays PLANNED) and the APP_TIMEZONE wiring (issue #17), recorded as a sprint move (AC-23: Sprint 1 → 2) in RTM Section 4 as CHANGE-09; (2) the Today/dashboard UI is reduced to the minimum needed for AC-25 (F-06 domain unit tests and the F-06 progress endpoint are kept); (3) if the UI journey cannot run in time, AC-25 is demonstrated at API level with Supertest and the missing UI coverage is stated as a known gap. Cuts (2) and (3) are not sprint moves (AC-25 stays a Sprint 1 target): they are recorded as same-day updates of the RTM Section 3.1 register (INCOMPLETE or PLANNED, plus a test-mapping note if a Supertest journey test is added), not in RTM Section 4. **Never cut:** F-02, F-03 and F-04 backend, the F-06 progress endpoint and its Tier A tests (AC-06a – f), and the Access Matrix. A cut or unfinished AC is shown in the RTM register as INCOMPLETE or PLANNED, never as PASS. No cut has been executed yet.

**Executed at the checkpoint on Fri 6 Nov 2026:** no Tier A test had been written yet, so **all 14 Tier B AC moved to Sprint 2** and were recorded as CHANGE-03 … CHANGE-08 in RTM 1.1.0. Sprint 1 therefore runs with **38 atomic AC**; the deferred AC keep their STS in the Sprint 1 contracts and are verified with their features (F-02, F-03, F-04, F-06) during Sprint 2.

--------------------------------------------------------------------------------

#### 5. Sprint 2 — Core Expansion (13 – 29 Nov)
##### 5.1 Goal
Complete the core expansion under engineering contracts: same-day goal reconfiguration with plan versioning, calorie estimation, same-day entry editing/deletion, and history with streaks — integrated, verified and released as the Sprint 2 release on `main`.

##### 5.2 Included Features, Requirements and AC
| Order | Feature | Requirements | AC | Depends on |
| :---: | ------ | ------ | ------ | ------ |
| 1 | **F-07** Goal reconfiguration & plan versioning | BR-11 | AC-07a–c | F-03, F-04, F-06 |
| 2 | **F-11** Estimated duration & calories (METs) | FR-05, FR-08, BR-12 | AC-20a–c, AC-28a–c | F-02, F-03, F-04, F-06 |
| 3 | **F-05** Same-day entry edit/delete | FR-04, BR-09 | AC-05a–c, AC-18a–b | F-04 |
| 4 | **F-08** Personal history & streak | FR-06, BR-10 | AC-08a–b, AC-19a–d | F-03, F-04, F-06, F-07 |

**Deferred from Sprint 1 (CHANGE-03 … CHANGE-08, 6 Nov):** AC-02d, AC-03d, AC-04c–d, AC-06g, AC-10c, AC-15, AC-16a–b, AC-17a–d, AC-21a — 14 atomic AC, verified with their Sprint 1 features (F-02, F-03, F-04, F-06) during Sprint 2.

F-07 comes first because F-08 and F-09 depend on plan versions. 34 atomic AC in total (20 originally planned + 14 deferred from Sprint 1 by CHANGE-03 … CHANGE-08).

##### 5.3 Schedule (overlapping Labs 5, 6 and 7)
| Dates | Work |
| ------ | ------ |
| 13 – 15 Nov | Sprint 1 release and submission (4.5); **Lab 5:** Docker, CI, GCP, deploying the Sprint 1 tag. Start writing the Sprint 2 contracts as time allows |
| 16 Nov | Sprint 2 contracts (all four features) finished before coding; **Sprint 2 cut line decided** (which of F-08 / F-11 may slip, ordered, agreed by both members); start F-07 with TDD. Fix Sprint 1 defects found by CI |
| 16 – 22 Nov | Lab 6 findings triaged into Issues; implement F-07 and F-11; start F-05. Draft Sprint 3 contracts (F-09, F-10, SYS-01). Lab 7 analysis |
| 23 – 25 Nov | F-05 and F-08; integrate on `staging/sprint-2`; regression and acceptance journeys; **release PR and tag `sprint2-v1.0.0` by Wed 25 Nov** |
| 26 – 29 Nov | Deploy; post-deployment checks; Lab 7 change merged on its own branch with separate evidence; Deliverable 2 PDF; **submit by Sun 29 Nov** |

##### 5.4 Completion Outcome (Exit Criteria)
- All four features complete, reviewed, integrated and verified against their contracts; none moved to Sprint 3 without an approved change.
- Sprint 1 journey (AC-25) still passes; Access Matrix extended to all new routes (AC-12c, AC-22c).
- Original Sprint 2 release identifiable by tag even if later commits exist; deployed on GCP through the pipeline.

--------------------------------------------------------------------------------

#### 6. Sprint 3 — Completion and Hardening (contracts by 29 Nov; complete 11 Dec)
##### 6.1 Goal
Complete the remaining features, integrate everything and harden the product: persisted schedule and reminder settings (`timeOfDay`, `repeatDays`, `label`, `enabled`), the monthly summary, and final verification of the cross-cutting requirements (security on every endpoint, performance benchmark re-verification across F-06 and all routes, validation feedback, durability after redeployment).

##### 6.2 Included Features, Requirements and AC
| Order | Feature | Requirements | AC | Depends on |
| :---: | ------ | ------ | ------ | ------ |
| 1 | **F-09** Schedule & persisted reminder settings | FR-07 | AC-09a–c | F-03, F-07 |
| 2 | **F-10** Monthly progress summary | FR-05, FR-06, BR-07 | AC-26a–c | F-06, F-08, F-11 |
| 3 | **SYS-01** System hardening & final NFR verification | NFR-01 to NFR-04, BR-04 | AC-21b, AC-24b; extensions of AC-12c, AC-22c, AC-23 | F-01 – F-11 |

##### 6.3 Schedule
| Dates | Work |
| ------ | ------ |
| By Sun 29 Nov | Contracts, AC and STS for F-09, F-10, SYS-01; **F-09 implemented and tested** (chosen as the Deliverable 2 workflow because it needs only F-03 and F-07, so it does not wait for F-08 or F-11); explicit remaining-work list with owners |
| 30 Nov – 4 Dec | F-10 once F-08 and F-11 are merged; adapt to the examination timetable and reserve each member's exam days |
| 5 – 8 Dec | SYS-01: complete Access Matrix over all routes, per-endpoint latency report (re-verifying F-06 progress endpoints alongside all routes), UI validation checks, restart and redeploy persistence check on GCP |
| 8 – 10 Dec | Independent UAT re-tests of affected journeys; defect fixes; documents and RTM register finalized |
| **Fri 11 Dec** | **Release PR, tag `final-v1.0.0`, deployment and post-deployment check** |
| 12 – 13 Dec | Demonstration video (≤ 4 minutes, both members), Final PDF; **submit by Sun 13 Dec, target before 20:00** |

##### 6.4 Completion Outcome (Exit Criteria)
Every requirement has a recorded status; all required tests are enabled and executed on the final commit; remaining defects and technical debt are listed with impact and next action; the submitted tag is immutable and the deployed version matches it.

--------------------------------------------------------------------------------

#### 7. Requirement Coverage by Sprint
Generated from the Feature Inventory audit matrix (single source of truth).

| Requirement | Summary | Feature(s) | Sprint(s) |
| ------ | ------ | ------ | ------ |
| **FR-01** | User Authentication, JWT `jti` Denylist, Logout & Server-side Authorization | F-01 | Sprint 1 |
| **FR-02** | Activity Category & Base Exercise Management (Manager CRUD & Read-Only Participant) | F-02 | Sprint 1, 2 |
| **FR-03** | Participant Initial Goal Configuration & UserExercise Snapshot Architecture ($\text{Target} > 0$) | F-03 | Sprint 1, 2 |
| **FR-04** | Daily Activity Logging, Profile Integration, Ledger UX & Rest Day Logging | F-04, F-05 | Sprint 1 (F-04), Sprint 2 (F-05; F-04 deferred AC-04c–d, AC-17a–d) |
| **FR-05** | Real-time Computed Progress Display & Calorie Estimation Display | F-06, F-10, F-11 | Sprint 1 (F-06; deferred AC-06g, AC-15, AC-21a), Sprint 2 (F-11), Sprint 3 (F-10) |
| **FR-06** | Personal History & Streak Tracking | F-08, F-10 | Sprint 2 (F-08), Sprint 3 (F-10) |
| **FR-07** | Schedule Representation & Persisted Reminder Settings (display only, no external delivery) | F-09 | Sprint 3 |
| **FR-08** | User Profile & Body Weight Management (`GET/PUT /api/profile`, `WeightLog` Append-Only) | F-04, F-11 | Sprint 2 (F-04, F-11) |
| **BR-01** | Strictly No Backdating (Asia/Bangkok Timezone, Optional `logDate` Input Validation) | F-04 | Sprint 1, 2 |
| **BR-02** | Valid Range & Boundary Enforcement ($\text{Target} > 0, \text{Max Weight} = 500\text{ kg}, \text{Max Distance} = 100\text{ km}, \text{Body Weight} = 1 - 800\text{ kg}$) | F-02, F-03, F-04 | Sprint 1 |
| **BR-03** | Ratio-Based Score Formulas (6 Tracking Modes) & Daily Overall % | F-06 | Sprint 1, 2 |
| **BR-04** | 100% Data Privacy & Access Isolation Policy (HTTP 401 Unauthorized / HTTP 403 Forbidden), extended to every protected route | F-01, SYS-01 | Sprint 1, 2, 3 |
| **BR-05** | Ledger Accumulation, Quick Complete Mechanics ($\sum \text{Actual} = \text{Target}$) & No-op Handling | F-04 | Sprint 1 |
| **BR-06** | Direct Completed Value Counting Logic | F-04 | Sprint 1 |
| **BR-07** | Targeted-Days-Only Monthly Progress Calculation (Rest days excluded) | F-06, F-10 | Sprint 1, 2, 3 |
| **BR-08** | Custom Exercise Defaults Boundaries | F-03, F-04 | Sprint 2 |
| **BR-09** | Daily Entry Modification Limits (Current Date Only) | F-05 | Sprint 2 |
| **BR-10** | Streak Eligibility Threshold ($\ge 70\%$) & Strict Midnight Reset Rule | F-08 | Sprint 2 |
| **BR-11** | Same-Day Goal Reconfiguration & Plan Versioning (`PlanItem` with `effectiveFrom`) | F-07 | Sprint 2 |
| **BR-12** | Estimated Duration & Calorie Calculation via METs (Historical `WeightLog` Lookup) | F-11 | Sprint 2 |
| **NFR-01** | Performance ($p95 < 500\text{ ms}$ under 50 concurrency; login measured separately) | F-06, SYS-01 | Sprint 2, 3 |
| **NFR-02** | Security & Access Control (HTTP 401 Unauthorized / HTTP 403 Forbidden), Endpoint Access Matrix grows each sprint | F-01, SYS-01 | Sprint 1, 2, 3 |
| **NFR-03** | Usability & Validation Feedback (Clear UI Error Notices) | F-04, F-05, SYS-01 | Sprint 1, 2, 3 |
| **NFR-04** | Data Persistence & Durability (Survives Application Restart and GCP Redeployment) | F-04, SYS-01 | Sprint 1, 3 |

--------------------------------------------------------------------------------

#### 8. Feature Dependencies and Ownership
| Feature | Sprint | Depends on | Primary author | Reviewer |
| ------ | :---: | ------ | ------ | ------ |
| Foundation (schema, seed, harness) | 1 | - | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-01 | 1 | - | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-02 | 1 | F-01 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-03 | 1 | F-01, F-02 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-04 | 1 | F-01, F-03 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-06 | 1 | F-04 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-07 | 2 | F-03, F-04, F-06 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-08 | 2 | F-03, F-04, F-06, F-07 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-05 | 2 | F-04 | Onsinee (67070501078) | Nakagamon (67070501064) |
| F-11 | 2 | F-02, F-03, F-04, F-06 | Onsinee (67070501078) | Nakagamon (67070501064) |
| F-09 | 3 | F-03, F-07 | Onsinee (67070501078) | Nakagamon (67070501064) |
| F-10 | 3 | F-06, F-08, F-11 | Nakagamon (67070501064) | Onsinee (67070501078) |
| SYS-01 | 3 | F-01 – F-11 | Both | Both |

Each author writes the contract for their own features; the other member reviews the contract before implementation starts. Authors never approve their own PRs.

--------------------------------------------------------------------------------

#### 9. Lab Alignment
Lab work may be part of a sprint, but its evidence is kept separate from feature work (tagged Issues and PRs).

| Lab | Due | Plan |
| ------ | ------ | ------ |
| Lab 5: CI/CD, Docker, GCP | Sun 15 Nov | Containerize and deploy the Sprint 1 release (tag of 13 Nov); required checks on PRs; demonstrate a blocked failing check on a temporary branch; worked on Fri 13 – Sat 14 Nov, same due date as Deliverable 1 |
| Lab 6: Cross-team UAT | Sun 22 Nov | Provide test accounts via the private handoff; log findings as Issues; re-test fixes in Sprint 2 releases |
| Lab 7: Maintenance and readiness | Sun 29 Nov | One small, bounded change chosen from UAT findings or the backlog; TDD, regression run, metrics, readiness assessment on its own branch |

--------------------------------------------------------------------------------

#### 10. Workflow, Branches and Releases
Issue (linked to requirement, feature and contract) → `feature/F-xx-…` or `fix/…` branch from `staging/sprint-N` → PR into staging with teammate review (a specific check, question, finding or reason for approval) → sprint integration and system checks → reviewed release PR to `main` → tag (`sprint1-v1.0.0`, `sprint2-v1.0.0`, `final-v1.0.0`). Failed integration returns to an Issue. Contract and plan changes are versioned, not rewritten. A short AI-use declaration is maintained for the final PDF.

--------------------------------------------------------------------------------

#### 11. Risks and Mitigations
| # | Risk | Impact | Mitigation |
| ------ | ------ | ------ | ------ |
| R1 | At 9 Nov F-02, F-03, F-04, F-06 backend and all UI are not yet built; 4 build days remain (9 – 12 Nov) | Deliverable 1 incomplete | Cut line of 6 Nov executed (CHANGE-03 … CHANGE-08); checkpoint 2 on Wed 11 Nov with the ordered cut line in Section 4.7; freeze Thu 12 Nov; honest RTM status |
| R2 | Lab 6 sessions (10 and 12 Nov) fall before the Sprint 1 build exists and before Lab 5 (15 Nov) | Late UAT | The 10 Nov deployment is no longer possible; Nakagamon asks the instructor whether Lab 6 sessions move (answer needed before Tue 10 Nov; if they do not move, the 10 Nov session gets no build and findings compress against the 22 Nov due date), otherwise provide a documented runnable build and the temporary access arranged with the instructor |
| R3 | Labs 5–7 overlap Sprint 2 and the Sprint 1 move cuts Sprint 2 build time from three weeks to about two | Sprint 2 slips past 29 Nov | Sprint 2 contracts by 16 Nov; Sprint 2 cut line decided 16 Nov; release candidate frozen 25 Nov; Lab 7 change kept small |
| R4 | Date-dependent rules (BR-09, BR-10, BR-11) are hard to test under no-backdating | Weak evidence | Injectable Clock and dated seed rows from day one (SDS Section 2.6) |
| R5 | Final exams 1 – 11 Dec | Reduced capacity | Everything substantial done by 29 Nov; December work is bounded (F-10, SYS-01, defects) |
| R6 | Sprint 3 looks light (F-09 near-placeholder) | Low credit for Sprint 3 progress | F-09 persists reminders and derives the schedule; F-10 has real rules; SYS-01 adds verification work |
| R7 | NFR-01 may fail for login (bcrypt) or heavy endpoints | NFR failure | Login measured separately (p95 < 1,000 ms); indexes; tune cost; document honestly if a target is missed |
| R8 | Two-person bottleneck, review delays | Blocked PRs | Same-day review rule; small PRs; contracts reviewed before coding |

--------------------------------------------------------------------------------

#### 12. Product Definition of Done
A feature or release is done only when **all** items have evidence:
1. **Contract:** versioned feature SDS, AC, STS and DoD exist before implementation, with revisions recorded.
2. **Behavior:** implemented as specified, including negative and boundary cases.
3. **Tests:** every AC has a mapped, enabled test with meaningful assertions; TDD red/green evidence for rule, defect and change work.
4. **Access:** 401, 403 and cross-user checks cover every protected endpoint the feature adds (Endpoint Access Matrix).
5. **Review and integration:** teammate-reviewed PR, sprint staging integration, reviewed release PR, tagged release on `main`.
6. **Verification run:** build and automated suite executed on the release commit (CI from Lab 5); counts for passed, failed and skipped recorded.
7. **Independent acceptance:** relevant Lab 6 UAT cases executed by another team; affected journeys re-tested after fixes, with tester, result and version.
8. **Deployment:** deployed on GCP through the pipeline; post-deployment check passes; saved data is still retrievable after restart or redeployment.
9. **Documents:** SRS, Feature Inventory, RTM (including the Section 3.1 register), SDS and contracts describe the released behavior; approved changes are logged.
10. **Configuration:** `.env.example`, README, Docker setup, migrations and seed are current; no real secrets in Git or the PDF.
11. **Debt and defects:** known defects, limitations and technical debt are listed with impact and next action; blockers are stated plainly.

--------------------------------------------------------------------------------

#### 13. Change Control for This Plan
Changes to sprint scope are recorded as a new change entry (CHANGE-nn) in RTM Section 4 with the original sprint, revised sprint, rationale, impact and approver; the Feature Inventory, RTM and this plan are updated together and versioned. Required features are not moved to a later sprint simply to mark a sprint complete.