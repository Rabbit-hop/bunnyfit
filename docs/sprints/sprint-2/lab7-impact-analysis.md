### Lab 7 Impact Analysis: category name length 50 → 30
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Issue:**  #89 (Part 2, impact analysis and revised contract)
**Document Version:**  0.1.0
**Date:**  24 November 2026
**Status:**  Draft (review-pending). Reviewer: Onsinee. Spec only: no code and no test is changed by this document or by the commits that carry it
**Primary Author:**  Nakagamon
**Repository Path:**  `docs/sprints/sprint-2/lab7-impact-analysis.md`

--------------------------------------------------------------------------------

#### Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 24 Nov 2026 | Initial impact analysis of the Lab 7 change. Code and document locations were found with `git grep` on `origin/staging/sprint-2` at `df5896e` (the Sprint 1 release tag `sprint1-v1.0.0` is `bf57652`); no test was run | Nakagamon | Draft |

--------------------------------------------------------------------------------

#### 1. The change in one table (quote-ready)
| | Old rule (accepted baseline, SRS 1.1.0 Q30, F-02 0.3.0 R2) | New rule (SRS 1.1.1, F-02 0.4.0 R2, AC-02e) |
| ------ | ------ | ------ |
| Text | "A category name is trimmed, 1–50 characters and unique case-insensitively." | "A category name is trimmed, 1–30 characters and unique case-insensitively." |
| 30 characters | accepted | accepted |
| 31 to 50 characters | accepted (201 / 200) | 400 `VALIDATION_ERROR` naming `name`, limit `1-30 characters`; nothing stored |
| 51 or more characters | 400 | 400 |
| Existing category with more than 30 characters | n/a | stays valid and is returned unchanged; the limit applies when a name is written (create or rename) |

**Approval.** The team reports that the instructor answered that the approval question can be ignored and the team should proceed with its own decision. The approver, date and verbatim reply are recorded in issue #89 by the team; **this document does not quote them**, and the approval has not been verified by the author of this file.

**Reason.** Category names are used as headings and filters on several screens, and a very long name makes them hard to read. This is the author's reason; no baseline document states it, and the layout was not measured.

--------------------------------------------------------------------------------

#### 2. Impact table
Requirement and document column: where the rule or a number derived from it is written. Code column: every place that holds the rule (all found with `git grep` on `df5896e`).

| Area | Item | Location | Effect | Edited by |
| ------ | ------ | ------ | ------ | ------ |
| Requirement | FR-02 (manage categories and base templates); SRS Q30 | `docs/srs.md` Q30 (line 206) | text 1–50 → 1–30 | SRS 1.1.1 (this PR) |
| Feature | F-02 Activity Category & Base Exercise Management | `docs/sprints/sprint-1/F-02-exercise-library.md` R2 (line 65), §3.3, §6, §7, §8, §12, §13 | rule, failure rows, UI note, AC-02e, STS TEST-02e-1…6 | F-02 0.4.0 (this PR) |
| System SDS | none: the System SDS does not state the category name length | `docs/system-sds.md` (`grep -i category` on the file shows the Category entity row, line 184: "`name` unique; grouping label only", with no length) | none | - |
| API spec | `POST` / `PUT /api/categories` rule line | `docs/sprints/sprint-1/api-spec.md` §4.1 (line 365) and traceability row (line 627) | rule text and AC list | api-spec 0.6.4 (this PR) |
| UI spec | category name input | `docs/sprints/sprint-1/ui-spec.md`: no category length stated (line 250 is the template form: name 1–80, body part 1–50) | none; the F-02 §6 note carries the `maxLength` | - |
| RTM | FR-02 row, §3 counts, §3.1 register | `docs/traceability.md` | AC-02e added, PLANNED; counts 46 → 47 and 80 → 81 | RTM 1.1.15 (this PR) |
| Acceptance criteria | new **AC-02e**; AC-02a, 02b, 02c, 02d unchanged | F-02 §7, RTM FR-02 | see §3 of this file | this PR |
| STS test IDs | new TEST-02e-1 … 02e-6 (+ supplementary SUP-02e-7) | `tests/integration/manager_template.test.ts` (the RTM path of AC-02) | to be written in the red-test commit, not in this PR | #91 |
| Code: server | `validateCategoryBody`: `name.length > 50`, limit text `1-50 characters`, comment "1-50 characters" | `server/domain/libraryValidation.ts:4,17` | constant 50 → 30 in the condition, the limit text and the comment | #91 |
| Code: web | `maxLength={50}` on "New category name" and on the inline rename input | `web/src/pages/LibraryPage.tsx:425,457` | 50 → 30 | #91 |
| Code: not changed | `maxLength={50}` on **body part** inputs | `web/src/components/AddExerciseDialog.tsx:547`, `web/src/components/TemplateDialog.tsx:248` | none (different field, `targetBodyPart` stays 1–50) | - |
| Callers | `validateCategoryBody` is called by `POST /api/categories` and `PUT /api/categories/:id` only | `server/routes/library.ts:57,70` | both routes pick up the new limit through the one function; no other validator, Quick Complete, scoring or progress code reads a category name | - |
| Roles / ownership | Manager only for writes; Participant write → 403 before validation; Participant read allowed | F-02 R1, route policies | unchanged | - |
| Persistence | `Category.name` is `TEXT NOT NULL` with unique indexes `Category_name_key` and `Category_name_lower_key` (`lower(name)`); no length CHECK | `prisma/migrations/0001_init/migration.sql:42,157,226`, `prisma/schema.prisma` model `Category` | **no migration**: nothing in the database states 50; a new CHECK would not be needed and would break rows longer than 30 | - |
| Historical data | categories already stored with more than 30 characters | seed names have at most 15 characters (`prisma/seed.ts:30`); the deployed database was **not** read | stay valid; they cannot be re-saved under the same name through `PUT` if longer than 30 (a rename needs a valid new name) | recorded in F-02 §13 item 6 |
| Existing tests | none checks a category name of 30, 31, 50 or 51 characters; the category names used by tests are short (`Mobility`, `Mobility & Stretch`, `Disposable`, `Mobility Extra`, `F03 Range`, `F03 Snapshot`, `E2E Cat <stamp>`, `Persistence Category <UUID>`, 58 characters, inserted through Prisma and never sent to the API) | `tests/integration/manager_template.test.ts`, `goal_config.test.ts`, `template_snapshot.test.ts`, `persistence.test.ts`, `tests/e2e/library_ui.spec.ts` | no existing expectation changes: every category name that is sent through the API is shorter than 30 characters; the 58-character name of `persistence.test.ts` is written with Prisma (`persistence.test.ts:23,64-66`), bypasses the validator and is read back by the test, so it is unaffected, and it already shows that the database accepts a name longer than 30 | - |
| Documents that do not state the rule | `docs/features.md`, `docs/sprints/plan.md`, F-03, F-04, F-05, F-06, F-07, F-08, F-10, F-11, SYS-01 | `git grep` for "50" and "category name" | none | - |

--------------------------------------------------------------------------------

#### 3. Acceptance criterion and tests (summary; the rows are in F-02 §7–§8)
| ID | Statement | Boundaries and invalid cases |
| ------ | ------ | ------ |
| **AC-02e** | A category name is trimmed and 1–30 characters; 31 or more (including 50) → 400 `VALIDATION_ERROR` naming `name`, nothing stored; 30 accepted; empty / whitespace-only → 400; Participant → 403, database unchanged; existing longer names stay readable | 1, 29, 30 (accepted); 31, 50, 51, 100 (rejected); 30 with surrounding spaces (accepted, trimmed); 31 with surrounding spaces, empty, whitespace only, non-string (rejected); 40-character existing row |

| Test | What it proves | Rule / role |
| ------ | ------ | ------ |
| TEST-02e-1 | create with 1, 29, 30 characters → 201 | R2, Manager |
| TEST-02e-2 | create with 31, 50, 51, 100 → 400, nothing stored | R2, Manager |
| TEST-02e-3 | rename to 30 → 200; to 31 and 50 → 400, row unchanged | R2, Manager |
| TEST-02e-4 | trim case and invalid values | R2, Manager |
| TEST-02e-5 | Participant → 403 for 30 and 31 characters, database unchanged | R1, Participant |
| TEST-02e-6 | existing 40-character name stays listed; rename rules | existing data |

--------------------------------------------------------------------------------

#### 4. Unchanged behaviour and the tests that protect it
| Behaviour that must not change | Protecting test (existing) |
| ------ | ------ |
| Manager creates a category with an ordinary name → 201 | TEST-02a-1 (`"Mobility"`) |
| Manager renames a category → 200 | TEST-02b-1 (`"Mobility & Stretch"`, 18 characters) |
| Manager deletes an empty category → 204; unknown id → 404 | TEST-02b-3, TEST-02b-5 |
| Participant and Manager can read categories; seeded categories present | TEST-02c-1 |
| Participant cannot create, rename or delete a category → 403, database unchanged | TEST-02c-2 and the policy cases in `security_access.test.ts` (AC-12c, AC-22c) |
| No token → 401 | TEST-02c-3 |
| Template name 1–80 and `targetBodyPart` 1–50 | TEST-02d-4, 02d-6 are Sprint 2 (deferred, AC-02d); the existing unit boundary cases in `tests/unit/boundary_validation.test.ts` |
| Case-insensitive uniqueness of category names | the database index `Category_name_lower_key`; its API test is AC-02d (deferred, not part of this change) |
| Categories used by other tests keep working | `goal_config.test.ts`, `template_snapshot.test.ts` and `library_ui.spec.ts` create categories with names shorter than 30 characters; `persistence.test.ts` inserts a 58-character name directly with Prisma, not through the API |
| UI: Manager adds and renames a category | `tests/e2e/library_ui.spec.ts` (AC-02a/b UI journey) |

Open points about the table:
1. The regression run proposed for #91 is the unit suite plus `manager_template.test.ts`, `security_access.test.ts`, `template_snapshot.test.ts`, `goal_config.test.ts`, `persistence.test.ts`, and the library E2E; **nothing here has been run**.
2. `library_ui.spec.ts` names the category `E2E Cat <Date.now().toString(36)>`; the base-36 stamp has about 8 characters, so the name is about 16 characters. I did not execute it.

--------------------------------------------------------------------------------

#### 5. Risks and open questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | The approval text (approver, date, verbatim reply) is not in this repository yet | The team records it in issue #89; this PR does not claim it |
| 2 | Deployed database: a category already longer than 30 characters is possible and was not checked | F-02 §13 item 6; check before the release (#80) and record the result in #89 |
| 3 | The number 30 and the reason are the author's choice; Onsinee has not confirmed them | Reviewer decision on this PR |
| 4 | AC-02e adds one AC (RTM counts 46 → 47, 80 → 81); a reviewer may prefer a smaller footprint | Alternative: extend AC-02a/02b wording instead of a new AC; not chosen because the Lab 7 handout asks for an explicit criterion with its own boundaries |
| 5 | AC-02d (deferred) will test duplicate category names; it does not mention length | no overlap with AC-02e |
| 6 | The Lab 7 change must ride the Sprint 2 release (plan 1.3.0 §5.5, issue #91) | the red test is written only after this PR is approved |
