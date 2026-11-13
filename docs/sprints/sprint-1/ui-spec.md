### UI Specification (Sprint 1)

**Project Title:** Habit and Activity Tracking System — BunnyFit (Exercise Domain)
**Course:** CPE 334 Software Engineering
**Document Version:** 0.8.0
**SRS Baseline Version:** 1.1.0 (Feature Inventory 1.1.0, RTM 1.1.0, System-Level SDS 1.1.0)
**Date:** 6 November 2026
**Status:** 0.8.0 Draft (0.7.0 reconciled the UI with PR #36; 0.8.0 aligns S-02 Today with the design reference, review pending); 0.6.0 was approved
**Primary Author:** Onsinee | **Reviewer:** Nakagamon
**Repository Path:** `docs/sprints/sprint-1/ui-spec.md`
**Scope:** Sprint 1 screens for F-01, F-02, F-03 and the Sprint 1 subset of F-04/F-06. Participant navigation in Sprint 1 is Today and My Plan; Profile (S-07) and monthly progress (S-06) are Sprint 2 (CHANGE-04/06) and open placeholder pages in the five-item bottom bar (0.7.0). The wider design is not a Sprint 1 gate.

**Source baselines**

| Document | Version | Role |
| --- | --- | --- |
| SRS | 1.1.0 | Functional and business requirements, error envelope A.5 |
| Feature Inventory | 1.1.0 | Feature scope and dependencies |
| System-Level SDS | 1.1.0 | Stack, data model, UI conventions, routes and roles |
| RTM | 1.1.0 | 28 AC groups / 80 atomic AC and target test paths |
| API Specification | 0.6.0 | Reconciled HTTP contract used by this UI |

**Document Revision History**

| Version | Date | Description of Changes | Author(s) | Status |
| --- | --- | --- | --- | --- |
| **0.3.0** | 6 Nov 2026 | Initial committed draft. Reconciled from v0.2.0 against baseline 1.1.0 and Sprint 1 contracts 0.3.0. Monthly progress (S-06) and Profile (S-07) marked Sprint 2 (CHANGE-06/04); Sprint 1 navigation excludes both routes; Sprint 1 is mobile-first, with tablet and desktop layouts optional in Sprint 2. | Onsinee | Draft |
| **0.4.0** | 6 Nov 2026 | PR #15 review-fix pass: added contract precedence, API 0.4.0, category endpoint for S-04, Today/Rest Day discriminator and observable disabled controls, Quick Complete No-op behavior, exact contract copy, session-header test ids, and traceability/nit fixes. No baseline or contract change. | Onsinee | Draft |
| **0.5.0** | 6 Nov 2026 | PR #15 second review-fix pass: aligned S-04 to the F-03 two-tab Add Exercise dialog, aligned contract copy and empty states, moved the start date to the server `date` and extended the today rule to every date-aware screen, added the ledger time/value/kind and remaining-limit/range helper text, labelled AC-25 extras as supplementary, and fixed the health/test-id/viewport notes. No baseline or contract change. | Onsinee | Draft |
| **0.6.0** | 6 Nov 2026 | Reviewer approval recorded after re-review of `752f07d..13163f2`. Status set to Approved and the API Specification reference updated to 0.6.0; no UI, baseline or contract content changed. | Onsinee | Approved |
| **0.7.0** | 13 Nov 2026 | Reconciled with the UI implemented in PR #36; no baseline, API or contract change. (1) S-05 My Plan is a calendar (Month/Week) with a day summary and that day's list, not a plain list. (2) Participant navigation is a five-item bottom bar: Today, Progress, centre Add (opens S-04 via `/plan?add=1`), My Plan, Profile; Progress and Profile open Sprint 2 placeholders. (3) S-08/S-09: the Template Form is a dialog on `/manager/library` (the two `/manager/library/templates/*` routes were removed) and Categories is a dialog; the Library has category chips, a name search and a card grid. (4) The template picture picker is UI-only and nothing is saved until the API accepts `imageUrl`. (5) Welcome and Loading share one layout; Welcome is shown at `/welcome`. | Onsinee | Draft |
| **0.8.0** | 13 Nov 2026 | S-02 Today look aligned to the design reference (issue #10): a Monday-to-Sunday week row (`today-week`, day buttons `today-day-<YYYY-MM-DD>`, today marked; tapping any other day opens nothing and only shows the message "Only today's activity can be viewed and logged."), the overall card as a "Today's progress" row with the percentage on the right and "x / y points" below, and per plan item card a coloured exercise tile, a mode badge, a priority badge "P<weight>", "Target …", "Logged a of t … · score s", the item ratio as a percentage (`item-pct`), the Quick Complete / Completed and Log buttons and a small "Entries" link. Data sources, API calls and the S-02/S-03 test ids are unchanged, but the Today behaviour changes as described below; there is still no global "Add activity" control and no body-weight chip in Sprint 1. S-03 helper text follows F-04 R6 (daily cap and `rangeMax`, not the target; the contract takes precedence over this spec). The Today screen shows the date, the week row and the progress card on the page and only the activities in one soft-blue panel (activity cards 65 % white) under a title-only header; completed activities move behind a History button and Today lists only the unfinished ones; the "Log" button is labelled "Record". No baseline or API change and no edit to F-04. This does change what Today shows: the F-04 UI text (Today screen, Quick Complete row: when the target is reached the button shows "Completed" and a click shows "Already completed, nothing added") still holds, but a completed item is no longer on the Today list; it is reached through History, which shows it with the same card and the same button. Past days have no view in Sprint 1 (a tap on another day only shows a message). | Onsinee | Draft |

**Source-of-truth rule:** the approved baseline (SRS/RTM/SDS/plan 1.1.0) and Sprint 1 feature contracts 0.3.0 take precedence over this consolidated specification. The exact request/response shapes and rules in the F-xx contracts are authoritative; the UI may not depend on removed endpoints or fields. The v0.2.0 draft is reconciliation history only.

**Sprint 1 UI scope:**

- S-00 Welcome is a should-have and is not a gate for Sprint 1.
- The daily progress panel stays on Today; the monthly progress screen (S-06) is Sprint 2 with AC-15 (CHANGE-06).
- Participant Sprint 1 navigation is Today and My Plan. Profile and monthly progress are Sprint 2; Calendar and other tabs are later.
- Sprint 1 is mobile-first. Tablet and desktop layouts are optional and planned for Sprint 2.
- Manager templates and categories use one **Exercise Library** screen, following the F-02 wording: a category list and a template table grouped by category.
- Final artwork, colours and image assets are supplied by the design owner later; the tokens below are provisional.

**Reconciled changes from the v0.2.0 draft**

| Area | v0.2.0 draft | Final Sprint 1 specification |
| --- | --- | --- |
| App name | Inconsistent app name | **BunnyFit** everywhere |
| Participant navigation | Five tabs from Sprint 1 | Today and My Plan in Sprint 1; Profile and monthly progress in Sprint 2; other tabs later |
| Manager navigation | Separate Templates and Categories screens | One **Exercise Library** at `/manager/library` with a category list and a template table grouped by category |
| Welcome | Required S-00 | Optional S-00; ship without mascot if the asset is not available |
| Exercise selection | X1/X2 endpoints | `GET /api/user-exercises` for existing snapshots; template and custom exercises are created by `POST /api/plan-items` |
| Today | `quickCompleteAvailable` and `offPlanEntries` from the daily progress response | Use `isRestDay` for Rest Day; show Quick Complete when `ratio < 1`; keep the "Completed" button clickable at `ratio >= 1` for the No-op; read off-plan entries from `GET /api/entries` |
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

- The UI is a mobile-first single-page app built with React and TypeScript. It is served by the API container and talks only to the `/api` endpoints in the API Specification.
- The UI is never an authority. Hiding a button or route does not protect data; the backend enforces role and ownership rules.
- All displayed scores, percentages, dates, calories and cumulative values come from API responses. The UI does not recompute them.
- The UI may derive presentation state only: for example, whether a month day is TARGETED, REST or FUTURE from `isRestDay` and the current date.
- The SPA root is `web/` per SDS §2.5 and AGENTS.md; the repository layout is resolved (`server/`, `web/`, `prisma/`).

#### 2. Roles, routes and navigation

| Route | Screen | Role | Sprint | API calls | AC |
| --- | --- | --- | --- | --- | --- |
| `/` | S-00 Welcome | Public | S1 should-have | Reads session only | None |
| `/login` | S-01 Login | Public | S1 | `POST /api/auth/login` | AC-01a, AC-01b, AC-22a |
| `/today` | S-02 Today | Participant | S1 | `GET /api/progress/daily`, `POST /api/entries`, `POST /api/entries/quick-complete`, `GET /api/entries`, `GET /api/user-exercises` | AC-04a-b, AC-06, AC-10a-b, AC-13 |
| modal | S-03 Log Entry | Participant | S1 | `POST /api/entries` | AC-04a, AC-10a-b, AC-11 |
| `/plan` | S-05 My Plan | Participant | S1 | `GET /api/plan-items` | AC-03a, AC-03c |
| modal | S-04 Add Exercise | Participant | S1 | `GET /api/plan`, `GET /api/categories`, `GET /api/templates`, `POST /api/plan-items` | AC-03a-c, AC-11 |
| `/progress` | S-06 Monthly Progress | Participant | S2 (AC-15, CHANGE-06) | `GET /api/progress/daily`, `GET /api/progress/monthly` | AC-15 |
| `/profile` | S-07 Profile | Participant | S2 (AC-17, CHANGE-04) | `GET /api/profile`, `PUT /api/profile` | AC-17a-d |
| `/manager/library` | S-08 Exercise Library | Manager | S1 | `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id`, `GET/POST /api/templates`, `GET/PUT/DELETE /api/templates/:id` | AC-02a-c |
| dialog on `/manager/library` (0.7.0; the two template-form routes were removed) | S-09 Template Form | Manager | S1 | `GET /api/templates/:id`, `POST /api/templates`, `PUT /api/templates/:id`, `GET /api/categories` | AC-02a, AC-02b, AC-11 |
| `/403`, `*` | S-10 Error Pages | Any | S1 | None | AC-12a, AC-22b |

**Navigation.** Participant: a bottom bar with Today, Progress, Add, My Plan and Profile (0.7.0). Add opens the S-04 dialog on `/plan` (`/plan?add=1`). Progress and Profile are Sprint 2 (CHANGE-06/04) and open placeholder pages; Log out is in the top header. Manager: Exercise Library, Log out. Sprint 1 uses a bottom tab bar on mobile. Tablet and desktop navigation is optional and planned for Sprint 2. After login: Participant goes to `/today`; Manager goes to `/manager/library`.

**Entry rule.** An unauthenticated visitor opening `/` sees S-00. Its button goes to `/login`. A visitor with a valid session opening `/` or `/login` is redirected to their landing page. If S-00 is not shipped, `/` redirects unauthenticated visitors to `/login` and authenticated visitors to their landing page.

**Route guards are UX only.** No session redirects to `/login`. Wrong role shows `/403`. The API still returns 401 or 403, and automated tests prove protection through the API.

#### 3. Shared UI behaviour

##### 3.1 Session

- Store the token in memory and `sessionStorage`. Send it as `Authorization: Bearer <token>`.
- On app start call `GET /api/auth/me`. A 401 clears the session.
- The shared session header shows `displayName` and `role` from `/me` plus a "Log out" button. Test ids: `session-display-name`, `session-role`, `logout-button`.
- Log out: call `POST /api/auth/logout`, then clear state and go to `/login`, even if the call fails; show a notice when it fails.
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
| `UNAUTHENTICATED` | Please sign in again. |
| `FORBIDDEN` | You do not have permission to do this. |
| `LOG_DATE_MISMATCH` | This entry is not for today. Please reload the page. |
| `VALIDATION_ERROR` | Field-level messages from `fields[]`; if no fields, the server message. On Quick Complete, a `fields[].field` of `sets` shows a card-level notice: "Quick Complete cannot add the remaining target within today's limits." |
| `QUICK_COMPLETE_NOT_AVAILABLE` | Quick Complete is not available for this exercise today. |
| `ENTRY_NOT_EDITABLE` *(Sprint 2)* | Only today's entries can be edited or deleted. |
| `CATEGORY_HAS_TEMPLATES` | This category still has templates. Delete or move them first. |
| `NOT_FOUND` | That item no longer exists. |
| `INTERNAL_ERROR` or network failure | Something went wrong. Please try again. |

##### 3.4 Forms and validation

- The client checks only required, numeric, integer where needed, and greater than zero.
- The server owns range and cap validation. Show its field errors inline and keep the entered values after a rejected submit.
- Durations are entered as minutes and seconds and sent as `durationSec`; display `mm:ss`, or `h mm` at 60 minutes or more.
- Distance is entered in km with up to 2 decimals. Percentages and calories show 1 decimal. Body weight, in Sprint 2, is entered in kg with 1 decimal.
- Reps modes ask for Sets and Reps per set, then send `sets` and `totalReps = sets * repsPerSet`.
- Do not show a load/weight input in the Sprint 1 log form; `LedgerEntry` has no `loadKg` field.

##### 3.5 Dates and the today rule

- Every screen that needs "today" uses a server date, never the browser clock. Today uses the `date` returned by `GET /api/progress/daily`; Add Exercise uses the `date` returned by `GET /api/plan` (the call defaults to today).
- Log forms send `logDate` equal to the displayed Today date.
- Add Exercise sets the start date `effectiveFrom` default and minimum to the `GET /api/plan` date.
- If Today stays open past midnight, the server returns 400 `LOG_DATE_MISMATCH`; show the notice and reload Today.
- No date picker exists for logging. Past days are read-only.

##### 3.6 Accessibility and layout

- Every input has a visible label. Show progress as text as well as a bar.
- Touch targets are at least 44 px. The Sprint 1 layout works from 360 px width in a single column.
- Playwright UI tests use a 360 × 800 viewport to match the Sprint 1 mobile-first minimum width.
- Tablet and desktop layouts are optional and planned for Sprint 2.
- Stop decorative motion when `prefers-reduced-motion` is set.

##### 3.7 Provisional design tokens

Final colours and assets are supplied by the design owner later. Until then use these tokens through CSS variables.

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
- Content: BunnyFit wordmark, tagline "Move More, Be Healthier", heading "Let's Get Moving!", Thai support text, optional mascot image, and the CTA "เริ่มต้นใช้งาน" that goes to `/login`.
- No API call, no auto-advance, no RTM acceptance criterion.
- If the original mascot artwork is unavailable, ship the wordmark, heading, support text and CTA without `welcome-mascot`. Never substitute a redrawn or generated rabbit.
- Asset path follows the final SPA root, for example `<spa-root>/public/assets/bunnyfit-mascot.png` plus `@2x`.
- Test ids: `welcome-title`, `welcome-tagline`, `welcome-cta`, and `welcome-mascot` when the asset exists.

##### S-01 Login (F-01)

- Fields: email and masked password. Button "Sign in". No registration or password recovery links.
- Flow: `POST /api/auth/login` returns 200; store the session and go to the role landing page.
- 401 `INVALID_CREDENTIALS`: show the notice, clear the password, keep the email and focus the password field.
- 400: show field errors.
- Already logged in: redirect to the landing page. `?reason=expired` shows the session banner.
- Test ids: `login-email`, `login-password`, `login-submit`, `error-notice`.

##### S-02 Today (F-04, F-06)

- Header: the title "Today" in the shared page-holder header; everything else sits in one soft-blue panel whose first line is the date, followed by a Monday-to-Sunday week row. Today is marked; tapping another day does not open a screen, it only shows the short message "Only today's activity can be viewed and logged." Logging and Quick Complete stay for today only (`LOG_DATE_MISMATCH`); a day view belongs to the Sprint 2 history. The body-weight chip from `GET /api/profile` (`70.5 kg`, link to Profile, or "Set your body weight") is Sprint 2 with the Profile screen (CHANGE-04); daily overall progress card with a bar, `overallPercent` and `totalScore / totalWeight`.
- When `overallPercent` is null, show "Rest day: no goal today" in the overall card instead of a percentage (F-06 §6).
- Today lists only the plan items that are **not completed** (`ratio < 1`), under "Today's activities" (`open-list`). Completed items (`ratio >= 1`) are kept behind the **History** button (`history-toggle`, label "History (N)"; pressing it shows them in `history-list` with the same card, and "Back" returns; `history-empty` when none, `all-done` when every item is completed). Plan item card for each `items[]`: name, tracking-mode badge, priority badge, target text, actual vs target, mini bar from `ratio`, item score, and buttons. Today shows only the total `items[].target` and unit, for example "Target 40 reps"; the detailed "4 × 10 reps @ 40 kg" breakdown belongs to My Plan, which has the plan-item fields.
- Quick Complete is enabled when the day is not a rest day and `ratio < 1`. It calls `POST /api/entries/quick-complete`, then refreshes from `GET /api/progress/daily` and `GET /api/entries`. A 200 with `entry: null` shows "Already completed, nothing added". When `ratio >= 1` the button reads "Completed" and **remains clickable**; clicking it makes the No-op request and shows the same notice. F-04 §6 defines this behaviour, so the button is not disabled.
- Rest Day (`isRestDay: true`, `items: []`): show the banner "Rest day: log anything you did" (F-04 §6), an explanation that entries are saved but not scored, and a picker built from `GET /api/user-exercises`. Each picker row has a **disabled** Quick Complete control with the explanation "Quick Complete is not available for this exercise today" and an enabled "Log" action. Entries created from the picker are labelled "not scored". This keeps TEST-23-3 observable without inventing a planned item.
- First-time vs Rest Day: both have `isRestDay: true` and `items: []`. If `GET /api/user-exercises` returns `[]`, show the first-time state "Add an exercise to your plan first" with a link to `/plan` (F-04 §6); if it returns snapshots, show the Rest Day panel above.
- The button labelled **"Record"** (it records what was actually done; test ids `item-log`, `rest-day-log`; it was "Log" before 0.8.0) opens S-03 for that exercise.
- "Entries" expands the ledger for that exercise from `GET /api/entries`. Each row shows the entry time (from `createdAt`, displayed in Asia/Bangkok), the value with its unit, and the kind (`Manual` or `Quick`).
- There is no global "Add activity" control in Sprint 1; logging is per planned card or through the Rest Day picker. Off-plan logging on a targeted day is AC-04d, deferred to Sprint 2.
- States: loading skeletons; error notice with Retry; first-time user with no exercises shows "Add an exercise to your plan first" and a link to `/plan`.
- Test ids: `today-date`, `today-overall-pct`, `rest-day-banner`, `rest-day-picker`, `rest-day-quick-complete`. Inside each item card, `item-<userExerciseId>` contains `item-quick-complete`, `item-log` and, when expanded, `item-entries`; these repeat once per card. `rest-day-quick-complete` repeats once per Rest Day picker row.

##### S-03 Log Entry modal (F-04)

Title: "Log activity - {exercise}". Fields by mode:

| Mode | Fields sent |
| --- | --- |
| `WEIGHT` | Sets, Reps per set -> `sets`, `totalReps` |
| `BODYWEIGHT_REPS` | Sets, Reps per set -> `sets`, `totalReps` |
| `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` | Duration (min + sec) -> `durationSec` |
| `CARDIO_DISTANCE` | Distance (km) -> `distanceKm` |

- Show a live preview such as "Adds 20 reps (2 x 10)".
- Show the daily limit left as helper text ("Daily limit left: …"): the stricter of the daily cap and the template `rangeMax` minus today's total for that exercise (F-04 R6). The target is not a limit: entries above it are accepted (AC-14b, the ratio stays capped at 1.0).
- Save calls `POST /api/entries` with `logDate`. Success closes the modal and refreshes the card. A 400 keeps it open with inline errors.
- Cancel discards. Save is disabled while pending.
- Test ids: `log-sets`, `log-reps`, `log-duration-min`, `log-duration-sec`, `log-distance`, `log-save`.

##### S-05 My Plan (F-03)

- (0.7.0) Calendar card with a Month | Week switch and previous/next arrows; today and the selected day are marked; a dot (Month) or a mascot (Week) marks days that have exercises. Below it a day summary (long date, "N exercises planned" or "Rest Day", button "Add exercise") and that day's list. "Today" comes from `GET /api/plan`; the whole plan comes from one `GET /api/plan-items` and the items on a date are computed in the browser (F-03 contract R12).
- List item: exercise name, mode, target, repeat-day chips, priority, date range. The target summary uses the plan fields, for example "4 × 10 reps @ 40 kg" or "3.5 km".
- Empty state: "No exercises in your plan yet. Add your first one" with a button "Add your first one" that opens S-04. A day with nothing planned shows "Rest Day: nothing is planned for this date."
- Button "Add exercise" opens the S-04 dialog.
- Sprint 2 adds Edit and End actions.

##### S-04 Add Exercise dialog (F-03)

Modal dialog opened from My Plan. It has two tabs: **From library** and **Custom**. It adds no separate route.

**From library**

- List from `GET /api/templates` grouped by category, with category and mode filters (categories from `GET /api/categories`) and client-side name search. Each card shows name, mode, body part and allowed range.
- Choosing a template pre-fills the target section from the template: name, body part, unit and Valid Range.

**Custom**

- Fields: name (required, 1-80 characters), tracking mode, body part (required, 1-50 characters), and cardio category only for `CARDIO_DISTANCE`.
- Show the note "Default calories value is set by the system".
- The form is part of Sprint 1; AC-03d and AC-16a-b are verified in Sprint 2 (CHANGE-05/08).

**Target and common fields**

- Target fields by mode, using `targetSets`, `targetRepsPerSet` (+ `loadKg` for weight training), `targetDurationSec` or `targetDistanceKm`.
- Show the allowed range (the template Valid Range or the central limit) as helper text.
- Priority weight 1-5.
- Repeat days: seven toggles, all seven on by default.
- Start date `effectiveFrom`: use the `date` returned by `GET /api/plan` as both the default and the minimum; dates before it are disabled, and the browser clock is never used.
- End date: optional, empty by default.
- Summary line, for example "Every day - 3 sets x 10 reps - from 9 Nov" or "Mon, Wed, Fri - ... - until 30 Nov".

Selection or custom data is kept in dialog state. Save sends everything in one `POST /api/plan-items` request; there is no separate create-exercise call.

- Save calls `POST /api/plan-items` with `source: "TEMPLATE"` and `templateId`, or `source: "CUSTOM"` and `exercise`. A 201 creates both the snapshot and the plan item in one transaction, closes the dialog, shows a success notice and refreshes My Plan. A 400 shows inline errors. On failure neither row is stored.
- Save is disabled while the request is pending.
- Test ids: `add-exercise-dialog`, `template-card-<id>`, `tab-from-library`, `tab-custom`, `target-sets`, `target-reps`, `target-load`, `priority-<1..5>`, `repeat-day-<1..7>`, `plan-save`.

##### S-06 Monthly Progress (F-06) *(Sprint 2, CHANGE-06)*

Deferred to Sprint 2 with AC-15; this screen is not part of the Sprint 1 gate.

- Month switcher with previous and next; do not go past the current month.
- Summary: large `averagePercent` and "Based on N targeted days".
- Use `days[]` from `GET /api/progress/monthly`. Derive display state: date after today is FUTURE; `isRestDay` is REST; otherwise TARGETED.
- TARGETED shows its percentage. REST shows "Rest" in muted style. FUTURE is disabled.
- Selecting a day opens a read-only day drawer using `GET /api/progress/daily`. It has no log buttons.
- Empty state: "No targeted days this month".
- Sprint 2 adds the streak badge.

##### S-07 Profile (FR-08) *(Sprint 2, CHANGE-04)*

Deferred to Sprint 2 with AC-17a-d; this screen is not part of the Sprint 1 gate.

- Show display name, email (read-only), current weight and its effective date.
- Field "Body weight (kg)" and Save call `PUT /api/profile` with `{ "weightKg": ... }`.
- Success toast and the new value; each save appends a new weight record.
- Server 400 `VALIDATION_ERROR` is shown inline. If no weight exists, show "No weight set" and the hint "Needed to estimate calories" in Sprint 2.
- Sprint label: `GET/PUT /api/profile` and S-07 are Sprint 2 (CHANGE-04); RTM 1.1.0 defers AC-17 verification to Sprint 2. Do not claim AC-17 in the Sprint 1 gate.

##### S-08 Exercise Library (F-02)

One screen at `/manager/library` with two areas.

**Templates area**

- (0.7.0) Card grid of templates with Edit/Delete; category chips (All plus one per category), a name search and a mode filter. Button "New template" opens the S-09 dialog; button "Categories" opens the categories dialog.
- Delete confirmation: "Delete this template? Participants' existing plans are not affected."
- Empty state: "No exercises yet. Add the first one".

**Categories area**

- (0.7.0) The categories dialog lists categories with add and rename.
- Delete shows the notice "This category still has templates. Delete or move them first" when templates still exist (`CATEGORY_HAS_TEMPLATES`).

The Manager never sees participant data. Opening `/today` as a Manager shows `/403`.

##### S-09 Template Form (F-02)

- (0.7.0) A dialog opened from the Exercise Library (no separate route). The earlier `/manager/library/templates/new` and `/:id` routes were removed.
- Fields: category, name, tracking mode, target body part, Valid Range min and max, MET, and cardio category.
- The unit label follows the mode: `reps`, `seconds` or `km`.
- MET is greater than 0 and at most 25, step 0.1.
- Cardio category is shown and required only for `CARDIO_DISTANCE`; it is forbidden for other modes.
- Valid Range bounds the plan target. `rangeMax` also caps a single entry and the daily cumulative value (F-02 R10, F-04 R6). For reps modes the range is in total reps.
- Tracking mode is disabled when editing.
- (0.7.0) A picture picker is shown; it is UI-only: the choice is not saved and the dialog says so until the API accepts `imageUrl`.
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
- Optional tablet and desktop layouts.

**Sprint 3**

- Schedule week/month view.
- Reminders list with add, edit and delete; include "Reminders are saved and shown in the app; no email or push message is sent."
- Monthly Summary: targeted and Rest Day counts, days at or above 70%, monthly average, current streak, total calories and per-exercise totals. Layout and charts are defined in the F-10 contract.

#### 6. Empty and state matrix (Sprint 1)

| Screen | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- |
| S-02 Today | Card skeletons | "Add an exercise to your plan first" + link, or Rest Day panel | Notice + Retry | Card and overall refreshed |
| S-05 My Plan | List skeleton | "No exercises in your plan yet. Add your first one" + button | Notice + Retry | - |
| S-04 Add Exercise | Template skeleton | "No templates available yet" | Notice, inline field errors | Toast, dialog closed, My Plan refreshed |
| S-06 Progress (S2) | Grid skeleton | "No targeted days this month" | Notice + Retry | - |
| S-07 Profile (S2) | Field skeleton | "No weight set" hint | Inline error | Toast |
| S-08 Exercise Library | Table skeleton | "No exercises yet. Add the first one" or "No categories yet" | Notice + Retry | Toast after delete |

#### 7. UI to AC and test traceability

Protection of data is always proven by API tests, never by UI behaviour alone.

| AC | UI evidence | Test file or scenario |
| --- | --- | --- |
| AC-25 | Main journey (RTM): Manager creates a template → Participant logs in and lands on Today → selects the template and sets the goal → logs 1 set / 10 reps → presses Quick Complete → sees 100% → logs out and in again → sees the same data | `tests/e2e/main_journey.spec.ts` |
| Supplementary checks *(not part of the AC-25 pass criteria)* | S-00 CTA when present; invalid-login notice; protected-URL redirect after logout; session header showing display name and role | `tests/e2e/main_journey.spec.ts` |
| AC-12a (UI side, supplementary) | Manager opening `/today` sees `/403`. RTM AC-25 owns `main_journey.spec.ts`; this row is supplementary UI evidence | `tests/e2e/main_journey.spec.ts` |
| AC-23 | Sets 21 shows `VALIDATION_ERROR` field error; Quick Complete is disabled with an explanation on a Rest Day; editing an old entry shows `ENTRY_NOT_EDITABLE` in Sprint 2; mocked midnight shows `LOG_DATE_MISMATCH` and reloads. The Rest Day picker and disabled control are rendered from `GET /api/user-exercises`, so TEST-23-3 has an observable target | `tests/e2e/validation_feedback.spec.ts` |
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
10. The Add Exercise dialog keeps its selection in memory and creates the snapshot and plan item in one `POST /api/plan-items` call; it adds no separate route.
11. S-00, the BunnyFit design tokens and final artwork are design-only items. They are not added to the approved RTM.
12. Final tokens and assets are supplied by the design owner later. The palette in this document is provisional.
13. The Manager's **Exercise Library** uses one screen at `/manager/library` with a category list and a template table grouped by category.
14. Profile (S-07) and monthly progress (S-06) are Sprint 2 (CHANGE-04/06); Sprint 1 shows only the daily progress panel on Today.
15. Sprint 1 is mobile-first. Tablet and desktop layouts are optional and planned for Sprint 2.
16. Repository layout is resolved: SDS §2.5 and AGENTS.md fix `server/`, `web/` and `prisma/` at the repository root; the SPA root is `web/`.
17. Playwright Sprint 1 UI tests use a 360 × 800 viewport. The 360 px minimum width is a UI-spec decision, not a requirement taken from the baseline.

#### 9. Open items

1. Resolve the off-plan custom exercise gap: Sprint 1 has no standalone `POST /api/user-exercises`.
