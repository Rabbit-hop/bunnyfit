# Sprint 1 Contract Approval Register

**Purpose:** record, per contract, which version has a reviewer approval and where it can be read. A cell says "explicit" only when the review text names that document or version. Anything else is stated as not recorded. Issue: #11.

**Reviewer:** Onsinee (GitHub `justfepwx12`). **Author of all five contracts:** Nakagamon (`fahsai-02`).

**Document version:** 0.1.8 · **Date:** 11 November 2026 · **Status:** Draft: F-01–F-04 (PR #24 reply) and F-06 v0.3.1 (PR #24 reply, 14:57 UTC) approved; F-03 v0.3.1 (PR #27 review fixes B1/B2) has no approval yet; F-04 v0.3.1 approved by the PR #28 review at `0ff22bd` (11 Nov 2026, 01:11 +07); waiting for the reviewer's all-approved five-line reply

## 1. Evidence on GitHub (read 8 Nov 2026)

| Ref | State | Reviewed commit | What the review text says about contracts |
| --- | --- | --- | --- |
| PR #13 review, 6 Nov 2026 13:25 UTC | APPROVED | `177a533` | Re-reviewed only the diff `2395581..177a533` (9 docs files). Names these contract points: F-01 AC-01c wording, F-01 skipped 0.2.0, F-03 AC-25 dependency, plan §8 ownership vs "the contract headers". Does not name F-02 or F-04 by file or version. Names F-06 only as a non-blocking nit: `F-06-progress-display.md:213` still says "AC-23 is owned by F-04" |
| PR #13 merge | MERGED 6 Nov 2026 15:20 UTC | `c6126dd` | Brought the five contracts at v0.3.0 into `staging/sprint-1` |
| PR #19 review, 8 Nov 2026 15:15 UTC | APPROVED | `5b66192` | Lists "Docs approved with this PR": F-01 contract v0.3.1–v0.3.7, RTM 1.1.1, SDS 1.1.1. Also approves api-spec v0.6.1 and v0.6.2 |
| PR #19 merge | MERGED 8 Nov 2026 15:16 UTC | `548407c` | Merge commit; parents `c4368e5` and `5b66192` |

## 2. Register

| Contract | Version in `staging/sprint-1` | Header Status in the file | Approval recorded | Not recorded |
| --- | --- | --- | --- | --- |
| F-01 `F-01-authentication.md` | 0.3.7 | Approved (v0.3.0 and v0.3.1–v0.3.7) | v0.3.0: PR #13 approval at `177a533` (F-01 points named). v0.3.1–v0.3.7: explicit in the PR #19 approval at `5b66192` and in the PR #24 reply `F-01 v0.3.1-v0.3.7: approved` | None |
| F-02 `F-02-exercise-library.md` | 0.3.0 | Approved (PR #24 reply) | PR #24 reply, 9 Nov 2026: `F-02 v0.3.0: approved` (earlier PR #13 approval did not name this file) | None |
| F-03 `F-03-goal-setting.md` | 0.3.1 (in `staging/sprint-1` since the PR #27 merge `179c66f`; commit `1e16eb7`) | Approved (v0.3.0, PR #24 reply); v0.3.1 not reviewed | PR #24 reply, 9 Nov 2026: `F-03 v0.3.0: approved` (that approval covers the text at `de59dcf`, i.e. v0.3.0) | **v0.3.1** — the §4.7 `resolvePlan` signature and the §5.2 migration statement changed in `1e16eb7` (PR #27 B1/B2); no review line exists for it. Needs re-review by Onsinee |
| F-04 `F-04-daily-logging.md` | 0.3.1 (in `staging/sprint-1` since the PR #28 merge `704209a`) | Approved (v0.3.0, PR #24 reply; v0.3.1, PR #28 review at `0ff22bd`) | PR #24 reply, 9 Nov 2026: `F-04 v0.3.0: approved`; PR #28 review, 10 Nov 2026 18:11 UTC: `F-04 v0.3.1: approved` | **v0.3.1** — documentation-only (PR #28 review fixes: `resolvePlan` before the row lock, §5.2 stale against the seed). Reviewer read the 0.3.0 → 0.3.1 diff |
| F-06 `F-06-progress-display.md` | 0.3.1 (in `staging/sprint-1` since the PR #24 merge `139625f`; the cell earlier read "not yet in staging") | Approved (v0.3.1) | PR #24 reply, 9 Nov 2026 13:27 UTC: `F-06 v0.3.0: changes needed` (two test rows); PR #24 reply, 14:57 UTC: `F-06 v0.3.1: approved` after re-reading the diff at `27dd0c5` | None. v0.3.0 itself is not approved |

The specification content (AC, STS, API, feature SDS) of F-02 and F-04 has not changed since the approved commit `177a533`: `git diff 177a533 de59dcf` on those two files shows only the `Status` line and revision rows added for the approvals above (3 lines added, 1 removed per file). Last commit that changed their content: F-02 `2395581`, F-04 `177a533`. **F-03 did change after its approval:** v0.3.1 (`1e16eb7`, PR #27) rewrites §4.7 (the `resolvePlan(plans, userId, date)` signature) and §5.2 plus the §5.1/§9/§10 lines about the migration, so that the contract describes the implemented code — documentation-only (no AC, STS or schema line changed), and **no approval is recorded for 0.3.1** (row above). F-06 changed after `177a533`: its two test rows, header and revision row in v0.3.1 (`27dd0c5`, approved above); before that it was last changed in `2395581`. The PR #13 approval at `177a533` re-reviewed only the diff `2395581..177a533`, so what it covers is the text at `177a533`.

### 2.1 Reviewer's replies, 9 Nov 2026

#### 2.1.1 Reply on PR #24 (issuecomment-6741224888, 13:27 UTC, GitHub)

The reviewer replied in the section 3 format, after reading all five files in full at `548407c`:

```text
F-01 v0.3.1-v0.3.7: approved
F-02 v0.3.0: approved
F-03 v0.3.0: approved
F-04 v0.3.0: approved
F-06 v0.3.0: changes needed - F-06-progress-display.md:237 ... F-06-progress-display.md:238 ...
```

This is the evidence for F-01–F-04 (the headers and revision rows of those four files cite it). The F-06 line asks for the same two changes as the chat reply below; they are applied in F-06 v0.3.1 (`27dd0c5`).

#### 2.1.1a Reply on PR #24 (issuecomment-6743198059, 14:57 UTC, GitHub)

```text
F-06 v0.3.1: approved
```

The reviewer verified the full diff at `27dd0c5` against both findings and found the header, revision row and §9 step 1 consistent. F-06 `Status` and revision row are updated from this reply. The reviewer also asked for the §2 line 28 wording fix (done in 0.1.4) and said the all-approved five-line reply follows the commit that records this.

#### 2.1.2 Earlier private chat reply (relayed by the author, not on GitHub; superseded by 2.1.1)

The reviewer sent this to the author in a private chat and said they will post it on PR #24 themselves. It is **not** in the five-line format of section 3 and names no contract version except v0.3.0 for F-06, so the headers of F-01–F-04 say "approval relayed" until the PR reply exists.

| Contract | Chat reply | Recorded as |
| --- | --- | --- |
| F-01, F-02, F-03, F-04 | "F-01/F-02/F-03/F-04 = approved" | Approved (headers and revision rows updated 9 Nov 2026) |
| F-06 v0.3.0 | Two changes needed (below) | v0.3.0 not approved; superseded by 2.1.1a (v0.3.1 approved) |

F-06 changes requested:

1. `F-06-progress-display.md:237` (TEST-06e-3): the Clock is fixed at 5 Nov (the STS header says "unless stated"; the row states nothing else), but the request is `?date=2026-11-10` (a future date) and expects 200 `isRestDay: true`. This contradicts R13, SRS Q47 (400 `VALIDATION_ERROR` for a future date) and TEST-06g-4 in the same contract. Fix: state that the Clock moves to Tue 2026-11-10, or use a past date (e.g. Tue 2026-11-03).
2. `F-06-progress-display.md:238` (TEST-06f-1): a Sprint 1 test for AC-06f (DoD #4 gives no exception) uses `PUT /api/profile`, a Sprint 2 endpoint (F-04 §4.5, CHANGE-04), so it cannot be implemented in Sprint 1. Fix: insert a `WeightLog` row directly (the schema exists from F-04; Alice has a seed row as fixture).

Status of these two changes: **applied** in F-06 v0.3.1 (`27dd0c5`): `TEST-06e-3` now requests the past date 2026-11-03 with the Clock at 2026-11-05; `TEST-06f-1` inserts a `WeightLog` row directly. Re-read and approved by the reviewer in 2.1.1a.

## 3. Request to the reviewer

A reply counts only if it is in the format below. A general "LGTM", "looks good" or an approve of the PR itself is **not** recorded as approval of any contract, because it does not name a file and a version.

**Before replying, open each contract file at the commit `548407c` (or `staging/sprint-1`) and read its feature SDS, ACs and STS sections.** F-03: its current version is **0.3.1** (in `staging/sprint-1` since the PR #27 merge `179c66f`), so read `docs/sprints/sprint-1/F-03-goal-setting.md` at `staging/sprint-1` — 0.3.1 differs from the approved 0.3.0 only in §4.7 (the `resolvePlan` signature) and the migration lines (§5.1, §5.2, §9 step 3, DoD #3). Do not reply from this register alone: the register only lists GitHub evidence, it does not show the contract text.

**Reply on this PR with exactly five lines**, one per contract, copying this format:

```text
F-01 v0.3.1-v0.3.7: approved
F-02 v0.3.0: approved
F-03 v0.3.1: approved
F-04 v0.3.1: approved
F-06 v0.3.1: approved
```

For any contract that is not approved, replace the line with `F-0x <version>: changes needed - <file>:<line> <what to change>` (use the version shown in section 2, not a fixed one). A `changes needed` line must name the file and line; one without them is not actionable.

Rules for recording the replies:

- The `F-01` line is the confirmation that v0.3.1-v0.3.7 (already approved in PR #19 at `5b66192`) may be recorded as `Approved`.
- Each line is recorded for exactly the file and version it names. A missing line is recorded as "no reply", not as approved.
- (Done for F-01–F-04 and F-06 v0.3.1, 9 Nov 2026.) When the five lines exist, a follow-up commit changes the `Status` line and adds a revision row to each approved contract, quoting the line and its date. Until then the headers stay `Draft`.

## 4. Revision history

| Version | Date | Description | Author | Status |
| --- | --- | --- | --- | --- |
| **0.1.0** | 8 Nov 2026 | First version: evidence read from PR #13 and PR #19 reviews and the current contract headers; no contract file is changed | Nakagamon | Draft |
| **0.1.1** | 9 Nov 2026 | Section 1: PR #13 row no longer says the review does not name F-06 (it names F-06 as a nit); section 3: fixed five-line reply format, reviewer must read the contract text first, unformatted replies not recorded (PR #24 review B1) | Nakagamon | Draft |
| **0.1.2** | 9 Nov 2026 | Section 2.1: reviewer's private-chat reply recorded (F-01–F-04 approved, F-06 two changes needed); F-01–F-04 headers and revision rows updated; F-06 left `Draft` | Nakagamon | Draft |
| **0.1.3** | 9 Nov 2026 | Section 2.1.1: the reviewer's five-line reply on PR #24 recorded (F-01–F-04 approved, F-06 v0.3.0 changes needed); section 2 rows updated; F-01–F-04 headers no longer say pending; F-06 two changes applied in v0.3.1 (`27dd0c5`), still `Draft` | Nakagamon | Draft |
| **0.1.4** | 9 Nov 2026 | Section 2.1.1a: reviewer's `F-06 v0.3.1: approved` recorded and F-06 header/revision row updated; section 2 F-06 row and the "have not changed since `177a533`" paragraph corrected (scoped to specification content, last-change commits named; PR #24 reviewer follow-up) | Nakagamon | Draft |
| **0.1.5** | 10 Nov 2026 | F-03 row: version `0.3.1` (commit `1e16eb7`, PR #27 branch), approval column now says only v0.3.0 is approved and v0.3.1 needs re-review. The "has not changed since `177a533`" paragraph no longer includes F-03 — §4.7 and the §5.2/§5.1/§9/§10 migration lines did change in `1e16eb7` (documentation-only) — and it says which approval covers F-03 (`de59dcf` / v0.3.0). F-06 version cell corrected: 0.3.1 has been in `staging/sprint-1` since the PR #24 merge `139625f`. Section 3 request format: the pending F-03 line is now `F-03 v0.3.1: approved` and it says where to read 0.3.1 (the PR #27 branch, until it merges); the pending F-06 line is `F-06 v0.3.1: approved` (0.3.0 was never approved, so the old example contradicted section 2.1.1a); the `changes needed` template takes the version from section 2 instead of a fixed `v0.3.0`. No contract file and no approval claim changed. | Nakagamon | Draft |
| **0.1.6** | 11 Nov 2026 | F-04 row: version `0.3.1`, approval column says only v0.3.0 is approved and v0.3.1 needs re-review (same treatment as F-03 v0.3.1). No approval line was added | Nakagamon | Draft |
| **0.1.7** | 11 Nov 2026 | Review nits from PR #28 re-review 2: header date and Status sentence now include F-04 v0.3.1; F-04 row records the approval of v0.3.1 (PR #28 review at `0ff22bd`, 10 Nov 2026 18:11 UTC); the §3 template line is `F-04 v0.3.1: approved`. The first five-line block (the 9 Nov PR #24 reply) is left as it was | Nakagamon | Draft |
| **0.1.8** | 11 Nov 2026 | Cells made current after the merges of PR #27 (`179c66f`), PR #28 (`704209a`) and PR #31 (`af286a9`): the F-03 and F-04 version cells no longer say "not yet in `staging/sprint-1`" (both 0.3.1 are in staging), and the §3 instruction for F-03 says to read it at `staging/sprint-1` instead of the PR #27 branch. **No approval claim changed:** F-03 v0.3.1 still has no recorded review line and still needs re-review by Onsinee; the all-approved five-line reply is still pending. No contract file changed. | Nakagamon | Draft |
