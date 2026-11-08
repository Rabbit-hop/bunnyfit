# Sprint 1 Contract Approval Register

**Purpose:** record, per contract, which version has a reviewer approval and where it can be read. A cell says "explicit" only when the review text names that document or version. Anything else is stated as not recorded. Issue: #11.

**Reviewer:** Onsinee (GitHub `justfepwx12`). **Author of all five contracts:** Nakagamon (`fahsai-02`).

**Document version:** 0.1.1 · **Date:** 8 November 2026 · **Status:** Draft: waiting for the reviewer's explicit reply (section 3)

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
| F-01 `F-01-authentication.md` | 0.3.7 | Approved (v0.3.0); v0.3.1–0.3.3 and v0.3.5–0.3.7 review-pending | v0.3.0: PR #13 approval at `177a533` (F-01 points named). v0.3.1–v0.3.7: explicit in the PR #19 approval at `5b66192` | The header still says review-pending for v0.3.1–0.3.3 and v0.3.5–0.3.7 |
| F-02 `F-02-exercise-library.md` | 0.3.0 | Draft | Only the PR #13 approval at `177a533`, which does not name this file | An explicit statement that F-02 v0.3.0 is approved |
| F-03 `F-03-goal-setting.md` | 0.3.0 | Draft | PR #13 approval at `177a533` names one F-03 point (AC-25 dependency wording) | An explicit statement that F-03 v0.3.0 is approved |
| F-04 `F-04-daily-logging.md` | 0.3.0 | Draft | Only the PR #13 approval at `177a533`, which does not name this file | An explicit statement that F-04 v0.3.0 is approved |
| F-06 `F-06-progress-display.md` | 0.3.0 | Draft | PR #13 approval at `177a533` names F-06 only as a nit (line 213) | An explicit statement that F-06 v0.3.0 is approved |

F-02, F-03, F-04 and F-06 have not changed since the approved commit `177a533` (`git diff 177a533 HEAD` on the four files is empty). `177a533` itself changed F-03 and F-04 (4 lines each, `git show --stat`); F-02 and F-06 were last changed in `2395581`. Their text at `177a533` is what the reviewer's approval covers, and the approval review says it re-read only the diff `2395581..177a533`.

## 3. Request to the reviewer

A reply counts only if it is in the format below. A general "LGTM", "looks good" or an approve of the PR itself is **not** recorded as approval of any contract, because it does not name a file and a version.

**Before replying, open each contract file at the commit `548407c` (or `staging/sprint-1`) and read its feature SDS, ACs and STS sections.** Do not reply from this register alone: the register only lists GitHub evidence, it does not show the contract text.

**Reply on this PR with exactly five lines**, one per contract, copying this format:

```text
F-01 v0.3.1-v0.3.7: approved
F-02 v0.3.0: approved
F-03 v0.3.0: approved
F-04 v0.3.0: approved
F-06 v0.3.0: approved
```

For any contract that is not approved, replace the line with `F-0x v0.3.0: changes needed - <file>:<line> <what to change>`. A `changes needed` line must name the file and line; one without them is not actionable.

Rules for recording the replies:

- The `F-01` line is the confirmation that v0.3.1-v0.3.7 (already approved in PR #19 at `5b66192`) may be recorded as `Approved`.
- Each line is recorded for exactly the file and version it names. A missing line is recorded as "no reply", not as approved.
- When the five lines exist, a follow-up commit changes the `Status` line and adds a revision row to each approved contract, quoting the line and its date. Until then the headers stay `Draft`.

## 4. Revision history

| Version | Date | Description | Author | Status |
| --- | --- | --- | --- | --- |
| **0.1.0** | 8 Nov 2026 | First version: evidence read from PR #13 and PR #19 reviews and the current contract headers; no contract file is changed | Nakagamon | Draft |
| **0.1.1** | 9 Nov 2026 | Section 1: PR #13 row no longer says the review does not name F-06 (it names F-06 as a nit); section 3: fixed five-line reply format, reviewer must read the contract text first, unformatted replies not recorded (PR #24 review B1) | Nakagamon | Draft |
