### UI Specification (Sprint 1, hybrid scope)

**Project Title:** Habit and Activity Tracking System (FitBunny)
**Course:** CPE 334 Software Engineering
**Document Version:** 0.3.0
**SRS Baseline Version:** 1.1.0 (Feature Inventory 1.1.0, RTM 1.1.0, System-Level SDS 1.1.0)
**Date:** 6 November 2026
**Status:** Draft: specification-only, awaiting reviewer approval before implementation
**Primary Author:** Onsinee | **Reviewer:** Nakagamon
**Repository Path:** `docs/sprints/sprint-1/ui-spec.md`
**Scope:** Sprint 1 screens for F-01, F-02, F-03 and the Sprint 1 subset of F-04/F-06, with a hybrid UI scope agreed on 6 November 2026. Profile (S-07) and the monthly progress screen (S-06) are Sprint 2 (CHANGE-04/06).

**Source baselines**

| Document | Version | Role |
| --- | --- | --- |
| SRS | 1.1.0 | Functional and business requirements, error envelope A.5 |
| Feature Inventory | 1.1.0 | Feature scope and dependencies |
| System-Level SDS | 1.1.0 | Stack, data model, UI conventions, routes and roles |
| RTM | 1.1.0 | 28 AC groups / 80 atomic AC and target test paths |
| API Specification | 0.3.0 | Reconciled HTTP contract used by this UI |

**Document Revision History**

| Version | Date | Description of Changes | Author(s) | Status |
| --- | --- | --- | --- | --- |
| **0.3.0** | 6 Nov 2026 | Initial committed draft. Reconciled from the user-supplied v0.2.0 against baseline 1.1.0 and Sprint 1 contracts 0.3.0. Monthly progress (S-06) and Profile (S-07) marked Sprint 2 (CHANGE-06/04); Sprint 1 navigation excludes both routes. | Onsinee | Draft |

**Source-of-truth decision (6 Nov 2026):** the approved baseline and Sprint 1 contracts take precedence over UI Specification v0.2.0. The UI may not depend on removed endpoints or fields.

**Hybrid UI scope (6 Nov 2026):**

- S-00 Welcome is a should-have and is not a gate for Sprint 1.
- The daily progress panel stays on Today; the monthly progress screen (S-06) is Sprint 2 with AC-15 (CHANGE-06).
- Manager templates and categories are combined into one Manager Library screen with two tabs.
- Final artwork, colours and image assets are supplied by the user later; the tokens below are provisional.

**Reconciled changes from the v0.2.0 user draft**

| Area | v0.2.0 | Reconciled decision |
| --- | --- | --- |
| Routes | `/manager/templates`, `/manager/categories` | `/manager/library` with Templates and Categories tabs |
| Welcome | Required S-00 | Optional S-00; ship without mascot if the asset is not available |
| Exercise selection | X1/X2 endpoints | `GET /api/user-exercises` for existing snapshots; template and custom exercises are created by `POST /api/plan-items` |
| Today | `quickCompleteAvailable` and `offPlanEntries` from D1 | Derive availability from `isRestDay` and `ratio`; read off-plan entries from `GET /api/entries` |
| Log entry | Weight (kg) input stored as `loadKg` | No `loadKg` field in `LedgerEntry`; do not show the load input in Sprint 1 |
| Progress daily | `item`, `overall`, `offPlanEntries` | `items`, `totalScore`, `totalWeight`, `overallPercent` |
| Progress monthly | `averageOverallPct`, `days[].status` | `averagePercent`, `days[].isRestDay`; derive TARGETED / REST / FUTURE in the UI; Sprint 2 (CHANGE-06) |
| Monthly progress sprint | Sprint 1 screen | Sprint 2 (CHANGE-06); S-06 hidden in Sprint 1 |
| Profile | `bodyWeightKg`, `effectiveDate` | `currentWeightKg`, `weightEffectiveDate`; send `weightKg`; Sprint 2 (CHANGE-04) |
| Profile sprint | Sprint 1 route | Sprint 2 (CHANGE-04); S-07 hidden in Sprint 1 |
| Template MET | 1–20 | Greater than 0 and at most 25, one decimal place |
| Cardio category | Visible for cardio modes | Visible and required only for `CARDIO_DISTANCE`; forbidden otherwise |
| Template range | Reps per set | Bounds the plan target; total reps for reps modes |
| Baseline counts | RTM 1.0.0 / 75 AC | RTM 1.1.0 / 80 atomic AC |

--------------------------------------------------------------------------------

#### 1. Purpose and assumptions

- The UI is a mobile-first responsive single-page app built with React and TypeScript. It is served by the API container and talks only to the `/api` endpoints in the API Specification.
- The UI is never an authority. Hiding a button or route does not protect data; the backend enforces role and ownership rules.
- All displayed scores, percentages, dates, calories and cumulative values come from API responses. The UI does not recompute them.
- The UI may derive presentation state only: for example, whether a month day is TARGETED, REST or FUTURE from `isRestDay` and the current date.
- Routes and paths in this document are layout-neutral. The final SPA root (`web/` or `client/`) is decided after issue #1 merges.

#### 2. Roles, routes and navigation

| Route | Screen | Role | Sprint | API calls | AC |
| --- | --- | --- | --- | --- | --- |
| `/` | S-00 Welcome | Public | S1 should-have | Reads session only | None |
| `/login` | S-01 Login | Public | S1 | A1 | AC-01a, AC-01b, AC-22a |
| `/today` | S-02 Today | Participant | S1 | D1, E1, E2, E3, `GET /api/user-exercises` | AC-04a-b, AC-06, AC-10a-b, AC-13 |
| modal | S-03 Log Entry | Participant | S1 | E1 | AC-04a, AC-10a-b, AC-11 |
| `/plan` | S-05 My Plan | Participant | S1 | G2 | AC-03a, AC-03c |
| `/plan/new` | S-04 Add to Plan | Participant | S1 | T1, G1 | AC-03a-c, AC-11 |
| `/progress` | S-06 Monthly Progress | Participant | S2 (AC-15, CHANGE-06) | D1, M1 | AC-15 |
| `/profile` | S-07 Profile | Participant | S2 (AC-17, CHANGE-04) | P1, P2 | AC-17a-d |
| `/manager/library` | S-08 Manager Library | Manager | S1 | C1-C4, T1-T5 | AC-02a-c |
| `/manager/library/templates/new`, `/manager/library/templates/:id` | S-09 Template Form | Manager | S1 | T2, T3, T4, C1 | AC-02a, AC-02b, AC-11 |
| `/403`, `*` | S-10 Error Pages | Any | S1 | None | AC-12a, AC-22b |

**Navigation.** Participant Sprint 1: Today, Plan, Log out. Sprint 2 adds Progress and Profile (CHANGE-06/04). Manager: Library, Log out. On screens narrower than 640 px use a bottom tab bar; on wider screens use a top bar. After login: Participant goes to `/today`; Manager goes to `/manager/library`.

**Entry rule.** An unauthenticated visitor opening `/` sees S-00. Its button goes to `/login`. A visitor with a valid session opening `/` or `/login` is redirected to their landing page.

**Route guards are UX only.** No session redirects to `/login`. Wrong role shows `/403`. The API still returns 401 or 403, and automated tests prove protection through the API.

#### 3. Shared UI behaviour

##### 3.1 Session

- Store the token in memory and `sessionStorage`. Send it as `Authorization: Bearer <token>`.
- On app start call `GET /api/auth/me`. A 401 clears the session.
- Log out: call A2, then clear state and go to `/login`, even if the call fails; show a notice when it fails.
- Any 401 `UNAUTHENTICATED`: clear the session and go to `/login?reason=expired` with a banner.
- Any 403 `FORBIDDEN`: navigation goes to `/403`; an action on a loaded page shows an error notice.

##### 3.2 Loading, empty and error states

| State | Rule |
| --- | --- |
| Loading | Skeleton placeholders for lists and cards. Disable submit buttons with a spinner while a request is pending |
| Empty | Every list has a message and one call to action |
| Error | `ErrorNotice` at the top of the affected card or form, with Retry for network and 5xx errors |
| Success | Brief toast after create or update; refresh the screen from the response body |
| Updates | No optimistic updates; change the UI only after the API answers |

##### 3.3 Error notice

- Component `ErrorNotice`: `role="alert"`, `data-testid="error-notice"`, receives focus after a failed submit.
- Field errors from `fields[]` appear under the matching input as `data-testid="field-error-<field>"` and name the field and limit.
- The UI maps the API `code` to a message. The server `message` is only a fallback.
- `totalReps` errors appear under the "Reps per set" input. `userExerciseId` and `templateId` errors appear as form-level notices.

| Code | Message shown |
| --- | --- |
| `INVALID_CREDENTIALS` | Email or password is incorrect. |
| `UNAUTHENTICATED` | Your session has ended. Please log in again. |
| `FORBIDDEN` | You do not have permission to do this. |
| `LOG_DATE_MISMATCH` | The day has changed. You can only log activity for today. |
| `VALIDATION_ERROR` | Field-level messages from `fields[]`; if no fields, the server message. |
| `QUICK_COMPLETE_NOT_AVAILABLE` | Quick Complete is only available for exercises planned today. |
| `ENTRY_NOT_EDITABLE` | Only today's entries can be edited or deleted. |
| `CATEGORY_HAS_TEMPLATES` | Remove the templates in this category first. |
| `NOT_FOUND` | That item no longer exists. |
| `INTERNAL_ERROR` or network failure | Something went wrong. Please try again. |

##### 3.4 Forms and validation

- The client checks only required, numeric, integer where needed, and greater than zero.
- The server owns range and cap validation. Show its field errors inline and keep the entered values after a rejected submit.
- Durations are entered as minutes and seconds and sent as `durationSec`; display `mm:ss`, or `h mm` at 60 minutes or more.
- Distance is entered in km with up to 2 decimals. Weight is entered in kg with 1 decimal. Percentages and calories show 1 decimal.
- Reps modes ask for Sets and Reps per set, then send `sets` and `totalReps = sets * repsPerSet`.
- Do not show a load/weight input in the Sprint 1 log form; `LedgerEntry` has no `loadKg` field.

##### 3.5 Dates and the today rule

- The date shown on Today is the `date` returned by `GET /api/progress/daily`, not the browser clock.
- Log forms send `logDate` equal to that displayed date.
- If the page stays open past midnight, the server returns 400 `LOG_DATE_MISMATCH`; show the notice and reload Today.
- No date picker exists for logging. Past days are read-only.

##### 3.6 Accessibility and responsive behaviour

- Every input has a visible label. Show progress as text as well as a bar.
- Touch targets are at least 44 px. Layout works from 360 px width.
- Breakpoints: below 640 px single column; 640-1023 px top navigation; 1024 px and wider two-column Today.
- Stop decorative motion when `prefers-reduced-motion` is set.

##### 3.7 Provisional design tokens

Final colours and assets are supplied by the user later. Until then use these tokens through CSS variables.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#0F172A` | Page background |
| `--color-surface` | `#1F2A3A` | App bars and sheets |
| `--color-card` | `#243447` | Cards, modals and inputs |
| `--color-accent-teal` | `#2F5561` | Fog, dividers and secondary fills |
| `--color-mint` | `#D6F5E3` | Primary buttons and positive progress |
| `--color-coral` | `#FF7A45` | Accents, alerts and selected states |
| `--color-text` | `#F7FAFC` | Body text |

Use soft white for small body text on card teal. Do not use coral as a large background fill.

#### 4. Sprint 1 screen specifications

##### S-00 Welcome (should-have)

- Public entry screen shown to unauthenticated visitors at `/`.
- Content: FitBunny wordmark, tagline "Move More, Be Healthier", heading "Let's Get Moving!", Thai support text, optional mascot image, and the CTA "เริ่มต้นใช้งาน" that goes to `/login`.
- No API call, no auto-advance, no RTM acceptance criterion.
- If the original mascot artwork is unavailable, ship the wordmark, heading, support text and CTA without `welcome-mascot`. Never substitute a redrawn or generated rabbit.
- Asset path follows the final SPA root, for example `<spa-root>/public/assets/fitbunny-mascot.png` plus `@2x`.
- Test ids: `welcome-title`, `welcome-tagline`, `welcome-cta`, and `welcome-mascot` when the asset exists.

##### S-01 Login (F-01)

- Fields: email and masked password. Button "Log in". No registration or password recovery links.
- Flow: A1 returns 200; store the session and go to the role landing page.
- 401 `INVALID_CREDENTIALS`: show the notice, clear the password, keep the email and focus the password field.
- 400: show field errors.
- Already logged in: redirect to the landing page. `?reason=expired` shows the session banner.
- Test ids: `login-email`, `login-password`, `login-submit`, `error-notice`.

##### S-02 Today (F-04, F-06)

- Header: date. The body-weight chip from P1 (`70.5 kg`, link to Profile, or "Set your body weight") is Sprint 2 with the Profile screen (CHANGE-04); daily overall progress card with a bar, `overallPercent` and `totalScore / totalWeight`.
- When `overallPercent` is null, show "Rest day" instead of a percentage.
- Rest-day banner: "Rest day - nothing planned. You can still log activity; it is saved but not scored."
- Plan item card for each `items[]`: name, tracking-mode badge, priority badge, target text, actual vs target, mini bar from `ratio`, item score, and buttons.
- Quick Complete is enabled when the day is not a rest day and `ratio < 1`. It calls E2, then refreshes from D1 and E3. A 200 with `entry: null` shows "Already at or above target". When `ratio >= 1` the button reads "Completed" and is disabled.
- "Log" opens S-03 for that exercise.
- "Entries" expands the entries for that exercise from E3, with the source tag Manual or Quick.
- Other activity today: list off-plan entries from E3 with an "Add activity" action. The picker lists existing snapshots from `GET /api/user-exercises`; there is no standalone create-exercise endpoint in Sprint 1. Creating a new snapshot requires adding it to the plan.
- States: loading skeletons; error notice with Retry; first-time user with no plan shows "Plan your month" and a link to `/plan/new`.
- Test ids: `today-date`, `today-overall-pct`, `item-<exerciseId>`, `item-quick-complete`, `item-log`, `rest-day-banner`, `add-activity`.

##### S-03 Log Entry modal (F-04)

Title: "Log activity - {exercise}". Fields by mode:

| Mode | Fields sent |
| --- | --- |
| `WEIGHT` | Sets, Reps per set -> `sets`, `totalReps` |
| `BODYWEIGHT_REPS` | Sets, Reps per set -> `sets`, `totalReps` |
| `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` | Duration (min + sec) -> `durationSec` |
| `CARDIO_DISTANCE` | Distance (km) -> `distanceKm` |

- Show a live preview such as "Adds 20 reps (2 x 10)".
- Save calls E1 with `logDate`. Success closes the modal and refreshes the card. A 400 keeps it open with inline errors.
- Cancel discards. Save is disabled while pending.
- Test ids: `log-sets`, `log-reps`, `log-duration-min`, `log-duration-sec`, `log-distance`, `log-save`.

##### S-05 My Plan (F-03)

- List from G2: exercise name, mode, target, repeat-day chips, priority, date range.
- Empty state: "No plan yet" with a button "Add your first exercise" to `/plan/new`.
- Button "Add exercise" goes to `/plan/new`.
- Sprint 2 adds Edit and End actions.

##### S-04 Add to Plan (F-03)

Two-step page with a step indicator.

**Step 1 - Choose exercise.**

- Templates tab: list from T1 grouped by category, with category and mode filters and client-side name search. Each card shows name, mode, body part and allowed range.
- Custom tab: name, tracking mode, optional body part, and cardio category only for `CARDIO_DISTANCE`.
- Selection or custom data is kept in wizard state. Do not call a create-exercise endpoint; Step 2 saves everything in one G1 request.

**Step 2 - Set goal.**

- Target fields by mode, using `targetSets`, `targetRepsPerSet`, `targetDurationSec` or `targetDistanceKm`.
- Priority weight 1-5.
- Repeat days: seven toggles, all seven on by default.
- Start date `effectiveFrom`: default today, minimum today.
- End date: optional, empty by default.
- Summary line, for example "Every day - 3 sets x 10 reps - from 9 Nov" or "Mon, Wed, Fri - ... - until 30 Nov".
- Save calls G1 with `source: "TEMPLATE"` and `templateId`, or `source: "CUSTOM"` and `exercise`. A 201 creates both the snapshot and the plan item in one transaction and goes to `/plan` with a toast. A 400 shows inline errors. On failure neither row is stored.
- Test ids: `template-card-<id>`, `wizard-continue`, `target-sets`, `target-reps`, `priority-<1..5>`, `repeat-day-<1..7>`, `plan-save`.

##### S-06 Monthly Progress (F-06) *(Sprint 2, CHANGE-06)*

Deferred to Sprint 2 with AC-15; this screen is not part of the Sprint 1 gate.

- Month switcher with previous and next; do not go past the current month.
- Summary: large `averagePercent` and "Based on N targeted days".
- Use `days[]` from M1. Derive display state: date after today is FUTURE; `isRestDay` is REST; otherwise TARGETED.
- TARGETED shows its percentage. REST shows "Rest" in muted style. FUTURE is disabled.
- Selecting a day opens a read-only day drawer using D1. It has no log buttons.
- Empty state: "No targeted days this month".
- Sprint 2 adds the streak badge.

##### S-07 Profile (FR-08) *(Sprint 2, CHANGE-04)*

Deferred to Sprint 2 with AC-17a-d; this screen is not part of the Sprint 1 gate.

- Show display name, email (read-only), current weight and its effective date.
- Field "Body weight (kg)" and Save call P2 with `{ "weightKg": ... }`.
- Success toast and the new value; each save appends a new weight record.
- Server 400 `VALIDATION_ERROR` is shown inline. If no weight exists, show "No weight set" and the hint "Needed to estimate calories" in Sprint 2.
- Sprint label: P1/P2 and S-07 are Sprint 2 (CHANGE-04); RTM 1.1.0 defers AC-17 verification to Sprint 2. Do not claim AC-17 in the Sprint 1 gate.

##### S-08 Manager Library (F-02)

One screen at `/manager/library` with two tabs.

**Templates tab**

- Table of name, category, mode, body part, range, MET and actions Edit/Delete.
- Filters by category and mode. Button "New template".
- Delete confirmation: "Delete this template? Participants' existing plans are not affected."
- Empty state: "No templates yet".

**Categories tab**

- List of categories with inline add and rename.
- Delete shows `CATEGORY_HAS_TEMPLATES` as a notice when templates still exist.

The Manager never sees participant data. Opening `/today` as a Manager shows `/403`.

##### S-09 Template Form (F-02)

- Route under the Manager Library: `/manager/library/templates/new` and `/manager/library/templates/:id`.
- Fields: category, name, tracking mode, target body part, Valid Range min and max, MET, and cardio category.
- The unit label follows the mode: `reps`, `seconds` or `km`.
- MET is greater than 0 and at most 25, step 0.1.
- Cardio category is shown and required only for `CARDIO_DISTANCE`; it is forbidden for other modes.
- Valid Range bounds the plan target, not a single entry. For reps modes the range is in total reps.
- Tracking mode is disabled when editing.
- Changing the mode clears fields that no longer apply.
- Server errors appear inline.

##### S-10 Error pages

- `/403`: "You don't have access to this page" with a button to the landing page.
- `*`: "Page not found" with the same button.

#### 5. Sprint 2 and Sprint 3 outline

**Sprint 2**

- Today: edit and delete icons on today's entries only; `ENTRY_NOT_EDITABLE` appears as a notice.
- Calories appear on item cards and as a total. When `calorieError` is `BODY_WEIGHT_REQUIRED`, show "Set your body weight" instead of a number.
- Streak badge on Today and Progress. When `todayPending`, show "Today counts once you reach 70%".
- Monthly Progress screen (S-06): monthly average over targeted days (AC-15, CHANGE-06).
- History screen: date range selector, default 30 days, newest first.
- Edit Plan Item: confirmation that changes apply from today and do not change past days. End sets the end date.
- Profile screen (S-07) and AC-17 verification (CHANGE-04).

**Sprint 3**

- Schedule week/month view.
- Reminders list with add, edit and delete; include "Reminders are saved and shown in the app; no email or push message is sent."
- Monthly Summary: targeted and Rest Day counts, days at or above 70%, monthly average, current streak, total calories and per-exercise totals. Layout and charts are defined in the F-10 contract.

#### 6. Empty and state matrix (Sprint 1)

| Screen | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- |
| S-02 Today | Card skeletons | "Plan your month" + button, or rest-day banner | Notice + Retry | Card and overall refreshed |
| S-05 My Plan | List skeleton | "No plan yet" + button | Notice + Retry | - |
| S-04 Add to Plan | Template skeleton | "No templates available yet" | Notice, inline field errors | Toast, go to `/plan` |
| S-06 Progress (S2) | Grid skeleton | "No targeted days this month" | Notice + Retry | - |
| S-07 Profile (S2) | Field skeleton | "No weight set" hint | Inline error | Toast |
| S-08 Manager Library | Table skeleton | "No templates yet" or "No categories yet" | Notice + Retry | Toast after delete |

#### 7. UI to AC and test traceability

Protection of data is always proven by API tests, never by UI behaviour alone.

| AC | UI evidence | Test file or scenario |
| --- | --- | --- |
| AC-25 | Main journey: Manager creates a template, logs out; Participant logs in, adds the template to the plan, opens Today, logs, presses Quick Complete, sees 100%, logs out and in again and sees the same data. Also covers the S-00 CTA when present, valid and invalid login notice, and protected URL redirect after logout | `tests/e2e/main_journey.spec.ts` |
| AC-12a (UI side) | Manager opening `/today` sees `/403` | `tests/e2e/main_journey.spec.ts` |
| AC-23 | Sets 21 shows `VALIDATION_ERROR` field error; Quick Complete is disabled with an explanation on a Rest Day; editing an old entry shows `ENTRY_NOT_EDITABLE` in Sprint 2; mocked midnight shows `LOG_DATE_MISMATCH` and reloads | `tests/e2e/validation_feedback.spec.ts` |
| AC-08b (S2) | History shows past days; streak badge equals the API value | `tests/e2e/streak_history.spec.ts` |
| AC-09c (S3) | Reminders screen states it is display-only | `tests/integration/reminder.test.ts` |

#### 8. Decisions

1. React and TypeScript single-page app, served by the API container.
2. Token kept in memory and `sessionStorage`, sent as a Bearer header.
3. Client validates only required, numeric and positive values; server validates caps and ranges.
4. The UI sends `logDate` equal to the displayed server date.
5. No optimistic updates.
6. Past days are read-only. Full History is Sprint 2.
7. Off-plan logging uses existing snapshots. A Participant cannot create a standalone snapshot in Sprint 1.
8. Duration uses minutes and seconds; reps are entered per set and sent as `totalReps`.
9. App screens use English copy. S-00 is the only Thai screen.
10. The Add to Plan wizard keeps its selection in memory and creates the snapshot and plan item in one G1 call.
11. S-00, the FitBunny tokens and final artwork are design-only items. They are not added to the approved RTM.
12. Final tokens and assets are supplied by the user later. The palette in this document is provisional.
13. Manager templates and categories share `/manager/library`.
14. Profile (S-07) and monthly progress (S-06) are Sprint 2 (CHANGE-04/06); Sprint 1 shows only the daily progress panel on Today.

#### 9. Open items

1. Decide the repository layout (`server/` + `web/` + `prisma/` per SDS 1.1.0, or `client/` + `server/prisma` with a versioned SDS/AGENTS update).
2. Resolve the off-plan custom exercise gap: Sprint 1 has no standalone `POST /api/user-exercises`.
