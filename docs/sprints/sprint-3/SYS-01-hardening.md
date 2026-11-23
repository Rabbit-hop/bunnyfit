### Feature Engineering Contract: SYS-01 System Hardening and Final NFR Verification
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  SYS-01 (system responsibility, not a user feature)
**Sprint:**  3 (work window 5 - 8 Dec 2026, plan §6.3; partial early runs allowed)
**Contract Version:**  0.1.1
**SRS Baseline Version:**  1.1.0 (Feature Inventory, RTM and System-Level SDS as on `staging/sprint-2`)
**Date:**  23 November 2026
**Status:**  Draft: concise contract for Deliverable 2 Part C. **No implementation is claimed**; the latency, access-matrix, validation and persistence runs over all routes are Sprint 3 work and have not been run for this document
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-3/SYS-01-hardening.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 23 Nov 2026 | Initial concise contract (issue #82): AC-21b, AC-24b and the extensions of AC-12c, AC-22c, AC-23; test files, measurement and check methods, what runs when, split with issues #75 and #78, STS, DoD, open questions | Nakagamon | Draft |
| **0.1.1** | 23 Nov 2026 | Changes after the review of PR #103 (Onsinee, 23 Nov, `afbf04a`), checked against the repository first: (1) `TEST-23-4` and the old-entry case removed: AC-23's three cases are owned by F-04 (`TEST-23-1..4`), F-05 (`TEST-23-5..8`) and F-11; SYS-01 only checks in the final run that they are enabled and pass (§3.4, §7, §8, DoD 5); (2) §7 separates RTM text from sentences added by SYS-01; (3) §3.1, `TEST-21b-1`, `TEST-21b-3`: the route list is a hand-written table keyed by registry route with a request factory, a per-route token and an assertion of the expected success status of every timed request, plus the guard test; preparation of consumed resources stated (review item 5); (4) §13 items 1, 2, 4, 5 record the reviewer's proposals (dataset, warm-up and environment as the #75 runner; a reminder as AC-24b marker) as proposals, not decisions | Nakagamon | Draft |

*Rule: later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
SYS-01 finally verifies NFR-01 to NFR-04 and BR-04 on the integrated product (Feature Inventory SYS-01). It adds **no user-facing behavior and no table**; its output is tests, run records and, if a target is missed, defects.

| In scope | Out of scope |
| ------ | ------ |
| AC-21b: p95 latency of every protected route (login separately) | Fixing a missed target by loosening the threshold (plan R7: report the figure, open a defect) |
| AC-24b: data still retrievable after redeployment on GCP; restart check across the final route set | Sprint 1 AC-24a (already PASS, F-04) |
| Extension of AC-12c / AC-22c to every route added in Sprints 2 and 3 | Per-feature AC owned by F-05, F-07, F-08, F-09, F-10, F-11 (their own contracts) |
| Extension of AC-23 to Sprint 2 and 3 validation cases | New business rules |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement | AC | Test file (RTM §2 / §3.1) |
| ------ | ------ | ------ |
| NFR-01 | AC-21b (AC-21a is Sprint 2, owner F-06) | `tests/performance/latency.test.ts` |
| NFR-04 | AC-24b (AC-24a is Sprint 1, F-04) | `tests/integration/persistence.test.ts` |
| NFR-02, BR-04 | AC-12c, AC-22c (extended) | `tests/integration/security_access.test.ts` |
| NFR-03 | AC-23 (extended) | `tests/e2e/validation_feedback.spec.ts` |

**Depends on:** F-01 to F-11 merged on the candidate commit (Feature Inventory). Routes are those in the SDS §5 catalog.

**Already covered or owned elsewhere (read from issues #75 and #78 on 23 Nov 2026):**
| Item | Issue | Relation to SYS-01 |
| ------ | ------ | ------ |
| AC-21a: `tests/performance/latency.test.ts`, p95 < 500 ms at 50 concurrency on progress and ledger endpoints, login separately (p95 < 1,000 ms), record environment and the number | #75 Part 3 (target Fri 27 Nov) | SYS-01 **extends the same file** to all protected routes (AC-21b); the runner, seed dataset and recording format come from #75 and are not re-specified |
| AC-15, AC-06g (`GET /api/progress/monthly`), AC-02d, AC-04c/d, AC-10c | #75 Parts 1 and 2 | Not SYS-01; `GET /api/progress/monthly` is one of the routes measured by AC-21b |
| Access Matrix rows and registry policies for `PUT /api/plan-items/:id`, `PUT/DELETE /api/entries/:id`, `GET/PUT /api/profile`, `GET /api/progress/monthly`, `GET /api/history`, `GET /api/streak`; 401 / 403 Manager / 403 foreign owner or foreign `userId` / 404 unknown id; nothing changed after a rejected write; a red run proving the generic test fails without a policy | #78 Part 1 (target Fri 27 Nov) | SYS-01 owns the **Sprint 3 remainder**: rows for F-09 and F-10 routes and the final "every registered route is in the matrix" run |
| Sprint 2 integration, regression, AC-25 continuity | #78 Part 2 | Not SYS-01 |

This contract does not claim that #75 or #78 are done; both are open.

--------------------------------------------------------------------------------

#### 3. Feature Design (Verification Design)
##### 3.1 Measurement method: latency (AC-21b)
Values below are from SRS NFR-01, RTM AC-21b and SDS §10 text; anything not in those documents is under §13.
| Item | Specification |
| ------ | ------ |
| Routes measured | **All protected routes** in the registry (every route except the public `GET /api/health`); the benchmark list is a **hand-written table keyed by registry route** (method and path), each entry with a request factory, the role/token to use and the expected success status; a guard test fails if a registry route has no table entry (`TEST-21b-3`); a registry cannot generate valid bodies or ids, so a generated list is not claimed; `POST /api/auth/login` is measured **separately** |
| Load per route | At least 500 requests per route at concurrency 50 (NFR-01) |
| Statistic and threshold | p95 per route; each protected route p95 < 500 ms; login p95 < 1,000 ms (AC-21b) |
| Dataset | A seeded database whose size is **documented in the run record** (NFR-01); the F-06 §5 dataset (3 Participants, 8 plan items each, 30 days of entries) is the starting point, see §13 |
| Runner | Supertest / Vitest benchmark runner (NFR-01 verification column), in `tests/performance/latency.test.ts`; on demand or on the release PR (SDS §9.3) |
| Request validity | Write routes use valid bodies and distinct exercises per request so limit rejections do not distort timing (as F-06 STS TEST-21a-3). Routes that consume a resource or token (`DELETE /api/entries/:id`, `PUT/DELETE /api/reminders/:id`, `POST /api/auth/logout`) get one prepared resource or token per request (500 each) created before the timed run; `PUT /api/plan-items/:id` creates a version per call and is timed on a fresh item per request. Manager-only routes (`POST/PUT/DELETE /api/categories`, `/api/templates`) use the Manager token. **Every timed request asserts its expected success status** (as the AC-21a runner counts failures); a fast 4xx must not pass |
| Record | Per route: requests, concurrency, p95, dataset size, environment, run date, commit. The number is recorded, not only pass/fail |
| Miss | Report the figure and open a defect; the threshold is not changed |

##### 3.2 Persistence check method (AC-24b, NFR-04)
| Check | Method |
| ------ | ------ |
| Restart (final route set) | Extends the AC-24a approach in `tests/integration/persistence.test.ts` (a new app instance and database connection against the same database, as the existing restart tests do): create data through the Sprint 2 and 3 features (plan version from F-07, edited entry from F-05, profile weight, reminder from F-09), restart, read it back through the API |
| Redeploy on GCP (AC-24b) | A post-deployment check after a release deployment (SDS §9.3, §9.4): before the deployment write a marker record through the API with a known Participant, deploy the release commit (migrations run as a pipeline step), then read the marker back through the deployed service. The existing smoke check (`GET /api/health`, login, one persisted read) is the minimum; AC-24b adds that **previously saved** data is still retrievable |
| Where it runs | The restart test runs in Vitest against the test database; the redeploy check is a post-deployment procedure against GCP and is recorded as evidence (command output, run date, tag and commit), not as a CI unit test |

##### 3.3 Access Matrix extension (AC-12c, AC-22c)
- The registry (`method`, `path`, roles, ownership, feature ID; SDS §6.3) is the single source. AC-22c asserts for every registered route: no token → 401, wrong role → 403; AC-12c asserts for every owner-scoped route: another user → 403. Both fail if a registered route has no policy or no matrix entry.
- Routes to be present at the final run (SDS §5 catalog): the Sprint 1 routes, plus the Sprint 2 routes (`PUT /api/plan-items/:id`, `PUT/DELETE /api/entries/:id`, `GET/PUT /api/profile`, `GET /api/progress/monthly`, `GET /api/history`, `GET /api/streak`, the F-11 calorie fields add no route) and the Sprint 3 routes (`GET /api/schedule`, `GET/POST /api/reminders`, `PUT/DELETE /api/reminders/:id`, `GET /api/summary`).
- Self-scoped routes also reject a foreign `userId` query parameter with 403 (SDS §5.1).
- A rejected write leaves the database unchanged (asserted for write routes).

##### 3.4 Validation feedback extension (AC-23)
RTM AC-23 already lists three cases (sets 21, Quick Complete on a Rest Day, editing an old entry), and each is owned elsewhere: Sprint 1 covers `TEST-23-1` and `TEST-23-3` (and the `LOG_DATE_MISMATCH` notice `TEST-23-2`); `TEST-23-4` is reserved by F-04 for the weight case on the Profile screen; the old-entry case is F-05 `TEST-23-5` to `TEST-23-8` (the 409 is forced through the API request context because the UI has no edit/delete icon for an old entry). **SYS-01 adds no AC-23 test and no `TEST-23-n` id.** In the final run it only checks that all three RTM cases and the F-04 and F-11 cases are enabled and pass. Further cases (reminder fields) depend on F-09 and are listed in §13.

##### 3.5 What is run when
| When | What |
| ------ | ------ |
| Per PR (CI, SDS §9.3) | Access Matrix tests (`security_access.test.ts`) and restart test (`persistence.test.ts`), because they are Vitest tests with the test database |
| Sprint 2 (issues #75, #78) | AC-21a on progress and ledger endpoints; matrix rows for the Sprint 2 routes |
| Sprint 3, 30 Nov - 4 Dec | Matrix rows for F-09 and F-10 routes as those features merge |
| Sprint 3, 5 - 8 Dec (plan §6.3) | Full AC-21b run on the integrated candidate; final check of the AC-23 Playwright cases; restart test over the final route set |
| Release (Fri 11 Dec) | Release PR with all of the above recorded; deployment of `final-v1.0.0`; AC-24b post-deployment check |

--------------------------------------------------------------------------------

#### 4. API Specification
No new endpoint. (`GET /api/health` already exists, SDS §5, and is public.)

#### 5. Data Specification
No schema change. A benchmark seed of documented size is built by test setup (not by the production seed); the production seed keeps satisfying SRS Appendix A.6.

#### 6. UI Specification
No new screen. AC-23 checks existing screens (§3.4).

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
RTM text is copied from RTM §3 (`docs/traceability.md`); sentences marked *added by SYS-01* are not in the RTM. AC-21b carries an added parenthesis "(as AC-21a: ≥ 500 requests, 50 concurrent, seed dataset size stated)": fine in content but not verbatim.

| AC | Observable outcome |
| ------ | ------ |
| **AC-21b** | Sprint 3: all protected endpoints under the same conditions (as AC-21a: ≥ 500 requests, 50 concurrent, seed dataset size stated) → p95 < 500 ms each; `POST /api/auth/login` is measured separately with p95 < 1,000 ms. |
| **AC-24b** | After redeployment on GCP (Final), the same data is still retrievable (post-deployment check). |
| **AC-12c** *(extension)* | Endpoint Access Matrix (owner dimension): for every owner-scoped route in the matrix, a request by a different user → 403. *Added by SYS-01:* the matrix includes every Sprint 2 and Sprint 3 route. |
| **AC-22c** *(extension)* | Endpoint Access Matrix (role dimension): for every route in the matrix, no token → 401 and wrong role → 403; a registry test fails if any registered route is missing from the matrix. The matrix grows per sprint (S2: F-05, F-07, F-08, F-11; S3: F-09, F-10). |
| **AC-23** | The UI shows error notices naming the field and limit in at least 3 cases: sets 21, Quick Complete disabled on a Rest Day, editing an old entry. *Tracked by F-04, F-05 and F-11; SYS-01 only checks in the final run that these cases are enabled and pass (§3.4). No extension is added.* |

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
| Test ID | AC | Level | Precondition / Input | Action | Expected result |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `TEST-21b-1` | AC-21b | Performance | Seeded dataset of documented size; benchmark table keyed by registry route (request factory, Participant or Manager token as the route requires, prepared resources for consuming routes) | 500 requests at concurrency 50 on each protected route (valid bodies); every timed request asserts the expected success status | p95 < 500 ms per route, no unexpected status; table of route, p95, dataset size, environment, date, commit recorded |
| `TEST-21b-2` | AC-21b | Performance | Same | 500 requests at concurrency 50 on `POST /api/auth/login` | p95 < 1,000 ms, recorded separately |
| `TEST-21b-3` | AC-21b | Performance | A protected route is added to the registry but not to the benchmark table (temporary probe) | Run the guard test | The test fails (no route skipped); red run recorded once |
| `TEST-24b-1` | AC-24b | Persistence | Final route set: data created through F-05, F-07, F-09 and profile features; new app instance and database connection | Read the data back through the API | All rows intact (extends AC-24a restart checks) |
| `TEST-24b-2` | AC-24b | Persistence (post-deployment) | Marker data written through the API before deployment of the release commit | Deploy; read the marker through the deployed service | Marker retrievable; evidence recorded (not a CI unit test, §3.2) |
| `TEST-12c-3` | AC-12c | Security | Registry with all Sprint 2 and 3 owner-scoped routes (`PUT /api/plan-items/:id`, `PUT/DELETE /api/entries/:id`, `PUT/DELETE /api/reminders/:id`) | Request by another Participant | 403 each; database unchanged after a rejected write; unknown id → 404 |
| `TEST-12c-4` | AC-12c | Security | Self-scoped routes (`profile`, `progress/monthly`, `history`, `streak`, `schedule`, `reminders`, `summary`) | `?userId=<other>` | 403 each; no foreign data |
| `TEST-22c-3` | AC-22c | Security | Registry lists Sprint 2 and 3 routes | No token; then Manager token on each | 401; then 403 |
| `TEST-22c-4` | AC-22c | Security | A route is registered without a matrix entry (temporary probe) | Run the registry test | The test fails; red run recorded once |

**Coverage check.** Every AC and extension in §7 has at least one test, except AC-23, whose tests belong to F-04, F-05 and F-11. The numbered IDs (`-1` and above) are children of the RTM IDs (`TEST-21b`, `TEST-24b`, `TEST-12c`, `TEST-22c`) in the same files; the numbers `TEST-12c-3/-4` and `TEST-22c-3/-4` may collide with those issue #78 uses for the Sprint 2 rows; existing `-1`/`-2` cases of AC-12c / AC-22c / AC-23 keep their numbers, so final numbering is set at implementation and recorded in RTM §3.1.

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content |
| ------ | ------ | ------ |
| 1 | `docs` | This contract (spec-only) |
| 2 | `test` (red) | Matrix probe (TEST-22c-4) and benchmark route-list guard (TEST-21b-3) failing for a missing entry |
| 3 | `test` / `feat` | Matrix rows and registry policies per sprint (with #78 for Sprint 2 routes) |
| 4 | `test` | Full latency run on the candidate; record the table; defects for misses |
| 5 | `test` | Restart test over the final route set; final check that the AC-23 cases of F-04, F-05 and F-11 are enabled and pass |
| 6 | release | Post-deployment AC-24b check on `final-v1.0.0` |

--------------------------------------------------------------------------------

#### 10. Definition of Done for SYS-01
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed before the Sprint 3 hardening work | Review comment; commit order |
| 2 | Matrix test lists every registered route (Sprints 1 - 3) and passes; a red run shows it fails when a route lacks a policy | Test output with commit ID |
| 3 | Latency table for all protected routes and login with p95, dataset size, environment, run date, commit; every row meets its threshold or has an open defect | Output of `latency.test.ts` |
| 4 | Restart test over the final route set passes on the merge commit | Counts: passed / failed / skipped |
| 5 | In the final run all AC-23 cases owned by F-04, F-05 and F-11 are enabled and passing (none added by SYS-01) | Playwright output |
| 6 | AC-24b post-deployment check on the deployed `final-v1.0.0` | Command output, run date, tag, commit |
| 7 | RTM §3.1 rows (AC-12c, AC-21b, AC-22c, AC-23, AC-24b) updated with actual results and commits; failures disclosed | Updated register |
| 8 | No test weakened and no threshold changed to pass | Diff review |

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Note |
| ------ | ------ |
| F-01 route registry, `requireRole`, envelope | The matrix is generated from it |
| F-05, F-07, F-08, F-11 (Sprint 2), F-09, F-10 (Sprint 3) | Each adds routes or behavior this contract verifies; their contracts own the functional AC |
| Issues #75 and #78 | Provide the AC-21a runner and Sprint 2 matrix rows (§2) |
| Lab 5 deployment (`docs/labs/lab-05/deployment.md`, README deploy section) | Pipeline and smoke check used by AC-24b |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
None identified. If the open questions below lead to a change in SRS NFR-01 / NFR-04 wording or in the RTM, that is a revision row in those documents, not a silent edit here.

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | AC-21b says "same conditions" as AC-21a but gives no dataset size; NFR-01 says "documented". Which size is used for the final run? | Open. Reviewer's proposal (her #75 runner on an unpushed local branch, not read by me): 3 Participants × 8 plan items × 30 days × 3 entries (720 entries each); "same as #75" instead of "to be decided". Decision by both members |
| 2 | Environment of the latency run (local machine, CI runner or Cloud Run) is not specified in SRS/RTM/SDS | Open; the run record must state it. Reviewer's proposal: in-process HTTP server and PostgreSQL in docker on the same machine, as #75. Risk she reports (one machine, unpublished, not verified by me): AC-21a registered FAIL on her branch for `POST /api/auth/login` (p95 about 4,000 ms against 1,000, `BCRYPT_COST` 10); AC-21b adds every other route and F-10, whose Streak read grows with plan age. If a target is missed a defect is opened and the threshold is not loosened |
| 3 | SDS §9.3 lists the latency benchmark as "on demand / release PR", not on every PR | As in SDS; matrix and restart tests are the per-PR part (§3.5) |
| 4 | Number of warm-up requests, if any, and whether write routes share the database with the read run | Not in the docs; reviewer's proposal: 20 unmeasured warm-up requests as in #75 (proposal only) |
| 5 | AC-24b method: how the marker record is created and removed on the deployed GCP database | Open. The existing smoke check logs in with a read-only account and reads `/api/categories` (shared catalog), so it cannot show that Participant data survived, and a read-only account cannot write a marker. Reviewer's suggestion: a reminder created by a dedicated participant account and deleted after the check (old entries cannot be edited, `WeightLog` is append-only, plan items are versioned); `deployment.md` §7.2 left a plan item and an exercise as precedent. Not decided here; needs F-09 and both members |
| 6 | Which Sprint 2/3 validation cases beyond "edit an old entry" count for AC-23 (profile weight limits, reminder fields) | Open until the F-11 and F-09 contracts are approved |
| 7 | RTM §3.1 shows the AC-12c / AC-22c Sprint 1 matrix as PASS; the Sprint 2 rows are #78 and not yet run | Disclosed here; no claim made |
| 8 | Dependence on parallel contracts (F-08, F-11, F-09) not yet read when this was written | Route names taken from SDS §5 only |
