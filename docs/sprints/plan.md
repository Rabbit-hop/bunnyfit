### Three-Sprint Plan

**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Document Version:**  1.0.0
**SRS Baseline Version:**  1.0.0
**Date:**  4 November 2026
**Status:**  Approved Baseline
**Team:**  Nakagamon (67070501064) & Onsinee (67070501078)

--------------------------------------------------------------------------------

#### Document Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 4 Nov 2026 | Initial draft: sprint goals, feature allocation, dependencies, schedule against the course calendar, Lab alignment, risks, Product Definition of Done | Nakagamon (67070501064) & Onsinee (67070501078) | Draft |
| **1.0.0** | 4 Nov 2026 | Finalized baseline v1.0.0. Clarified FR-03 allocation across Sprint 1 (F-03: initial goal setting) and Sprint 2 (F-07: mid-month reconfiguration & plan versioning). Aligned RTM AC coverage, error codes, and persisted `ReminderSetting` scope with SRS 1.0.0 and SDS 1.0.0. | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |

--------------------------------------------------------------------------------

#### 1. Purpose and Inputs
This plan allocates every baseline requirement to one of three sprints and states, for each sprint, its **goal, included feature IDs, dependencies and completion outcome**. It is built from the Feature Inventory 1.0.0 (features F-01 – F-11, SYS-01), the RTM 1.0.0 (28 AC groups, 75 atomic AC) and the System-Level SDS 1.0.0. Dates come from the course calendar; owners are agreed upon by the team.

--------------------------------------------------------------------------------

#### 2. Calendar and Checkpoints
| Date (2026) | Event | Effect on the plan |
| ------ | ------ | ------ |
| Wed 4 Nov | SRS, FI, RTM, SDS, and Plan baselined (v1.0.0) | Sprint 1 opened with 4 days left (5 – 8 Nov) |
| Thu 5 Nov | Workshop and Lab 5 session | Contracts and CI/Docker groundwork |
| **Sun 8 Nov** | **Deliverable 1 due (80 points)** | Sprint 1 release on `main` |
| Tue 10, Thu 12 Nov | Lab 6 sessions (cross-team UAT) | A deployed (or at least runnable) Sprint 1 build is needed for testers |
| Sun 15 Nov | Lab 5 due (Docker, CI/CD, GCP) | Sprint 1 release deployed through the pipeline |
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
| **1** | 4 – 8 Nov | Small working domain slice with authentication, permissions and persistence | F-01, F-02, F-03, F-04, F-06 | 47 | Deliverable 1, 8 Nov |
| **2** | 9 – 29 Nov | Completed core expansion under engineering contracts | F-07, F-11, F-05, F-08 | 20 | Deliverable 2, 29 Nov |
| **3** | contracts by 29 Nov; build to 11 Dec | Remaining features, integration and product hardening | F-09, F-10, SYS-01 | 8 (+ extensions of AC-12c, AC-22c, AC-23, AC-21b for F-06 re-verification) | Progress 29 Nov; complete 13 Dec |

All 24 requirements are covered by the three sprints (Section 7), and every feature appears in exactly one sprint.

--------------------------------------------------------------------------------

#### 4. Sprint 1 — Small Working Slice (4 – 8 Nov)
##### 4.1 Goal
A **Program Manager** defines an exercise template; a **Participant** logs in, selects it, sets a goal, records activity (manual and Quick Complete) and sees computed progress, with real login/logout/current-user, backend role and ownership enforcement, and PostgreSQL persistence. Released on `main` with documented local setup.

##### 4.2 Why This Scope
This is the course example for this theme (define template → select → set goal → record activity → see progress) plus the mandatory authentication foundation. Features are limited to what that journey needs:

| Included | Reason |
| ------ | ------ |
| F-01 Authentication & authorization | Mandatory from Sprint 1; every later feature depends on it |
| F-02 Categories & base exercises | Manager side of the journey; read-only Participant access gives the permission test |
| F-03 Initial Goal Configuration | Participant selects a template and sets an initial goal; snapshot design (Decision 12) must exist from the start |
| F-04 Daily logging (+ profile, Rest Day) | The domain transaction: ledger accumulation, Quick Complete, no-backdating and boundary rejections (`QUICK_COMPLETE_NOT_AVAILABLE` on Rest Days) |
| F-06 Computed progress | The visible result of logging; pure domain functions with strong unit tests |

Deliberately **moved out** of Sprint 1 and recorded as CHANGE-01 / CHANGE-02: F-05 (entry edit/delete) and F-11 (calorie estimation). F-07, F-08, F-09, F-10 depend on this foundation.

##### 4.3 Included Requirements and AC
- **Requirements:** FR-01, FR-02, FR-03 (initial goal setting), FR-04, FR-05, FR-08 (profile); BR-01 to BR-08; NFR-01 (progress/ledger endpoints), NFR-02, NFR-03, NFR-04.
- **AC groups (47 atomic):** AC-01, 02, 03, 04, 06, 10, 11, 12, 13, 14, 15, 16, 17, 21a, 22, 23, 24a, 25, 27.

##### 4.4 Dependencies and Build Order
`Foundation (schema, migrations, seed, route-policy registry, test harness, Clock)` → `F-01` → `F-02` → `F-03` → `F-04` → `F-06` → UI integration → `AC-25` journey.
Each feature contract (AC + STS + DoD) is written and committed **before** its implementation; rule work (BR-01, BR-02, BR-05, BR-03) follows TDD with red and green commits.

##### 4.5 Schedule
| Day | Nakagamon (67070501064) | Onsinee (67070501078) | Together |
| ------ | ------ | ------ | ------ |
| Wed 4 Nov | Repo, Prisma schema, migrations, seed, Docker Compose DB, Clock | Contracts F-03, F-04, F-06 (draft) | Review SDS and plan; create Issues and board |
| Thu 5 Nov | Contracts F-01, F-02; F-01 via TDD (AC-01, AC-22) | F-06 domain unit tests (AC-06, AC-14, AC-15) | Workshop and Lab 5 groundwork |
| Fri 6 Nov | F-02 (AC-02); route-policy registry and Access Matrix (AC-12, AC-22c) | F-03 (AC-03, AC-27); F-04 backend (AC-13, AC-10, AC-11) | Cross-review PRs; integrate into `staging/sprint-1`; **scope checkpoint (Section 4.7, end of day)** |
| Sat 7 Nov | UI: login, Exercise Library; AC-24a, AC-21a | UI: Plan, Today; profile (AC-17) | Playwright journey AC-25, AC-23; fix integration failures |
| Sun 8 Nov | Release PR → `main`, tag `sprint1-v1.0.0` | Assemble Deliverable 1 PDF | Final review; **submit before 20:00** (hard limit 23:59) |

##### 4.6 Completion Outcome (Exit Criteria)
- Journey AC-25 passes through the UI, API and PostgreSQL; a normal workflow, a business-rule rejection (e.g. `LOG_DATE_MISMATCH`, Quick Complete on a Rest Day via `QUICK_COMPLETE_NOT_AVAILABLE`) and 401/403/cross-user checks are demonstrated.
- Local build and test results are recorded against the release commit; README setup works from a clean clone.
- Sprint 1 contracts, PRs with teammate review, staging integration and the tagged release on `main` are traceable.
- RTM Section 3.1 register updated for Sprint 1 AC (actual test names, results, commit).

##### 4.7 Feasibility and Contingency
47 atomic AC in four days for two people is demanding, so the scope has a **pre-agreed cut line**. At the checkpoint on **Fri 6 Nov** (end of day), if the Tier A tests are not at least half written and passing, the Tier B items below are moved to Sprint 2 in this order, each recorded as an approved change (CHANGE-03 …) with the RTM updated the same day:

| Tier | AC | Count | Notes |
| ------ | ------ | :---: | ------ |
| **A (must)** | All Sprint 1 AC not in Tier B — auth, roles, ownership, templates, goal, logging, Quick Complete, no-backdating, boundaries, scoring, persistence, journey AC-25 | 37 | Needed for the course's minimum Sprint 1 outcome |
| **B (cut candidates, in order)** | 1. AC-21a (Sprint 1 latency, re-verified in Sprint 3) · 2. AC-17a–d (profile endpoints, move with F-11) · 3. AC-16a–b (custom exercise defaults) · 4. AC-15 (monthly average) · 5. AC-10c and AC-04c (edge cases) | 10 | Each is already covered again or can start in Sprint 2 without breaking the journey |

--------------------------------------------------------------------------------

#### 5. Sprint 2 — Core Expansion (9 – 29 Nov)
##### 5.1 Goal
Complete the core expansion under engineering contracts: same-day goal reconfiguration with plan versioning, calorie estimation, same-day entry editing/deletion, and history with streaks — integrated, verified and released as the Sprint 2 release on `main`.

##### 5.2 Included Features, Requirements and AC
| Order | Feature | Requirements | AC | Depends on |
| :---: | ------ | ------ | ------ | ------ |
| 1 | **F-07** Goal reconfiguration & plan versioning | BR-11 | AC-07a–c | F-03, F-04, F-06 |
| 2 | **F-11** Estimated duration & calories (METs) | FR-05, FR-08, BR-12 | AC-20a–c, AC-28a–c | F-02, F-03, F-04, F-06 |
| 3 | **F-05** Same-day entry edit/delete | FR-04, BR-09 | AC-05a–c, AC-18a–b | F-04 |
| 4 | **F-08** Personal history & streak | FR-06, BR-10 | AC-08a–b, AC-19a–d | F-03, F-04, F-06, F-07 |

F-07 comes first because F-08 and F-09 depend on plan versions. 20 atomic AC in total.

##### 5.3 Schedule (overlapping Labs 5, 6 and 7)
| Dates | Work |
| ------ | ------ |
| 9 – 15 Nov | **Lab 5:** Docker, CI, GCP; **deploy the Sprint 1 release by Tue 10 Nov** so other teams can test it in Lab 6. Write Sprint 2 contracts (all four features) before coding; start F-07 with TDD. Fix Sprint 1 defects found by CI |
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
| **FR-02** | Activity Category & Base Exercise Management (Manager CRUD & Read-Only Participant) | F-02 | Sprint 1 |
| **FR-03** | Participant Initial Goal Configuration & UserExercise Snapshot Architecture ($\text{Target} > 0$) | F-03 | Sprint 1 |
| **FR-04** | Daily Activity Logging, Profile Integration, Ledger UX & Rest Day Logging | F-04, F-05 | Sprint 1 (F-04), Sprint 2 (F-05) |
| **FR-05** | Real-time Computed Progress Display & Calorie Estimation Display | F-06, F-10, F-11 | Sprint 1 (F-06), Sprint 2 (F-11), Sprint 3 (F-10) |
| **FR-06** | Personal History & Streak Tracking | F-08, F-10 | Sprint 2 (F-08), Sprint 3 (F-10) |
| **FR-07** | Schedule Representation & Persisted Reminder Settings (display only, no external delivery) | F-09 | Sprint 3 |
| **FR-08** | User Profile & Body Weight Management (`GET/PUT /api/profile`, `WeightLog` Append-Only) | F-04, F-11 | Sprint 1 (F-04), Sprint 2 (F-11) |
| **BR-01** | Strictly No Backdating (Asia/Bangkok Timezone, Optional `logDate` Input Validation) | F-04 | Sprint 1 |
| **BR-02** | Valid Range & Boundary Enforcement ($\text{Target} > 0, \text{Max Weight} = 500\text{ kg}, \text{Max Distance} = 100\text{ km}, \text{Body Weight} = 1 - 800\text{ kg}$) | F-02, F-03, F-04 | Sprint 1 |
| **BR-03** | Ratio-Based Score Formulas (6 Tracking Modes) & Daily Overall % | F-06 | Sprint 1 |
| **BR-04** | 100% Data Privacy & Access Isolation Policy (HTTP 401 Unauthorized / HTTP 403 Forbidden), extended to every protected route | F-01, SYS-01 | Sprint 1, 2, 3 |
| **BR-05** | Ledger Accumulation, Quick Complete Mechanics ($\sum \text{Actual} = \text{Target}$) & No-op Handling | F-04 | Sprint 1 |
| **BR-06** | Direct Completed Value Counting Logic | F-04 | Sprint 1 |
| **BR-07** | Targeted-Days-Only Monthly Progress Calculation (Rest days excluded) | F-06, F-10 | Sprint 1, 3 |
| **BR-08** | Custom Exercise Defaults Boundaries | F-03, F-04 | Sprint 1 |
| **BR-09** | Daily Entry Modification Limits (Current Date Only) | F-05 | Sprint 2 |
| **BR-10** | Streak Eligibility Threshold ($\ge 70\%$) & Strict Midnight Reset Rule | F-08 | Sprint 2 |
| **BR-11** | Same-Day Goal Reconfiguration & Plan Versioning (`PlanItem` with `effectiveFrom`) | F-07 | Sprint 2 |
| **BR-12** | Estimated Duration & Calorie Calculation via METs (Historical `WeightLog` Lookup) | F-11 | Sprint 2 |
| **NFR-01** | Performance ($p95 < 500\text{ ms}$ under 50 concurrency; login measured separately) | F-06, SYS-01 | Sprint 1, 3 |
| **NFR-02** | Security & Access Control (HTTP 401 Unauthorized / HTTP 403 Forbidden), Endpoint Access Matrix grows each sprint | F-01, SYS-01 | Sprint 1, 2, 3 |
| **NFR-03** | Usability & Validation Feedback (Clear UI Error Notices) | F-04, SYS-01 | Sprint 1, 3 |
| **NFR-04** | Data Persistence & Durability (Survives Application Restart and GCP Redeployment) | F-04, SYS-01 | Sprint 1, 3 |

--------------------------------------------------------------------------------

#### 8. Feature Dependencies and Proposed Ownership
| Feature | Sprint | Depends on | Primary author (proposed) | Reviewer |
| ------ | :---: | ------ | ------ | ------ |
| Foundation (schema, seed, harness) | 1 | - | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-01 | 1 | - | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-02 | 1 | F-01 | Nakagamon (67070501064) | Onsinee (67070501078) |
| F-03 | 1 | F-01, F-02 | Onsinee (67070501078) | Nakagamon (67070501064) |
| F-04 | 1 | F-01, F-03 | Onsinee (67070501078) | Nakagamon (67070501064) |
| F-06 | 1 | F-04 | Onsinee (67070501078) | Nakagamon (67070501064) |
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
| Lab 5: CI/CD, Docker, GCP | Sun 15 Nov | Containerize and deploy the Sprint 1 release; required checks on PRs; demonstrate a blocked failing check on a temporary branch; deployed by 10 Nov for Lab 6 |
| Lab 6: Cross-team UAT | Sun 22 Nov | Provide test accounts via the private handoff; log findings as Issues; re-test fixes in Sprint 2 releases |
| Lab 7: Maintenance and readiness | Sun 29 Nov | One small, bounded change chosen from UAT findings or the backlog; TDD, regression run, metrics, readiness assessment on its own branch |

--------------------------------------------------------------------------------

#### 10. Workflow, Branches and Releases
Issue (linked to requirement, feature and contract) → `feature/F-xx-…` or `fix/…` branch from `staging/sprint-N` → PR into staging with teammate review (a specific check, question, finding or reason for approval) → sprint integration and system checks → reviewed release PR to `main` → tag (`sprint1-v1.0.0`, `sprint2-v1.0.0`, `final-v1.0.0`). Failed integration returns to an Issue. Contract and plan changes are versioned, not rewritten. A short AI-use declaration is maintained for the final PDF.

--------------------------------------------------------------------------------

#### 11. Risks and Mitigations
| # | Risk | Impact | Mitigation |
| ------ | ------ | ------ | ------ |
| R1 | Sprint 1 has only 4 days for 47 atomic AC | Deliverable 1 incomplete | Tier A/B cut line (Section 4.7); contracts first; checkpoint Fri 6 Nov |
| R2 | Sprint 1 build must be testable in Lab 6 (10 Nov) before Lab 5 is due (15 Nov) | Late UAT | Deploy by 10 Nov; fall back to a documented runnable build and the temporary access arranged with the instructor |
| R3 | Labs 5–7 overlap Sprint 2 | Sprint 2 slips past 29 Nov | Sprint 2 contracts before Lab 5; release candidate frozen 25 Nov; Lab 7 change kept small |
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