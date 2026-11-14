### Software Requirements Specification (SRS)
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Document Version:**  1.1.0
**SRS Baseline Version:**  1.1.0
**Date:**  6 November 2026
**Status:**  Approved Baseline (Updated with Resolved Architecture, Design Decisions B1–B8, F-02 Error Codes, and ReminderSetting Schema Alignment)

--------------------------------------------------------------------------------

#### Document Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 3 Nov 2026 | Initial draft from CPE 334 group brief | Nakagamon (67070501064) & Onsinee (67070501078) | Draft |
| **0.5.0** | 3 Nov 2026 | Added 4-domain exercise structure and ratio-based formulas | Nakagamon (67070501064) & Onsinee (67070501078) | Review |
| **1.0.0** | 4 Nov 2026 | Finalized baseline v1.0.0. Incorporated Profile Body Weight management (GET/PUT `/api/profile`), METs schema (`metValue`, `cardioCategory`), Ledger logging mechanics (Quick Complete fills difference to target), Rest Day free-form logging (Quick Complete disabled with HTTP 400 `QUICK_COMPLETE_NOT_AVAILABLE`), seconds standardization, boundary max enforcement, authentication endpoints (`/login`, `/logout`, `/me`), invalid login HTTP 401/403 rules, template copy-on-select snapshots, F-11 split to Sprint 2, Section 6.3 Questions & Resolutions Log, and added error codes (`NOT_FOUND`, `CATEGORY_HAS_TEMPLATES`, `INTERNAL_ERROR`, `QUICK_COMPLETE_NOT_AVAILABLE`) to Appendix A.5 & FR-02 for F-02 contract readiness. Aligned `ReminderSetting` schema (`label`, `enabled`) with SDS, and clarified FR-03 Sprint 1 initial goal setting vs Sprint 2 goal reconfiguration (F-07). Applied Review Group A fixes and Design Decisions B1–B8. | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |
| **1.1.0** | 6 Nov 2026 | Sprint allocation synchronized with the Sprint 1 scope checkpoint (RTM 1.1.0, CHANGE-03 … CHANGE-08). No FR, BR or NFR changed. (1) NFR-01: the Sprint 1 latency check (AC-21a) moved to Sprint 2, so the target sprint is now "Sprint 2 (progress & ledger endpoints), Sprint 3 (all endpoints)". (2) Section 1 item 5 and FR-05 description: the Targeted-Days-Only monthly average (AC-15) is delivered in Sprint 2, not Sprint 1; Daily Activity Score and Daily Overall % stay in Sprint 1. (3) Section 6.3 Q30–Q49 added: the clarifications that the Sprint 1 contracts (F-02, F-03, F-04, F-06 §12) had listed as pending — naming and text limits, `unit` derivation, immutable `trackingMode`, `metValue` format, Valid Range meaning, plan resolution, `logDate` past/future, Quick Complete availability and per-entry limit, sets limits, body weight format, concurrency, read-only past dates, progress date validation, non-planned entries and decimal precision. They restate rules the contracts already specify; no previously approved rule is reversed. Review-fix pass (PR #13): NFR-03 target sprints now 1, 2, 3 (AC-23 third case belongs to F-05, Sprint 2). No requirement text changed. | Nakagamon (67070501064) | **Approved Baseline** |

--------------------------------------------------------------------------------

#### 1. Stakeholder Problem & Context Definition
##### 1.1 Problem Statement
Individuals seeking to start exercising or maintain discipline often face the challenge of lacking a simple, measurable progress-tracking system. Commercial applications on the market are frequently overly complex, lack expert-defined standard exercise posture definitions, or force users to disclose personal data. The absence of a structured tracking system prevents users from effectively monitoring their personal growth and progress.

##### 1.2 Chosen Context & Solution
The **Habit and Activity Tracking System** for the Exercise & Workout domain is designed to solve this problem by establishing clear role separation between **Program Manager** (exercise experts/system administrators), responsible for curating a standard exercise library, and **Participant** (general users), who select Templates to build monthly plans (daily targets), log daily workouts and Rest Days across 4 core activity categories (Weight Training, Bodyweight, Yoga, Cardio), calculate completion scores weighted by Priority Weight, estimate calories burned via METs, and view clear progress summaries on user screens.

--------------------------------------------------------------------------------

#### 2. Product Scope & Explicit Exclusions
##### 2.1 In-Scope
1.  **Seeded Credential Authentication & Role Authorization:** User login using Seeded Accounts via Email/Password (`POST /api/auth/login`) using JWT Token Lifecycle (1-hour token expiration, passed via `Authorization: Bearer <token>` header) alongside `jti` Unique Identifier and `RevokedToken` Denylist in PostgreSQL database to support user logout (`POST /api/auth/logout`) and current user data retrieval (`GET /api/auth/me`); with server-side authorization enforcing Program Manager and Participant roles, returning HTTP 401 (Unauthenticated / Expired Token / Revoked Token / Invalid Credentials) and HTTP 403 (Forbidden Role Access / Cross-User Data Access).
2.  **Activity Category & Base Exercise Management (Manager):** Creating, reading, updating, and deleting (CRUD) exercise categories and standard base exercises, specifying Target Body Part, measurement units, acceptable input boundaries (Valid Range), standard metabolic equivalent values (`metValue`), cardio sub-categories (`cardioCategory`), and tracking formats (`trackingMode`: `WEIGHT`, `BODYWEIGHT_REPS`, `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME`, `CARDIO_DISTANCE`); allowing Participants read-only access to Templates (`GET /api/templates`) while blocking Participant template creation, modification, or deletion requests with HTTP 403 Forbidden. Deleting a category containing templates returns HTTP 409 `CATEGORY_HAS_TEMPLATES`, and non-existent IDs return HTTP 404 `NOT_FOUND`.
3.  **Goal Setting & 4-Domain Exercise Configuration (Participant):** Initial monthly plan setting (daily targets recurring on weekly repeat days) by selecting exercises from Templates (via Copy-on-Select Snapshot mechanism into the `UserExercise` table) or creating Custom Exercises across 4 core domains according to `trackingMode`; enforcing target value $> 0$ and specifying Priority Weight ($1 - 5$), start date (`effectiveFrom`), weekly repeat schedule (Weekly Repeat Default: every day), and optional plan end date; `effectiveFrom` must be today or later. Delivered in Sprint 1 via F-03.
4.  **Daily Activity Logging, Profile Integration & Ledger UX Mechanism:** Daily activity logging (referenced to Current Local Date Asia/Bangkok or optional `logDate` input) via Ledger Entries storing `sets` and `totalReps` (or duration/distance) through Quick Complete (filling difference to exactly match target, or acting as a No-op returning HTTP 200 with `entry: null` if already completed) or Manual Override (creating incremental actual log entries); fetching current body weight from `WeightLog` and supporting profile management (`GET /api/profile`, `PUT /api/profile`), with support for Rest Day logging (Backend rejects Quick Complete on Rest Days or non-planned exercises with HTTP 400 Bad Request `QUICK_COMPLETE_NOT_AVAILABLE` and UI disables Quick Complete buttons).
5.  **Computed Progress Display & Calorie Estimation Display:** Automated progress calculation and display, including Daily Activity Score (Ratio formula across 4 domains and 6 tracking modes), Daily Overall Progress (%) in Sprint 1, and monthly average score computed strictly on targeted days (Targeted Days Only) in Sprint 2; and estimated calories burned display ($\text{Calories Burned in kcal}$) via METs formulas combined with body weight from `WeightLog` in Sprint 2 (F-11). A Monthly Progress Summary (F-10) is delivered in Sprint 3.
6.  **Business Rule Validation & Enforcement:** Rejection of invalid business data (e.g. backdated logging via `logDate` mismatching current date, negative values, target value of 0, or values exceeding Default Boundary Max: $\text{Max Sets}=20, \text{Max Reps/Set}=200, \text{Max Duration per Entry}=180\text{ minutes / }10,800\text{ seconds}, \text{Max Weight Load}=500\text{ kg}, \text{Max Distance}=100\text{ km}, \text{Body Weight}=1 - 800\text{ kg}$).
7.  **Goal Reconfiguration & Plan Versioning (Sprint 2):** Mid-month goal modification support via Plan Versioning schema (`PlanItem` with `effectiveFrom` field); adjusting goals on the current date generates a new Plan Snapshot version applied immediately to calculate current-day and future scores, without retroactively altering historical data. Delivered in Sprint 2 via F-07.
8.  **Same-Day Entry Modification & Deletion (Sprint 2):** Editing (Edit) and deleting (Delete) sub-activity ledger entries in the Participant's Ledger table restricted strictly to entries created on the current date.
9.  **Streak & History Tracking (Sprint 2):** Tracking consecutive active workout days based on Daily Overall Progress $\ge 70\%$ strictly on targeted days (Targeted Days); dynamically evaluated based on past completed days. If a targeted day achieves $< 70\%$ or has no logged activity, the Streak counter resets to $0$ immediately at midnight Asia/Bangkok time (Rest Days do not affect Streaks).
10. **Schedule Representation & Reminder Settings (Sprint 3):** Weekly/monthly exercise schedule view derived from the Participant's `PlanItem` records, plus per-participant `ReminderSetting` records (time of day, repeat days, label, enabled status) that are persisted in PostgreSQL and displayed in the UI only; no external delivery.
11. **User Profile & Body Weight Management:** User profile data management and updating current body weight via (`GET /api/profile`, `PUT /api/profile`), storing body weight history as Append-Only entries in `WeightLog` table for reference and METs calorie calculations.
12. **Monthly Progress Summary (Sprint 3):** Monthly summary report (F-10) built from existing progress, streak and calorie data.

##### 2.2 Explicit Exclusions
1.  **Medical Diagnosis & Treatment Advice:** The system does not cover medical diagnosis, injury assessment, or healthcare treatment advice.
2.  **Third-party Hardware / App Integration:** No integration with Smartwatches, Apple Health, Google Fit, or external devices/hardware.
3.  **Consent-Based Sharing / Trainer Dashboard:** No capabilities to share data with Managers or other users. Participant data is 100% private and isolated.
4.  **Self-Registration & Password Recovery:** No public self-registration or password recovery features in any sprint (uses Seeded Accounts only).
5.  **Social & Community Features:** No newsfeed, likes, comments, or competitive leaderboards between users.
6.  **External Notification Sending (Email / Push / SMS):** The system does not send actual external notifications; the system supports persisted Schedule and Reminder settings that are displayed in the UI only.

--------------------------------------------------------------------------------

#### 3. System Actors & Responsibilities
| Actor | Description & Core Responsibilities |
| ------ | ------ |
| **Program Manager** | Exercise Library Curator responsible for creating and managing exercise categories (Categories), defining base exercise templates (Base Exercises), specifying target body parts (Target Body Part), acceptable input ranges (Valid Ranges), standard metabolic values (`metValue`), cardio sub-categories (`cardioCategory`), and tracking modes (`trackingMode`). |
| **Participant** | End-user logging activity, responsible for viewing and updating body weight via Profile (`GET /api/profile`, `PUT /api/profile`), selecting Templates (via Copy-on-Select Snapshot into `UserExercise`) or creating Custom Exercises across 4 domains (Weight, Bodyweight, Yoga, Cardio), configuring a monthly plan of daily targets via `PlanItem`, specifying equipment weight ($\text{kg}$), setting repeat schedules, logging daily workouts and Rest Days as Ledger entries, adjusting mid-month plans, managing persisted reminder settings (time of day, repeat days, label, enabled status; display only), and checking personal Streak, calorie, and progress statistics. |

--------------------------------------------------------------------------------

#### 4. Functional Requirements (FR) & Business Rules (BR)
##### 4.1 Functional Requirements (FR)
*   **FR-01: User Authentication & Server-side Authorization**
    *   **Description:** The system must support identity authentication via Email and Password using Seeded Credentials (`POST /api/auth/login`), hashing passwords with `bcrypt`, and issuing JWT Tokens (1-hour expiration, passed via `Authorization: Bearer <token>` header) containing a unique `jti` (JWT ID). Supports current user data retrieval (`GET /api/auth/me`) and user logout (`POST /api/auth/logout`), where logout records `jti` and expiration time into the `RevokedToken` table in PostgreSQL to immediately revoke token validity. Requests with revoked or expired tokens receive HTTP 401 Unauthorized. Server-side authorization distinguishes Program Manager and Participant roles, returning HTTP 403 Forbidden for mismatched roles or cross-user data access requests.
*   **FR-02: Manage Activity Categories & Base Templates (Manager & Read-Only Participant)**
    *   **Description:** Managers can Create, Read, Update, and Delete (CRUD) exercise categories, define base exercise postures, specify Target Body Part, measurement units, acceptable input boundaries (Valid Range), standard MET values (`metValue`), cardio sub-categories (`cardioCategory`), and tracking mode (`trackingMode` across 6 values). Deleting an exercise category that still contains active base exercises/templates is blocked with HTTP 409 `CATEGORY_HAS_TEMPLATES`. Requesting, updating, or deleting a non-existent category or template ID returns HTTP 404 `NOT_FOUND`. Participants have read-only access to Templates (`GET /api/templates`), while Participant requests to create, edit, or delete templates are blocked with HTTP 403 Forbidden. Categories are Manager-managed grouping labels (seeded with the 4 core domains); scoring depends only on `trackingMode` (Q25). A template's Valid Range may not exceed the central boundaries of BR-02 (Q26).
*   **FR-03: Goal Setting, Custom Exercise & 4-Domain Specification (Participant)**
    *   **Description:** Participants can select Templates (using Copy-on-Select Snapshot copying data to `UserExercise` table) or create Custom Exercises across 4 core domains based on `trackingMode`, setting an initial monthly plan of daily targets in `PlanItem` (Q22); target fields per `trackingMode` are defined in Q21. Targets must be $>0$, with Priority Weight ($1-5$), start date (`effectiveFrom`), weekly repeat days, and optional plan end date. *(Note: Initial goal setting is delivered in Sprint 1 via F-03; mid-month goal reconfiguration & plan versioning rules are governed under BR-11 and delivered in Sprint 2 via F-07).*
*   **FR-04: Daily Activity Logging, Profile Integration, Ledger UX & Rest Day Logging (Participant)**
    *   **Description:** Participants can log daily workouts in Ledger Entries (storing `sets` and `totalReps` or duration/distance) via Quick Complete (filling difference to reach target, or acting as No-op returning HTTP 200 with `entry: null` if completed) or Manual Override (adding incremental actual logged values). Retrieves current body weight from `WeightLog` via profile endpoints (`GET /api/profile`, `PUT /api/profile`) and supports Rest Day logging. Quick Complete on Rest Days or non-planned exercises is rejected by Backend with HTTP 400 Bad Request (`QUICK_COMPLETE_NOT_AVAILABLE`) and UI disables Quick Complete buttons.
*   **FR-05: Real-time Computed Progress Display & Calorie Estimation Display**
    *   **Description:** The system must compute and display real-time daily progress: Daily Activity Score (the Item Score of each planned exercise, Q23), Daily Overall Progress (%) in Sprint 1, and Targeted-Days-Only monthly average score in Sprint 2; estimated calories burned ($\text{Calories Burned in kcal}$) via METs formula and `WeightLog` body weight in Sprint 2 (F-11); and a Monthly Progress Summary (targeted/Rest Day counts, days reaching $\ge 70\%$, monthly average, current Streak, total kcal, per-exercise totals) in Sprint 3 (F-10).
*   **FR-06: Personal History & Dynamic Streak Tracking**
    *   **Description:** Participants can review historical activity log records and track consecutive active days (Streak) based on achieving Daily Overall Progress $\ge 70\%$ on targeted days. If a targeted day achieves $< 70\%$ or has no logged activity, Streak resets to $0$ at midnight Asia/Bangkok time (Rest Days do not affect Streaks). See BR-10 and Q19 for the exact Streak definition.
*   **FR-07: Schedule Representation & Reminder Settings (Sprint 3)**
    *   **Description:** The system must support displaying weekly/monthly exercise schedules derived from the Participant's `PlanItem` records, and creating, updating and deleting persisted `ReminderSetting` records (time of day, repeat days, label, enabled status) that are displayed in the UI only (without sending actual external email/push/SMS notifications).
*   **FR-08: User Profile & Body Weight Management**
    *   **Description:** The system must provide `GET /api/profile` and `PUT /api/profile` for Participants to view and update current body weight ($1-800\text{ kg}$), recording append-only history in `WeightLog` to reference and calculate METs calories (F-11).

##### 4.2 Business Rules (BR)
*   **BR-01: Strictly No Backdating Policy (Asia/Bangkok Timezone, Optional logDate Input Validation)**
    Activity logging defaults to current date on server (Timezone Asia/Bangkok). If Client provides optional `logDate` field and it does not match current server date, Backend rejects request with HTTP 400 Bad Request.
*   **BR-02: Valid Range & Boundary Enforcement**
    System enforces mandatory input boundary limits, applied to each target, each ledger entry, and the cumulative daily total per exercise (Q20): $\text{Target}>0$, $\text{Max Sets}=20$, $\text{Max Reps/Set}=200$ (enforced as $\text{totalReps} \le \text{sets} \times 200$), $\text{Max Duration}=180\text{ minutes / }10,800\text{ seconds}$, $\text{Max Weight Load}=500\text{ kg}$, $\text{Max Distance}=100\text{ km}$, $\text{Body Weight}=1 - 800\text{ kg}$. Any input exceeding these boundaries is rejected with HTTP 400 `VALIDATION_ERROR` and a message naming the field and its limit. A template's Valid Range may not exceed these limits (Q26).
*   **BR-03: Ratio-Based Score Formulas (6 Tracking Modes) & Daily Overall %**
    Scoring formulas across 4 domains and 6 tracking modes:
    1. **Weight Training Domain (`WEIGHT`):**
       $$\text{Reps Ratio} = \min\left(1.0, \frac{\text{Actual Total Reps}}{\text{Target Total Reps}}\right)$$
       $$\text{Item Score} = \text{Reps Ratio} \times \text{Priority Weight}$$
    2. **Bodyweight Domain (`BODYWEIGHT_REPS` & `BODYWEIGHT_TIME`):**
       - Reps-based (`BODYWEIGHT_REPS`):
         $$\text{Reps Ratio} = \min\left(1.0, \frac{\text{Actual Total Reps}}{\text{Target Total Reps}}\right)$$
         $$\text{Item Score} = \text{Reps Ratio} \times \text{Priority Weight}$$
       - Time-based (`BODYWEIGHT_TIME`):
         $$\text{Time Ratio} = \min\left(1.0, \frac{\text{Actual Duration (sec)}}{\text{Target Duration (sec)}}\right)$$
         $$\text{Item Score} = \text{Time Ratio} \times \text{Priority Weight}$$
    3. **Yoga Domain (`YOGA`):**
       $$\text{Time Ratio} = \min\left(1.0, \frac{\text{Actual Duration (sec)}}{\text{Target Duration (sec)}}\right)$$
       $$\text{Item Score} = \text{Time Ratio} \times \text{Priority Weight}$$
    4. **Cardio Domain (`CARDIO_TIME` & `CARDIO_DISTANCE`):**
       - Time-based (`CARDIO_TIME`):
         $$\text{Time Ratio} = \min\left(1.0, \frac{\text{Actual Duration (sec)}}{\text{Target Duration (sec)}}\right)$$
         $$\text{Item Score} = \text{Time Ratio} \times \text{Priority Weight}$$
       - Distance-based (`CARDIO_DISTANCE`):
         $$\text{Distance Ratio} = \min\left(1.0, \frac{\text{Actual Distance (km)}}{\text{Target Distance (km)}}\right)$$
         $$\text{Item Score} = \text{Distance Ratio} \times \text{Priority Weight}$$
    
    *Summary Daily Overall Progress Score (%):*
    $$\text{Daily Overall Progress (\%)} = \left(\frac{\sum \text{Item Score}_i}{\sum \text{Priority Weight}_i}\right) \times 100\%$$

    *Daily Activity Score* = the Item Score of each planned exercise (Q23). Daily Overall Progress is `null` (not 0%) on a Rest Day (a day with no planned item, Q24); on a targeted day without any log it is 0%. Body weight and weight load never affect scores (Decision 11).

*   **BR-04: 100% Data Privacy & Access Isolation Policy**
    Participant data is 100% private. Cross-user access or Manager access to Participant logs is blocked with HTTP 403 Forbidden.
*   **BR-05: Ledger Accumulation, Quick Complete Mechanics ($\sum \text{Actual} = \text{Target}$) & No-op Handling**
    Activity logging allows multiple incremental ledger entries per day. Quick Complete creates a differential ledger entry $\text{Entry Value} = \max(0, \text{Target} - \sum \text{Logged})$ so that cumulative sum matches target. If already completed ($\sum \text{Logged} \ge \text{Target}$), Quick Complete executes as a No-op returning HTTP 200 OK with `entry: null`. Quick Complete requested on a Rest Day returns HTTP 400 Bad Request (`QUICK_COMPLETE_NOT_AVAILABLE`).
*   **BR-06: Direct Completed Value Counting Logic**
    Score calculation uses direct cumulative completed values without double counting or penalty reductions.
*   **BR-07: Targeted-Days-Only Monthly Progress Calculation (Rest days excluded)**
    Monthly average progress score includes only targeted days (Targeted Days Only). Rest Days and non-planned days are excluded from monthly average denominators. The average is taken over targeted days from the start of the month (or the first `effectiveFrom`, if later) up to and including today; future days are excluded and a targeted day without any log counts as 0% (Appendix A.3).
*   **BR-08: Custom Exercise Defaults Boundaries**
    Custom exercises created by Participants enforce standard boundary defaults and default MET values.
*   **BR-09: Daily Entry Modification Limits (Current Date Only - Sprint 2)**
    Editing and deleting ledger entries is restricted strictly to entries created on the current server date. Attempts to edit or delete an entry from an earlier date are rejected with HTTP 409 `ENTRY_NOT_EDITABLE` (Q28).
*   **BR-10: Streak Eligibility Threshold ($\ge 70\%$) & Strict Midnight Reset Rule**
    Streak = the number of consecutive closed targeted days (days already past midnight Asia/Bangkok) whose Daily Overall Progress is $\ge 70\%$ (compared unrounded), skipping Rest Days. The current day is pending: it never resets the Streak, and it is added to the count as soon as it reaches $\ge 70\%$. A closed targeted day with $< 70\%$ or without any logged activity resets the Streak to 0. Rest Days do not reset Streak (Q19).
*   **BR-11: Same-Day Goal Reconfiguration & Plan Versioning (`PlanItem` with `effectiveFrom`)**
    Goal changes apply Plan Versioning schema with `effectiveFrom`, recalculating current-day and future scores immediately without retroactively altering historical scores.
*   **BR-12: Estimated Duration & Calorie Calculation via METs (Historical `WeightLog` Lookup)**
    Calorie calculation formula:
    $$\text{Calories Burned (kcal)} = \text{metValue} \times \text{Body Weight (kg)} \times \left(\frac{\text{Estimated Minutes}}{60}\right)$$
    Retrieves latest body weight from `WeightLog` with `effectiveDate <= logDate`. If no weight log exists, the response is HTTP 200 with `calories: null` and `calorieError: "BODY_WEIGHT_REQUIRED"`; logging is not blocked (Q27). Calories are rounded to 1 decimal place, half up (Appendix A.4).
    
    *Estimated Minutes calculation for non-duration exercises:*
    - Weight Training & Bodyweight Reps-based:
      $$\text{Estimated Minutes} = \text{Actual Sets} \times 1.5\text{ minutes}$$
    - Cardio Distance-based (if duration omitted):
      $$\text{Estimated Minutes} = \text{Actual Distance (km)} \times \text{Standard Pace (min/km)}$$
      *(Standard Pace: Running $=6.0$, Walking $=10.0$, Cycling $=3.0$, Swimming $=20.0\text{ min/km}$)*

--------------------------------------------------------------------------------

#### 5. Non-Functional Requirements (NFR)
| ID | Category | Target Metric / Observable Criterion | Practical Verification Method | Allocated Sprint |
| ------ | ------ | ------ | ------ | ------ |
| **NFR-01** | **Performance** | All protected API endpoints must respond with Response Time $p95 < 500\text{ ms}$ under normal test conditions (≥ 500 requests per endpoint, concurrency of 50, documented Seed Dataset size). `POST /api/auth/login` (bcrypt) is measured separately with $p95 < 1,000\text{ ms}$. | Measure latency via Benchmark Test Runner (Supertest / Vitest) and report p95 per endpoint. | Sprint 2 (progress & ledger endpoints), Sprint 3 (all endpoints) |
| **NFR-02** | **Security & Access Control** | Requests without JWT Token, expired Token, or revoked Token must return HTTP Status 401 Unauthorized. Mismatched Role or cross-user access requests must return HTTP Status 403 Forbidden. | API Integration Test (Supertest) verifying Response Codes and Body, using an Endpoint Access Matrix that grows each sprint. | Sprint 1, 2, 3 |
| **NFR-03** | **Usability & Validation Feedback** | UI screen must display clear Error Notice Messages when system rejects data per Business Rules. | UI End-to-End Test via Playwright checking DOM Error Elements. | Sprint 1, 2, 3 |
| **NFR-04** | **Data Persistence & Durability** | User data, goals, and activity history must persist in PostgreSQL via Prisma ORM across Server restart/redeploy events (including GCP redeployment). | Integration Test querying data after simulated Server Restart; post-deployment check after redeployment. | Sprint 1, 3 |

--------------------------------------------------------------------------------

#### 6. Significant Assumptions, Resolved Design Decisions & Questions Log
##### 6.1 Key Assumptions
1.  **Timezone Uniformity:** Checked current date using Asia/Bangkok server timezone as single standard.
2.  **Standard Units:** Kilograms ($\text{kg}$) for weight, kilometers ($\text{km}$) for distance, seconds ($\text{seconds}$) in DB for time (converted to minutes for METs).
3.  **Data Persistence:** PostgreSQL with Prisma ORM guarantees permanent storage surviving server restarts.
4.  **Controllable Clock for Testing:** The server reads the current date/time through an injectable clock (default Asia/Bangkok), and the seed script can insert dated historical rows, so that date-dependent rules (BR-09, BR-10, BR-11) can be tested despite the no-backdating policy (Q29).

##### 6.2 Resolved Design Decisions
*   **Decision 1 (Seeded Accounts with Real JWT Auth):** Backend seeded credentials with JWT, bcrypt, `/login`, `/me`, `/logout` endpoints.
*   **Decision 2 (Ledger Accumulation & Quick Complete Mechanics):** Incremental ledger entries; Quick Complete fills difference to target ($\sum \text{Actual} = \text{Target}$).
*   **Decision 3 (100% Data Privacy):** Participant data isolated, blocking cross-user and Manager access with HTTP 403.
*   **Decision 4 (Rest Day Logging Supported):** Rest Day logging allowed; Quick Complete disabled with HTTP 400 `QUICK_COMPLETE_NOT_AVAILABLE`; excluded from monthly average (BR-07) and Streak reset (BR-10).
*   **Decision 5 (Ratio-Based Scoring Across 4 Domains):** Score calculated based on Reps, Duration, or Distance ratios.
*   **Decision 6 (Targeted-Days Monthly Average):** Monthly average includes targeted days only.
*   **Decision 7 (Custom Exercise Boundaries):** Enforced boundary max ($\text{Target}>0, \text{Max Sets}=20, \text{Max Reps/Set}=200, \text{Max Duration}=180\text{ mins}, \text{Max Weight}=500\text{ kg}, \text{Max Distance}=100\text{ km}, \text{Body Weight}=1-800\text{ kg}$).
*   **Decision 8 (F-11 Calorie Calculation via METs Split to Sprint 2):** Calorie display moved to Sprint 2 as F-11.
*   **Decision 9 (Strict Streak Reset Rule):** Failing targeted goal resets Streak to 0 at midnight Asia/Bangkok time.
*   **Decision 10 (Plan Versioning for Mid-Month Goal Change):** Mid-month goal changes use Plan Versioning (F-07, Sprint 2).
*   **Decision 11 (Body Weight & Weight Load Isolation from Score):** Body weight and equipment load do not affect Daily Score calculation.
*   **Decision 12 (Template Copy-on-Select Snapshot):** Participants read templates; selecting copies snapshot to `UserExercise` (AC-27).

##### 6.3 Questions & Resolutions Log
1.  **Profile / Body Weight Management:** Added `GET /api/profile` and `PUT /api/profile` for body weight updates ($1-800\text{ kg}$) stored in `WeightLog` (FR-08).
2.  **Quick Complete Mechanics:** Fills difference $\text{Entry Value} = \max(0, \text{Target} - \sum \text{Logged})$.
3.  **Log Input Data Model for METs & Reps Storage:** Stores both `sets` and `totalReps` for exact difference tracking and METs calculation.
4.  **METs Value & Pace Sources:** Templates store `metValue` and `cardioCategory` for pace mapping; custom exercises use domain default METs (values in Appendix A.1).
5.  **Duration Unit Standardization:** Stored in DB as **seconds ($\text{seconds}$)**, converted to minutes for scoring and METs.
6.  **Boundary Max Scope:** Enforces max boundaries on inputs and daily cumulative totals ($\text{Max Duration per Entry}=180\text{ mins}$).
7.  **Rest Day Logging & UX:** Free-form logging allowed on Rest Days; Quick Complete button disabled on UI and rejected on Backend with HTTP 400 `QUICK_COMPLETE_NOT_AVAILABLE`; excluded from monthly average (BR-07) and Streak (BR-10).
8.  **Streak Evaluation Trigger:** Evaluates dynamically on API requests; the current day is "pending" and a day is evaluated as closed only after midnight Asia/Bangkok time (see Q19).
9.  **Authentication & Session Mechanics:** Endpoints `POST /login`, `POST /logout`, `GET /me`. Invalid credentials or expired token returns 401; wrong role returns 403.
10. **Template Mutation Handling:** Copy-on-Select snapshot isolates `UserExercise` from template edits or deletions (AC-27).
11. **Template Tracking Mode Enum (Design Decision B1):** Defines Enum `trackingMode` across 6 values mapping to scoring formulas 1a, 1b, 1c.
12. **Quick Complete Mechanics, Reps/Sets & No-op Handling (Design Decision B2):** Differential entry sets `sets = max(1, targetSets - sum(loggedSets))` with all difference reps in `totalReps`. If $\sum \text{Logged} \ge \text{Target}$, Quick Complete acts as No-op returning 200 OK with `entry: null`.
13. **Custom Exercise METs & Cardio Category Selection (Design Decision B3):** Default METs assigned by `trackingMode`; forces `cardioCategory` selection when `trackingMode = CARDIO_DISTANCE`.
14. **Auth Token Lifecycle & Revocation Denylist (Design Decision B4):** 1-hour JWT token with `RevokedToken(jti, expiresAt)` denylist table in PostgreSQL. Logout records `jti`, rejecting subsequent requests with HTTP 401 Unauthorized.
15. **Rest Day Definition & Backend Enforcement (Design Decision B5):** Rest Day is a day without `PlanItem`. Quick Complete on Rest Day returns HTTP 400 Bad Request `QUICK_COMPLETE_NOT_AVAILABLE`.
16. **Body Weight Lookup for METs via Historical WeightLog (Design Decision B6):** Uses latest `WeightLog` where `effectiveDate <= logDate`. If no log exists, returns `null` calories with error `BODY_WEIGHT_REQUIRED` (AC-28a–c).
17. **Explicit logDate Input Field and Server Timezone Validation (Design Decision B7):** Accepts optional `logDate`. Mismatch with Asia/Bangkok server current date returns HTTP 400 Bad Request `LOG_DATE_MISMATCH`.
18. **Snapshot Architecture & Plan Versioning Schema (Design Decision B8):** Two core tables: (1) `UserExercise` (exercise snapshot without hard FK), (2) `PlanItem` (daily goals with `effectiveFrom` plan versioning).
19. **Streak Definition (Resolved):** Streak = number of consecutive closed targeted days (days already past midnight Asia/Bangkok) with Daily Overall Progress $\ge 70\%$, compared unrounded ($\ge 0.70$), skipping Rest Days. The current day is "pending": it never resets the Streak, and it counts as soon as it reaches $\ge 70\%$ (and stops counting if a same-day edit lowers it below 70%). A closed targeted day with $< 70\%$ or no log sets the Streak to 0.
20. **Boundary Scope (Resolved):** Boundaries apply to each target, each ledger entry, and the cumulative daily total per exercise. Because reps per set are not stored (B2), "Max Reps/Set = 200" is enforced as $\text{totalReps} \le \text{sets} \times 200$.
21. **PlanItem Target Fields (Resolved):** `WEIGHT` and `BODYWEIGHT_REPS`: `targetSets` (1–20) × `targetRepsPerSet` (1–200) = Target Total Reps; `WEIGHT` also stores `loadKg` ($>0$, $\le 500$; not scored). `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME`: `targetDurationSec` (1–10,800). `CARDIO_DISTANCE`: `targetDistanceKm` ($>0$, $\le 100$). `effectiveFrom` must be today or later; `endDate`, if given, must not precede `effectiveFrom`.
22. **"Monthly Goal" Terminology (Resolved):** There is no separate monthly-goal entity. A "monthly plan" is the set of `PlanItem` occurrences effective in that month; scoring uses daily targets only.
23. **Daily Activity Score (Resolved):** Daily Activity Score = the Item Score (ratio × Priority Weight) of each planned exercise for the day; Daily Overall Progress (%) follows BR-03.
24. **Rest Day Semantics (Resolved):** A Rest Day is a day on which no `PlanItem` occurs (per repeat days, `effectiveFrom` and end date). Free-form manual logging is allowed on a Rest Day but is not scored, is excluded from the monthly average and Streak, and Daily Overall Progress for that day is `null`.
25. **Category vs. 4 Domains (Resolved):** Categories are Manager-managed grouping labels (seeded with the 4 domains). Scoring and METs depend only on `trackingMode`; the domain is derived from `trackingMode`.
26. **Template Valid Range vs. Central Boundaries (Resolved):** A Manager-defined Valid Range may be stricter than, but not exceed, the BR-02 limits (otherwise HTTP 400). When logging, the stricter limit applies.
27. **`BODY_WEIGHT_REQUIRED` Response (Resolved):** HTTP 200 with `calories: null` and `calorieError: "BODY_WEIGHT_REQUIRED"`; logging is never blocked (AC-28b). The seed data includes one Participant without any `WeightLog` for testing.
28. **Non-Editable Entry Response (Resolved):** Editing or deleting an entry from an earlier date returns HTTP 409 `ENTRY_NOT_EDITABLE` (not 403, to keep it distinct from authorization failures).
29. **Time Control for Testing (Resolved):** Date-dependent logic reads time through an injectable clock (Asia/Bangkok); the seed script can create historical rows. Tests for BR-09, BR-10, BR-11 and midnight boundaries use this clock (Assumption 4).
30. **Category and Template Naming (Resolved):** A category name is trimmed, 1–50 characters and unique case-insensitively. A template name is trimmed, 1–80 characters and unique case-insensitively within its category. `targetBodyPart` is trimmed free text of 1–50 characters. A violation returns HTTP 400 `VALIDATION_ERROR` naming the field (Appendix A.5 defines no duplicate-name code).
31. **Template `unit` Derivation (Resolved):** `unit` is derived from `trackingMode`: `WEIGHT` and `BODYWEIGHT_REPS` → `reps`; `BODYWEIGHT_TIME`, `YOGA` and `CARDIO_TIME` → `seconds`; `CARDIO_DISTANCE` → `km`. A supplied `unit` must match, otherwise HTTP 400.
32. **`trackingMode` Immutable (Resolved):** `trackingMode` cannot be changed after a template is created (HTTP 400 `VALIDATION_ERROR` naming `trackingMode`); the Manager creates a new template instead.
33. **`metValue` Format (Resolved):** `metValue` is a number greater than 0 and at most 25, with at most 1 decimal place.
34. **Valid Range Meaning (Resolved, clarifies Q26):** `rangeMin` and `rangeMax` (in the template's unit) satisfy `rangeMin ≤ rangeMax`, `rangeMin` ≥ 1 (reps, seconds) or ≥ 0.01 (km) and `rangeMax` ≤ the central limit (4,000 reps, 10,800 seconds, 100 km). When omitted, `rangeMin` is the minimum value and `rangeMax` the central limit. The range bounds the **target** of a plan item, and `rangeMax` also caps a single entry and the daily cumulative value.
35. **Selecting the Same Template Twice (Resolved):** A Participant may select the same template more than once; each selection creates an independent `UserExercise` snapshot and `PlanItem` (no uniqueness constraint).
36. **Custom Exercise Fields (Resolved, clarifies Q13):** A custom exercise has a trimmed name of 1–80 characters and a trimmed `targetBodyPart` of 1–50 characters. The Participant cannot supply `metValue`, `unit`, `rangeMin` or `rangeMax`; they are assigned from Appendix A.1 and the central limits, and unknown fields are rejected with HTTP 400.
37. **Target Number Formats (Resolved, clarifies Q21):** `loadKg` is required for `WEIGHT` targets (> 0, ≤ 500, up to 2 decimals); `targetDistanceKm` has up to 2 decimals; `targetDurationSec`, `targetSets` and `targetRepsPerSet` are integers. A target field that does not belong to the `trackingMode`, or a missing required one, is rejected with HTTP 400 naming the field.
38. **`priorityWeight` Required (Resolved):** `priorityWeight` (integer 1–5) must be supplied for every plan item; there is no default.
39. **Plan Resolution Rule (Resolved):** For a user and a date D, each plan key resolves to the version with the greatest `effectiveFrom` ≤ D (tie: highest `version`). That item occurs on D if (`endDate` is empty or D ≤ `endDate`) and the weekday of D is in `repeatDays`. D is a Rest Day (Q24) when no item occurs.
40. **`logDate` Past and Future (Resolved, clarifies Q17):** A `logDate` that is either earlier or later than the current Asia/Bangkok date returns HTTP 400 `LOG_DATE_MISMATCH`; a malformed date returns HTTP 400 `VALIDATION_ERROR`.
41. **Quick Complete Availability (Resolved, clarifies Q15):** Quick Complete is available only when the exercise occurs today according to the plan resolution rule (Q39). Otherwise it returns HTTP 400 `QUICK_COMPLETE_NOT_AVAILABLE`. The `logDate` check runs before this check.
42. **Quick Complete and the Per-Entry Limit (Resolved, clarifies Q20):** A Quick Complete entry must itself satisfy `totalReps ≤ sets × 200`; when Design Decision B2's `sets` formula would violate it, `sets` is raised to `ceil(remainingReps ÷ 200)`. When no entry can satisfy the per-entry and cumulative limits together, Quick Complete returns HTTP 400 `VALIDATION_ERROR` naming `sets` and stores nothing.
43. **Sets Limits (Resolved, clarifies Q20):** Each entry has `sets` of 1–20, and the cumulative `sets` per exercise per day is at most 20.
44. **Body Weight Format and Current Weight (Resolved, clarifies Q1 and Q16):** `weightKg` is a number from 1 to 800 with at most 1 decimal place. Each `PUT /api/profile` appends a `WeightLog` row (`effectiveDate` = today), including several on the same day. The current weight is the row with the latest `effectiveDate`, then the latest `createdAt`; a Participant with no row has `currentWeightKg: null`.
45. **Concurrent Entries (Resolved):** Entries and Quick Complete for one exercise and one day are serialized (a row lock on the `UserExercise` inside the transaction), so concurrent requests cannot exceed the target or the limits.
46. **Reading Past Entries (Resolved, clarifies Q17 and Q28):** `GET /api/entries` and the progress endpoints may read past dates (read-only); creating, editing and deleting entries are restricted to today (BR-01, BR-09).
47. **Progress Date Validation (Resolved):** `GET /api/progress/daily` rejects a future date, and `GET /api/progress/monthly` rejects a month after the current month, with HTTP 400 `VALIDATION_ERROR`; past dates and months are allowed.
48. **Non-Planned Exercises in Scores (Resolved, clarifies Q24 and Appendix A.3):** Entries of an exercise that is not planned on a date are ignored in that date's scores. The monthly average starts at the later of the first day of the month and the user's first `effectiveFrom` of any plan item.
49. **Precision of Percentages (Resolved, clarifies Appendix A.4):** Percentages are calculated with decimal arithmetic (not binary floating point) and returned unrounded by the API; only displays round half up to 1 decimal place.

--------------------------------------------------------------------------------

#### Appendix A. Reference Values & Conventions
##### A.1 Default METs (used by custom exercises and as template seed values)
| `trackingMode` / `cardioCategory` | Default `metValue` | Standard Pace (min/km) |
| ------ | ------ | ------ |
| `WEIGHT` | 3.5 | - |
| `BODYWEIGHT_REPS`, `BODYWEIGHT_TIME` | 3.8 | - |
| `YOGA` | 2.5 | - |
| `CARDIO_TIME` | 7.0 | - |
| `CARDIO_DISTANCE` / Running | 9.8 | 6.0 |
| `CARDIO_DISTANCE` / Walking | 4.3 | 10.0 |
| `CARDIO_DISTANCE` / Cycling | 8.0 | 3.0 |
| `CARDIO_DISTANCE` / Swimming | 5.8 | 20.0 |

##### A.2 Plan Defaults
Weekly Repeat Default = every day (Monday–Sunday) when not specified. `effectiveFrom` = today or later (Asia/Bangkok). `endDate` is optional.

##### A.3 Monthly Average Definition
Mean of Daily Overall Progress (%) over targeted days from the start of the month (or the first `effectiveFrom`, if later) up to and including today. Future days are excluded; a targeted day without any log counts as 0%; Rest Days are excluded.

##### A.4 Rounding and Comparison
Calories are rounded to 1 decimal place (half up); percentages are displayed to 1 decimal place. Threshold comparisons (e.g. $\ge 70\%$) use unrounded values.

##### A.5 Error Response Envelope and Codes
All 4xx and 5xx error responses use the standard JSON error envelope:
`{ "code": string, "message": string, "fields": [{ "field": string, "limit": string }] }`.

| Code | HTTP | Meaning |
| ------ | ------ | ------ |
| `INVALID_CREDENTIALS` | 401 | Unknown email or wrong password (identical message for both) |
| `UNAUTHENTICATED` | 401 | Missing, malformed, forged, expired or revoked token |
| `FORBIDDEN` | 403 | Wrong role or cross-user/Manager access to private data |
| `NOT_FOUND` | 404 | Requested resource (category, template, entry, plan, user) does not exist |
| `VALIDATION_ERROR` | 400 | Boundary, format or payload violation (names the field and its limit) |
| `LOG_DATE_MISMATCH` | 400 | `logDate` differs from the current Asia/Bangkok date |
| `QUICK_COMPLETE_NOT_AVAILABLE` | 400 | Quick Complete on a Rest Day or non-planned exercise |
| `CATEGORY_HAS_TEMPLATES` | 409 | Cannot delete category because attached exercise templates still exist |
| `ENTRY_NOT_EDITABLE` | 409 | Edit/delete of an entry from an earlier date |
| `BODY_WEIGHT_REQUIRED` | 200 | Returned as `calorieError` with `calories: null` (logging is not blocked) |
| `INTERNAL_ERROR` | 500 | Unexpected server-side execution or database failure (no raw stack trace exposed) |

##### A.6 Seed Data Requirements
At least 1 Program Manager and 2 Participants (one without any `WeightLog`); 4 seeded categories; base exercises covering all 6 `trackingMode` values; seed script able to insert dated historical rows; passwords stored only as bcrypt hashes and supplied through the private course handoff.