### Feature Inventory Specification
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Document Version:**  1.1.0
**SRS Baseline Version:**  1.1.0
**Date:**  6 November 2026
**Status:**  Approved Baseline (Updated with Resolved Architecture & Design Decisions B1–B8)

--------------------------------------------------------------------------------

#### Document Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 3 Nov 2026 | Initial draft from CPE 334 group brief | Nakagamon (67070501064) & Onsinee (67070501078) | Draft |
| **0.5.0** | 3 Nov 2026 | Added 4-domain exercise structure and ratio-based formulas | Nakagamon (67070501064) & Onsinee (67070501078) | Review |
| **1.0.0** | 4 Nov 2026 | Finalized baseline v1.0.0. Added F-11 for METs calorie calculation in Sprint 2, updated F-01 with login/logout/me auth endpoints, updated F-02 with Template Copy-on-Select snapshot, updated F-04 with Ledger logging mechanics and Rest Day rules, aligned audit matrix and dependencies. Aligned F-03 Target Sprint strictly to Sprint 1 (F-07 handles Sprint 2 goal reconfiguration), updated F-09 for persisted `ReminderSetting` fields (`label`, `enabled`), aligned FR-05 with calorie display in F-11, added profile GET and PUT endpoints in F-04, aligned NFR-01 benchmarking scope across Sprint 1 and 3, added F-10 system test mapping. Incorporated Design Decisions B1–B8: trackingMode enum (F-02), JWT jti Denylist (F-01), Quick Complete sets/totalReps & No-op handling (F-04), UserExercise snapshot architecture (F-03), historical WeightLog lookup (F-11), backend Rest Day Quick Complete HTTP 400 enforcement (`QUICK_COMPLETE_NOT_AVAILABLE`, F-04). Consistency pass: corrected Max Distance unit (km) in BR-02 audit row and F-11 dependency notation, aligned dependencies (F-08, F-11, F-10), separated F-10 (Monthly Progress Summary) from the cross-cutting responsibility SYS-01 (System Hardening & Final NFR Verification). | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |
| **1.1.0** | 6 Nov 2026 | Target sprints synchronized with RTM 1.1.0 and the Fri 6 Nov scope checkpoint (CHANGE-03 … CHANGE-08, 14 Tier B AC moved to Sprint 2). Section 2: F-02, F-03, F-04 and F-06 are now "Sprint 1, 2" (their deferred AC — AC-02d, AC-03d, AC-04c–d, AC-06g, AC-10c, AC-15, AC-16a–b, AC-17a–d, AC-21a — are verified in Sprint 2). Section 3: FR-02, FR-03, BR-01, BR-03 → Sprint 1, 2; FR-08 and BR-08 → Sprint 2; BR-07 → Sprint 1, 2, 3; NFR-01 → Sprint 2, 3. No feature, requirement or dependency changed. Review-fix pass (PR #13): NFR-03 mapped to F-04, F-05, SYS-01 and Sprints 1, 2, 3 (AC-23 third case is F-05). | Nakagamon (67070501064) | **Approved Baseline** |

--------------------------------------------------------------------------------

#### 1. Overview & Inventory Scope
This **Feature Inventory Specification** document compiles and classifies all feature scopes for the **Habit and Activity Tracking System**. It links software requirements including Functional Requirements (FR), Business Rules (BR), and Non-Functional Requirements (NFR) from the Software Requirements Specification (SRS v1.1.0) to development cycles (Sprint Allocation) across a 3-sprint model.

--------------------------------------------------------------------------------

#### 2. Comprehensive Feature Inventory Table
| Feature ID | Feature Name & Detailed Engineering Description | Related Requirements | Dependencies | Target Sprint | Primary Verification Strategy |
| ------ | ------ | ------ | ------ | ------ | ------ |
| **F-01** | **User Authentication & Server-Side Authorization** : User authentication system using Seeded Credentials (`POST /api/auth/login`) with JWT Token Lifecycle (1-hour token expiration), Password Hashing (bcrypt), current user data retrieval (`GET /api/auth/me`), user logout (`POST /api/auth/logout`) via a RevokedToken Denylist (`jti`) in PostgreSQL, and server-side authorization separating Program Manager and Participant roles, immediately returning HTTP 401 or 403. | FR-01, BR-04, NFR-02 | - | Sprint 1 | API Integration Test (`tests/integration/auth.test.ts`) & Security Guard Assertions |
| **F-02** | **Activity Category & Base Exercise Management** : Activity category and exercise management system for Manager to Create, Read, Update, and Delete (CRUD) exercise categories and standard base exercises, specifying Target Body Part, Unit, Valid Range, `metValue`, `cardioCategory`, and `trackingMode` (6 values); allows Participant read-only access to Templates (`GET /api/templates`) and blocks Participant modification/deletion requests with HTTP 403 Forbidden. Categories are Manager-managed grouping labels (seeded with the 4 core domains), and a template's Valid Range may not exceed the central BR-02 boundaries. | FR-02, BR-02 | F-01 | Sprint 1, 2 | API Integration Test (`tests/integration/manager_template.test.ts`) |
| **F-03** | **Initial Participant Goal Configuration & 4-Domain Exercise Creation** : Initial monthly plan (daily target) configuration system for Participant, selecting from Templates (via Copy-on-Select Snapshot into `UserExercise` table) or creating Custom Exercises across 6 tracking modes; defines targets per `trackingMode` (`targetSets` $\times$ `targetRepsPerSet`, `targetDurationSec`, or `targetDistanceKm`); enforces Target $> 0$, Priority Weight ($1-5$, integer), `effectiveFrom` Date (today or later), Weekly Repeat Default (every day), and optional plan end date; snapshots stay unchanged when the Manager edits or deletes the source template. | FR-03, BR-02, BR-08 | F-01, F-02 | Sprint 1, 2 | API & DB Integration Test (`tests/integration/goal_config.test.ts`) |
| **F-04** | **Daily Activity Logging, Profile Integration & Rest Day Logging** : Daily activity logging system (Current Date or optional `logDate` input) via Ledger Entries storing sets and totalReps through Quick Complete (filling difference to target, or acting as a No-op returning 200 OK with `entry: null` if already completed) or Manual Override (accumulating actual logged values); fetches and updates body weight via user profile (`GET /api/profile`, `PUT /api/profile`), and supports Rest Day logging, with Backend returning HTTP 400 (`QUICK_COMPLETE_NOT_AVAILABLE`) when Quick Complete is requested on a Rest Day. Rest Day entries are free-form and not scored; all inputs are validated against BR-02 boundaries per entry and per-day cumulative total. | FR-04, FR-08, BR-01, BR-02, BR-05, BR-06, BR-08, NFR-03, NFR-04 | F-01, F-03 | Sprint 1, 2 | API Integration Test (`tests/integration/daily_logging.test.ts`) & Playwright UI E2E |
| **F-05** | **Same-Day Entry Modification & Deletion** : Management system for editing (Edit) and deleting (Delete) sub-activity ledger entries for Participant, restricted strictly to entries created on the current date (Current Date) to correct errors; strictly rejects editing or deleting historical entries with HTTP 409 `ENTRY_NOT_EDITABLE`. *(Shifted to Sprint 2 per scope adjustment plan)*. | FR-04, BR-09 | F-04 | Sprint 2 | API Integration Test (`tests/integration/entry_modification.test.ts`) |
| **F-06** | **Real-Time Computed Progress Display** : Real-time progress calculation and display system, including Daily Activity Score (per-exercise Item Score using the ratio formula across 4 domains and 6 tracking modes; Rest Day = `null`, not 0%), Daily Overall Progress (%), and monthly average score computed strictly on targeted days (Targeted Days Only). | FR-05, BR-03, BR-07, NFR-01 | F-04 | Sprint 1, 2 | Unit Test (`tests/unit/progress_calc.test.ts`) & Latency Verification |
| **F-07** | **Same-Day Goal Reconfiguration & Plan Versioning** : Mid-month goal reconfiguration system via Plan Versioning (`PlanItem` with `effectiveFrom`); modifying goals on the current date immediately applies the new target to calculate current-day and future scores, without retroactively affecting past Daily Scores and Streaks. | BR-11 | F-03, F-04, F-06 | Sprint 2 | API Integration Test (`tests/integration/goal_reconfig.test.ts`) |
| **F-08** | **Personal History & Streak Tracking** : Personal historical activity logging system and streak tracking based on the criterion Daily Overall Progress (%) $\ge 70\%$ on targeted days. If a targeted day achieves $< 70\%$ or has no activity logged, the Streak resets to $0$ immediately at midnight Asia/Bangkok time (Rest Days do not affect Streaks). | FR-06, BR-10 | F-03, F-04, F-06, F-07 | Sprint 2 | API Integration Test & UI E2E Test (`tests/integration/streak_history.test.ts`) |
| **F-09** | **Schedule Representation & Persisted Reminder Settings** : Weekly/monthly schedule view derived from the Participant's `PlanItem`s (targeted days vs Rest Days) via `GET /api/schedule`, and per-participant `ReminderSetting` (time of day `HH:mm`, repeat days, label, enabled status) with create/update/delete persisted in PostgreSQL and visible only to its owner; reminders are displayed in the UI only (no external email/push/SMS is sent). | FR-07, BR-04 | F-03, F-07 | Sprint 3 | UI Component & API/DB Integration Test (`tests/integration/reminder.test.ts`) |
| **F-10** | **Monthly Progress Summary** : Monthly summary report (`GET /api/summary?month=YYYY-MM`) for the Participant's own data: targeted/Rest Day counts, days reaching $\ge 70\%$, monthly average (Targeted Days Only), current Streak, total estimated kcal, and per-exercise totals; consistent with the progress endpoint and rejecting access to other users' summaries. | FR-05, FR-06, BR-07 | F-06, F-08, F-11 | Sprint 3 | System & Integration Test (`tests/system/monthly_summary.test.ts`) |
| **F-11** | **Estimated Duration & Calorie Calculation via METs** : Automated duration estimation and estimated calories burned calculation system (Estimated Calories Burned via METs) by retrieving body weight from `WeightLog` on the activity date combined with the activity's MET value, displaying results on user screens; when no weight exists the API returns HTTP 200 with calories `null` and `calorieError: "BODY_WEIGHT_REQUIRED"`. | FR-05, FR-08, BR-12 | F-02, F-03, F-04, F-06 | Sprint 2 | Unit Test (`tests/unit/calorie_calc.test.ts`) & API/DB Integration Test (`tests/integration/calorie_weightlog.test.ts`) |
| **SYS-01** | **System Hardening & Final NFR Verification (system responsibility, not a user feature)** : Extends and finally verifies NFR-01 to NFR-04 on the integrated product: Endpoint Access Matrix covering every protected route added in Sprints 1–3 (401 / 403 / cross-user), per-endpoint p95 latency report, UI validation feedback across Sprint 2–3 features, and data persistence after server restart and GCP redeployment. | NFR-01, NFR-02, NFR-03, NFR-04, BR-04 | F-01 – F-11 | Sprint 3 | `tests/integration/security_access.test.ts`, `tests/performance/latency.test.ts`, `tests/e2e/validation_feedback.spec.ts`, `tests/integration/persistence.test.ts` |

--------------------------------------------------------------------------------

#### 3. Audit Matrix: Requirement Coverage Mapping
| Requirement ID | Requirement Summary & Alignment Note | Mapped Feature ID(s) | Target Sprint | Coverage Audit Status |
| ------ | ------ | ------ | ------ | ------ |
| **FR-01** | User Authentication, JWT `jti` Denylist, Logout & Server-side Authorization | F-01 | Sprint 1 | Fully Covered |
| **FR-02** | Activity Category & Base Exercise Management (Manager CRUD & Read-Only Participant) | F-02 | Sprint 1, 2 | Fully Covered |
| **FR-03** | Participant Initial Goal Configuration & UserExercise Snapshot Architecture ($\text{Target} > 0$) | F-03 | Sprint 1, 2 | Fully Covered (Sprint 1: F-03 initial goals; Sprint 2: F-07 reconfiguration under BR-11) |
| **FR-04** | Daily Activity Logging, Profile Integration, Ledger UX & Rest Day Logging | F-04, F-05 | Sprint 1, 2 | Fully Covered |
| **FR-05** | Real-time Computed Progress Display & Calorie Estimation Display | F-06, F-10, F-11 | Sprint 1, 2, 3 | Fully Covered |
| **FR-06** | Personal History & Streak Tracking | F-08, F-10 | Sprint 2, 3 | Fully Covered |
| **FR-07** | Schedule Representation & Persisted Reminder Settings (display only, no external delivery) | F-09 | Sprint 3 | Fully Covered |
| **FR-08** | User Profile & Body Weight Management (`GET/PUT /api/profile`, `WeightLog` Append-Only) | F-04, F-11 | Sprint 2 | Fully Covered |
| **BR-01** | Strictly No Backdating (Asia/Bangkok Timezone, Optional `logDate` Input Validation) | F-04 | Sprint 1, 2 | Fully Covered |
| **BR-02** | Valid Range & Boundary Enforcement ($\text{Target} > 0, \text{Max Weight} = 500\text{ kg}, \text{Max Distance} = 100\text{ km}, \text{Body Weight} = 1 - 800\text{ kg}$) | F-02, F-03, F-04 | Sprint 1 | Fully Covered |
| **BR-03** | Ratio-Based Score Formulas (6 Tracking Modes) & Daily Overall % | F-06 | Sprint 1, 2 | Fully Covered |
| **BR-04** | 100% Data Privacy & Access Isolation Policy (HTTP 401 Unauthorized / HTTP 403 Forbidden), extended to every protected route | F-01, SYS-01 | Sprint 1, 2, 3 | Fully Covered |
| **BR-05** | Ledger Accumulation, Quick Complete Mechanics ($\sum \text{Actual} = \text{Target}$) & No-op Handling | F-04 | Sprint 1 | Fully Covered |
| **BR-06** | Direct Completed Value Counting Logic | F-04 | Sprint 1 | Fully Covered |
| **BR-07** | Targeted-Days-Only Monthly Progress Calculation (Rest days excluded) | F-06, F-10 | Sprint 1, 2, 3 | Fully Covered |
| **BR-08** | Custom Exercise Defaults Boundaries | F-03, F-04 | Sprint 2 | Fully Covered |
| **BR-09** | Daily Entry Modification Limits (Current Date Only) | F-05 | Sprint 2 | Fully Covered (Approved Scope Change) |
| **BR-10** | Streak Eligibility Threshold ($\ge 70\%$) & Strict Midnight Reset Rule | F-08 | Sprint 2 | Fully Covered |
| **BR-11** | Same-Day Goal Reconfiguration & Plan Versioning (`PlanItem` with `effectiveFrom`) | F-07 | Sprint 2 | Fully Covered |
| **BR-12** | Estimated Duration & Calorie Calculation via METs (Historical `WeightLog` Lookup) | F-11 | Sprint 2 | Fully Covered (Approved Scope Change) |
| **NFR-01** | Performance ($p95 < 500\text{ ms}$ under 50 concurrency; login measured separately) | F-06, SYS-01 | Sprint 2, 3 | Fully Covered |
| **NFR-02** | Security & Access Control (HTTP 401 Unauthorized / HTTP 403 Forbidden), Endpoint Access Matrix grows each sprint | F-01, SYS-01 | Sprint 1, 2, 3 | Fully Covered |
| **NFR-03** | Usability & Validation Feedback (Clear UI Error Notices) | F-04, F-05, SYS-01 | Sprint 1, 2, 3 | Fully Covered |
| **NFR-04** | Data Persistence & Durability (Survives Application Restart and GCP Redeployment) | F-04, SYS-01 | Sprint 1, 3 | Fully Covered |

--------------------------------------------------------------------------------

#### 4. Cross-Sprint Feature Dependency Roadmap
```text
[Sprint 1: Core Foundation & Small Working Slice]
F-01 (User Authentication, JWT jti Denylist, Logout & Server-Side Authorization)
  ├──> F-02 (Activity Category & Base Exercise Management with 6 Tracking Modes)
  │      └──> F-03 (Initial Participant Goal Configuration & UserExercise Snapshot Architecture)
  │             └──> F-04 (Daily Activity Logging, Rest Day Logging & Ledger UX)
  │                    └──> F-06 (Real-Time Computed Progress Display)
  │
[Sprint 2: Core Expansion & History Analytics]
  ├──> F-05 (Same-Day Entry Modification & Deletion) [Depends on F-04]
  ├──> F-07 (Same-Day Goal Reconfiguration & Plan Versioning) [Depends on F-03, F-04, F-06]
  ├──> F-08 (Personal History & Streak Tracking) [Depends on F-03, F-04, F-06, F-07]
  └──> F-11 (METs Calorie Calculation via Historical WeightLog) [Depends on F-02, F-03, F-04, F-06]
  │
[Sprint 3: System Hardening & Product Finalization]
  ├──> F-09 (Schedule Representation & Persisted Reminder Settings) [Depends on F-03, F-07]
  ├──> F-10 (Monthly Progress Summary) [Depends on F-06, F-08, F-11]
  └──> SYS-01 (System Hardening & Final NFR Verification) [Verifies F-01 – F-11; NFR-01 to NFR-04]
```