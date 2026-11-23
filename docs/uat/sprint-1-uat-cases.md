### Sprint 1 User Acceptance Test (UAT) Cases

**Project:** BunnyFit, Habit and Activity Tracking (Exercise Domain) | **Course:** CPE 334, Lab 6 Part A
**Document version:** 0.2.0 (draft, review pending) | **Authors:** Nakagamon (`fahsai-02`) | **Reviewer:** Onsinee (`justfepwx12`)
**Issue:** #53 | **Scope:** Sprint 1 only (F-01, F-02, F-03, F-04, F-06). Sprint 2 and 3 features are not accepted here.

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 17 Nov 2026 | First draft of the handoff and nine cases. Not yet run against a deployed release; not yet reviewed. |
| 0.2.0 | 23 Nov 2026 | Handoff table filled (tag object versus tag commit, URL, revision, deployed-versus-tag row, run status, reset note). After the review of PR #102: "History" now means the "History (N)" button on Today; UAT-S1-03 no longer assumes a clean template list after 01; same-date rule for dependent cases; UAT-S1-05 no longer depends on 04; field names and sample bodies for the API-tool steps; deployed revision row updated for the second `deploy.yml` run. |

--------------------------------------------------------------------------------

#### 1. Handoff

| Item | Value |
| --- | --- |
| Product team | Nakagamon (67070501064) and Onsinee (67070501078) |
| Release tag | `sprint1-v1.0.0` (annotated tag object `b42f8d1`, pointing to commit `bf57652`, the merge of PR #43) |
| Repository | https://github.com/Rabbit-hop/bunnyfit |
| Deployed URL | `https://s27d6b925-4d7hbszvwq-as.a.run.app` (from `docs/labs/lab-05/deployment.md` §5) |
| Deployed revision | Two `deploy.yml` runs have succeeded on `main` (`gh run view`, every step `success`): run 45003687814 for commit `ed24008` (revision `s27d6b925-00005-wz9` after the roll forward, `docs/labs/lab-05/deployment.md` §7.3) and run 45022388063 for commit `b0bb75f38e0799bba8fbf01d3eaaca03ca4749bd` (merge of PR #101, 22 Nov 2026), which is the latest run. The Cloud Run revision name and image tag of that second run are **not recorded in the repository**; read them with the command in `deployment.md` §6 and write them next to every result. |
| Deployed commit versus the tag | `b0bb75f` is 53 commits after the tag commit `bf57652` (`git rev-list --count`). `git diff --stat bf57652 b0bb75f` lists 8 changed files, all Lab 5 material (Dockerfile, CI and deploy workflows, `README.md`, `docker-compose.yml`, `deployment.md`, a report script); `git diff --stat` limited to `server/`, `web/` and `prisma/` is empty. Application code is therefore the tagged Sprint 1 code if `b0bb75f` is what is live; confirm the live tag on the day of the run. Code equivalence was not checked by running tests on `b0bb75f`. |
| Run status | **No case has been run yet.** The results of the partner's run are recorded in the Lab 6 PDF, not in this file. |
| Contracts the cases are checked against | `docs/sprints/sprint-1/F-01..F-04, F-06`, `ui-spec.md` 0.8.0, `api-spec.md`; AC IDs follow `docs/traceability.md` |
| Tested scope | Login/logout, exercise library (Manager), goal setting from a library template, daily logging, Quick Complete, daily progress, role and ownership denial |
| Not in scope (Sprint 2/3) | Custom exercises, editing or ending plan items, editing or deleting entries, monthly progress, profile and body weight, calories, streak, history by date, reminders |

**Accounts** (labels and roles only; passwords are sent privately through the course handoff)

| Label | Role | Used for |
| --- | --- | --- |
| `manager@exercise.test` | MANAGER | Library cases and denial checks |
| `alice@exercise.test` | PARTICIPANT | UAT-S1-01, 08, 09 |
| `bob@exercise.test` | PARTICIPANT | UAT-S1-04, 05, 06 and the ownership counterpart in 07 |

**Conventions**

- "Today" is the date shown on the Today screen (Asia/Bangkok, from the server). Never use the browser or computer date.
- Use a phone-width window (about 360 px wide). Percentages show one decimal ("33.3%").
- Steps marked **[API tool]** cannot be done in the UI. Use any HTTP client (curl, Postman). Log in with `POST /api/auth/login` `{ "email", "password" }` and send `Authorization: Bearer <token>`.
- **"History"** in this file means the button "History (N)" on the Today screen (`history-toggle`). Completed items leave the Today list and are shown behind it; "Back" returns. Sprint 1 has no separate History page.
- Record PASS, FAIL or BLOCKED per case. BLOCKED needs a reason and is not a pass.

**Sequence and data state.** Sprint 1 has no UI to delete or end a plan item or an entry, so the cases change data that the UAT team cannot undo. Start from a clean database (see reset) and run the cases in this order. Cases not listed as dependent can run alone on a clean database.

**Same-date rule.** A case that depends on another must run on the same Asia/Bangkok calendar date as the case it depends on. Today counts only today's entries and the plans repeat every day, so after midnight a finished item shows 0.0% and is on the Today list again (and UAT-S1-04 excludes today's weekday). A correct app would then look like a FAIL. If the date changes between two dependent cases, reset and start again from the first case that is needed.

| Case | Depends on | Leaves behind |
| --- | --- | --- |
| UAT-S1-01 | none | Manager template "UAT Sit-up"; Alice plan item "UAT Sit-up" 100% done today |
| UAT-S1-02 | none | nothing |
| UAT-S1-03 | none (step 9 allows for a leftover "UAT Sit-up") | nothing (it deletes what it creates) |
| UAT-S1-04 | none | Bob plan item "Jump Rope" (not on today) |
| UAT-S1-05 | none (Bob must have no Push-up in his plan) | Bob plan item "Push-up", no entries |
| UAT-S1-06 | 05 | Bob plan item "Plank"; both items done |
| UAT-S1-07 | 01, 06 | nothing |
| UAT-S1-08 | 01 | nothing |
| UAT-S1-09 | 01 | Template "UAT Sit-up" deleted |

**Reset (Product Team action, before the UAT run).** Empty the application database and apply migrations and the seed so that only the seeded data exists (1 Manager, Alice, Bob, 4 categories, 8 templates: Barbell Squat, Bench Press, Push-up, Plank, Sun Salutation, Jump Rope, Outdoor Run, Road Cycling). Re-running the seed alone is not enough, because it does not remove participants' plans or entries (README). The exact reset command for the deployed database is **not recorded**: `docs/labs/lab-05/deployment.md` documents only the migration/seed job `s27d6b925-migrate` (run once at first deployment), not a full reset. The Product Team must agree and record the command before the run. The UAT team does not need database access.

--------------------------------------------------------------------------------

#### 2. Cases

##### UAT-S1-01 Normal journey: template to 100% (AC-25; AC-01a, AC-02a, AC-03a, AC-04a, AC-06d, AC-13a)

**Purpose:** a Manager creates an exercise and a Participant uses it from goal to completion. **Roles:** Manager, then Alice.
**Preconditions:** clean database. **Inputs:** template name `UAT Sit-up`, category Bodyweight, mode BODYWEIGHT_REPS, body part `Core`, MET 3.8, range 1 to 4000; goal 3 sets x 10 reps, priority 4, repeat every day.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open the app, sign in as the Manager | You land on Exercise Library (`/manager/library`). The header shows "Program Manager" and role MANAGER. |
| 2 | Choose "New template" and save the inputs above | The dialog closes and "UAT Sit-up" appears in the library under Bodyweight. |
| 3 | Log out. Sign in as Alice | You land on Today. The header shows "Alice" and role PARTICIPANT. Because Alice has no plan, Today shows "Add an exercise to your plan first" with a link to My Plan. |
| 4 | Open My Plan, choose "Add exercise", stay on "From library", pick "UAT Sit-up". Enter sets 3, reps per set 10, priority 4, leave all seven repeat days on and the default start date. Save | The dialog closes. My Plan lists "UAT Sit-up" with a target of 3 x 10 reps and priority 4. |
| 5 | Open Today | The card "UAT Sit-up" shows target 30 reps and 0 logged. "Today's progress" shows 0.0% and 0 points over a total weight of 4. |
| 6 | Press "Record", enter sets 1, reps per set 10, save | The card shows 10 of 30 reps. Today's progress shows 33.3%. |
| 7 | Press "Entries" on the card | One row: 10 reps, kind "Manual". |
| 8 | Press "Quick Complete" | The card reaches 30 of 30 and leaves the Today list. Today's progress shows 100.0%. Today has no unfinished activity left to list. |
| 9 | On Today press "History (N)" | The card "UAT Sit-up" is there with button "Completed". Its Entries show two rows: 10 reps Manual and 20 reps Quick (20 = 30 minus 10). |

**Pass when** every expected result matches.

##### UAT-S1-02 Authentication: rejected login and session end (AC-01a, AC-01b, AC-01c, AC-01d, AC-22a)

**Role:** none, then Alice. **Preconditions:** none. **Inputs:** `alice@exercise.test` with a wrong password `NotThePassword1`; `nobody@exercise.test` with the same password.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Sign in as Alice with the wrong password | Notice "Email or password is incorrect." The password field is cleared, the email is kept, focus is on the password field. You stay on the login page. |
| 2 | Sign in as `nobody@exercise.test` with the same wrong password | The same notice, word for word. Nothing tells you whether the email exists. |
| 3 | While signed out, open `/today` directly | You are sent to the login page. No participant data is shown. |
| 4 | Sign in as Alice with the correct password | You land on Today. The header shows display name and role. |
| 5 | **[API tool]** Log in as Alice by API and keep the token. `GET /api/auth/me` with it | 200 with Alice's email, role PARTICIPANT, display name; no password hash. |
| 6 | In the UI press "Log out" | You return to the login page. |
| 7 | **[API tool]** `GET /api/auth/me` with the token from step 5 | 401. |
| 8 | **[API tool]** `GET /api/auth/me` with no Authorization header; then with `Authorization: Bearer abc.def.ghi` | 401 both times. |

##### UAT-S1-03 Manager library: create, change, delete (AC-02a, AC-02b)

**Role:** Manager. **Preconditions:** clean database. **Inputs:** category `UAT Mobility`; renamed `UAT Mobility 2`; templates `UAT Reach` (YOGA, body part `Back`, MET 2.5, range 1 to 600) and `UAT Walk` (CARDIO_DISTANCE, cardio category WALKING, body part `Legs`, MET 3.5, range 0.1 to 20).

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open Categories, add `UAT Mobility` | It appears in the category list. |
| 2 | New template with the `UAT Reach` inputs, category `UAT Mobility` | Saved. The card shows unit "seconds". |
| 3 | New template `UAT Walk` choosing CARDIO_DISTANCE and leaving cardio category empty | Rejected with a field message naming the cardio category. Nothing is added. |
| 4 | Fill the cardio category (WALKING) and save | Saved. The card shows unit "km". |
| 5 | Edit `UAT Reach`: set MET 3.0 and range max 900 | Saved. Reopening it shows 3.0 and 900. The tracking-mode field is disabled (UI rule, `ui-spec.md` S-09; the server rule is AC-02d, Sprint 2, and is not covered here). |
| 6 | Rename the category to `UAT Mobility 2` | The chips and both template cards show the new name. |
| 7 | Reload the page | All of the above is still shown. |
| 8 | Delete `UAT Reach`, confirm | The confirmation says participants' existing plans are not affected. The card disappears. |
| 9 | Delete `UAT Walk`, then delete the empty category | Both disappear. The library shows the eight seeded templates, plus "UAT Sit-up" if UAT-S1-01 has run and UAT-S1-09 has not. |

##### UAT-S1-04 Rest Day: Quick Complete is not available (AC-04b, AC-06e, AC-23)

**Role:** Bob (then API tool). **Preconditions:** clean database; Bob has no plan. **Inputs:** library template `Jump Rope` (CARDIO_TIME), target 10 min 0 s, priority 3, all seven repeat-day toggles on **except today's weekday** (switch that one off; work out today's weekday from the date on the Today screen).

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Sign in as Bob, open Today | "Add an exercise to your plan first" with a link to My Plan. |
| 2 | Add the Jump Rope plan item with the inputs above | Saved. In My Plan, select today: "Rest Day: nothing is planned for this date." |
| 3 | Open Today | Banner "Rest day: log anything you did". The overall card shows "Rest day: no goal today", not "0%". |
| 4 | Look at the Jump Rope row in the Rest Day list | Quick Complete is disabled with the text "Quick Complete is not available for this exercise today". The "Log" action is enabled. |
| 5 | **[API tool]** As Bob, `GET /api/user-exercises` (a list of snapshots with `id`, `name`, `trackingMode`, ...), copy the `id` of the item whose `name` is "Jump Rope", then `POST /api/entries/quick-complete` with `{ "userExerciseId": "<id>" }` | 400 with code `QUICK_COMPLETE_NOT_AVAILABLE`. |
| 6 | **[API tool]** `GET /api/entries` as Bob | `entries` is empty: the rejected request stored nothing. |

##### UAT-S1-05 Boundaries: goal and entry limits (AC-03b, AC-11, AC-23, AC-10b)

**Role:** Bob. **Preconditions:** clean database, or Bob has no Push-up in his plan and no entries today (it also works after UAT-S1-04). **Inputs:** library template `Push-up` (BODYWEIGHT_REPS).

| # | Action | Expected result |
| --- | --- | --- |
| 1 | My Plan, Add exercise, pick Push-up, sets 21, reps per set 10, priority 4, save | Rejected. An inline error under the sets field names the field and the limit (20). The dialog stays open with your values kept. My Plan has no Push-up. |
| 2 | Change sets to 3 and save | Saved. My Plan lists Push-up, target 3 x 10 reps. |
| 3 | Open Today, press "Record" on Push-up, enter sets 21, reps per set 1, save | Rejected with an inline error naming sets and the limit 20. The modal stays open. |
| 4 | Enter sets 1, reps per set 201 | Rejected with an inline error under "Reps per set" (the limit is 200 reps per set). |
| 5 | Cancel. Press "Entries" on the Push-up card | No rows. Progress shows 0.0%. |
| 6 | **[API tool]** As Bob, `POST /api/entries` with the Push-up `userExerciseId`, `sets` 1, `totalReps` 10 and `logDate` equal to tomorrow's date | 400 with code `LOG_DATE_MISMATCH`. Nothing is stored (`GET /api/entries` stays empty). |

##### UAT-S1-06 Weighted progress, cap, Quick Complete and its repeat (AC-06a, AC-06b, AC-06d, AC-13a, AC-13b, AC-14a, AC-14b, AC-04a)

**Role:** Bob. **Preconditions:** UAT-S1-05 done (Push-up planned, target 30 reps, priority 4, no entries). **Inputs:** add library template `Plank` (BODYWEIGHT_TIME), target 1 min 0 s, priority 1, every day.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Add Plank to the plan with the inputs above; open Today | Two cards: Push-up (target 30 reps) and Plank (target 1:00). Overall 0.0% of total weight 5. |
| 2 | Record Push-up: sets 1, reps per set 15 | Push-up shows 15 of 30 (50.0%), item score 2.0 of 4. Overall 40.0% (2.0 / 5). |
| 3 | Record Plank: 1 min 30 s (more than the target) | Plank shows 100%, item score 1.0 (not above 1.0), and moves to History. Overall 60.0% ((2.0 + 1.0) / 5). |
| 4 | Press Quick Complete on Push-up | A new entry of 15 reps is added. Push-up reaches 30 of 30 and moves to History. Overall 100.0%. |
| 5 | On Today press "History (N)", then "Completed" on Push-up | The notice "Already completed, nothing added" appears. |
| 6 | In the History list press "Entries" on Push-up | Exactly two rows: 15 reps Manual and 15 reps Quick. The Plank entries show one row of 1:30. |

##### UAT-S1-07 Forbidden role and other users' data (AC-12a, AC-12b, AC-22a, AC-22b, AC-02c)

**Roles:** Manager, Alice, Bob. **Preconditions:** UAT-S1-01 and UAT-S1-06 done.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Sign in as the Manager, open `/today` directly | The "You don't have access to this page" page (403). No participant data is shown. |
| 2 | Sign in as Alice, open `/manager/library` directly | The same 403 page. |
| 3 | Signed out, open `/manager/library` | You are sent to the login page. |
| 4 | **[API tool]** Log in as Bob (Bob's token). `GET /api/entries`; copy the `id` of any object in `entries` as `BOB_ENTRY`. Also `GET /api/user-exercises` and copy the `id` of the item named "Push-up" as `BOB_PUSHUP` | 200 with Bob's entries and snapshots. |
| 5 | **[API tool]** Log in as Alice (Alice's token, used for steps 5, 6 and 8). `GET /api/entries/<BOB_ENTRY>` | 403. The body contains none of Bob's data. |
| 6 | **[API tool]** With Alice's token, `POST /api/entries/quick-complete` with `{ "userExerciseId": "<BOB_PUSHUP>" }` | 403. Bob's Push-up entries are unchanged (still two rows, 30 reps in total). |
| 7 | **[API tool]** As the Manager, `GET /api/entries` and `GET /api/progress/daily` | 403 both times, with no participant data. |
| 8 | **[API tool]** First, as the Manager, `GET /api/categories` (copy one category `id` as `CAT`) and `GET /api/templates` (copy the `id` of any seeded template as `TPL`; note the number of templates). Then, with Alice's token, `POST /api/templates` with `{ "categoryId": "<CAT>", "name": "UAT Denied", "targetBodyPart": "Core", "trackingMode": "BODYWEIGHT_REPS", "metValue": 3.8 }` and `DELETE /api/templates/<TPL>` | 403 both times. As the Manager, `GET /api/templates` still shows the same number of templates, none named "UAT Denied". |
| 9 | **[API tool]** `GET /api/progress/daily` with no Authorization header | 401. |

##### UAT-S1-08 Persistence across logout and login (AC-01d, AC-24a)

**Role:** Alice. **Preconditions:** UAT-S1-01 done.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Sign in as Alice, open Today | The Today list is empty of unfinished work; Today's progress shows 100.0%. |
| 2 | On Today press "History (N)" | "UAT Sit-up" with button "Completed"; Entries show 10 reps Manual and 20 reps Quick. |
| 3 | Open My Plan | "UAT Sit-up" is listed with target 3 x 10 reps. |
| 4 | Log out, close the browser tab, open the app again and sign in as Alice | The same plan, entries and 100.0% are shown, with no duplicate rows. |
| 5 | Ask the Product Team to restart or redeploy the app (any new instance on the same database), then sign in again | The same data as in step 4. If the Product Team cannot restart the app during the test, mark this step BLOCKED with the reason; steps 1 to 4 still count. |

##### UAT-S1-09 Library change does not alter a participant's plan (AC-27, AC-03a)

**Roles:** Manager, Alice. **Preconditions:** UAT-S1-01 done.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | As the Manager edit "UAT Sit-up": name `UAT Sit-up RENAMED`, range max 1000 | Saved. The library shows the new name. |
| 2 | As Alice open My Plan and Today (and "History (N)") | The exercise is still named "UAT Sit-up" with target 3 x 10 reps, 100.0%, same entries. |
| 3 | As the Manager delete the template, confirm | It disappears from the library. |
| 4 | As Alice open My Plan, Today and "History (N)" | Still "UAT Sit-up", same target, same 100.0% and entries. Nothing says the exercise is missing. |
| 5 | As Alice open My Plan, Add exercise, From library | "UAT Sit-up" and "UAT Sit-up RENAMED" are not offered. |

--------------------------------------------------------------------------------

#### 3. Coverage

| Required category | Cases |
| --- | --- |
| Normal domain journey | UAT-S1-01 |
| Business rule or boundary | UAT-S1-05, UAT-S1-06 (also 04) |
| Forbidden role or ownership | UAT-S1-07 |
| State, history, persistence | UAT-S1-08, UAT-S1-09 |

| AC | Cases | | AC | Cases |
| --- | --- | --- | --- | --- |
| AC-01a | 01, 02 | | AC-06a, AC-06b | 06 |
| AC-01b | 02 | | AC-06d | 01, 06 |
| AC-01c, AC-01d | 02 (08 for 01d) | | AC-06e | 04 |
| AC-02a, AC-02b | 03 (02a also 01) | | AC-10b | 05 (API tool) |
| AC-02c | 07 | | AC-11 | 05 |
| AC-03a | 01, 09 | | AC-12a, AC-12b | 07 |
| AC-03b | 05 | | AC-13a, AC-13b | 01, 06 |
| AC-04a | 01, 06 | | AC-14a, AC-14b | 06 |
| AC-04b | 04 (API tool) | | AC-22a, AC-22b | 02, 07 |
| AC-23 | 04, 05 | | AC-24a | 08 |
| AC-27 | 09 | | AC-25 | 01 |

**Not covered here, and why**

- AC-01e (bcrypt hash) and AC-01f (malformed login bodies) cannot be seen from the UI; the automated suite covers them (`tests/integration/auth.test.ts`).
- AC-03c (repeat days and end date): only the day-of-week part is shown (UAT-S1-04); the end date is not exercised.
- AC-06c, AC-06f, AC-12c, AC-13c and AC-22c are covered by automated tests only.
- AC-10a (logDate today) is exercised implicitly by every Record action. AC-10b with a past date and the midnight rollover need a controlled clock and are not UAT cases.
- AC-24a needs a restart; step 5 of UAT-S1-08 depends on the Product Team.

--------------------------------------------------------------------------------

#### 4. Open items before handoff

1. Record the reset command for the deployed database, and confirm the live revision on the day of the run (the URL and revision above come from `deployment.md`, not from a check of the running service).
2. Reviewer check by Onsinee: run every case once on the deployed release and correct the expected text where the real UI wording differs. Wording quoted from `ui-spec.md` 0.8.0 and not seen in the running app: the empty Today state when everything is completed, "Add an exercise to your plan first", the 400 field messages, the History button label, and the label "Today's progress" (`ui-spec.md` 0.8.0 names it in its version row; the "Reps per set" label and My Plan wording were not checked either).
3. Confirm that Quick Complete after a 15-rep entry creates one 15-rep entry (the contract fixes the amount, not how it is split into sets).
