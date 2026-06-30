# Skill Review V2 — Write-back + Scheduling + Ledger — Design

- **Date:** 2026-06-30
- **Status:** Approved design (pre-plan)
- **Builds on:** v1 propose-only (`2026-06-29-skill-review-harness-design.md`), the Hermes skill-fleet reconciliation (`D:\Projects\Hermes\docs\superpowers\specs\2026-06-30-skill-fleet-reconciliation-design.md`), and the Argus profile-path fix (`skill_review.skills_root_for`).
- **Design inputs:** 3 independent design passes + a 3-lens adversarial red-team (session workflow `wf_6913e6cf-efc`). The red-team findings are folded in as hard requirements (§7).

## 1. Problem & context

v1 reviews struggling Hermes sessions and returns **proposals** (gaps, health, suggested edits) — read-only. V2 lets the operator **apply** approved edits to `SKILL.md` files, **schedule** unattended reviews, and keep a **persistent ledger** of runs and outcomes.

The reconciliation changed one foundational fact: a Hermes profile's skills now live in `profiles/<profile>/skills/` and are **Mutagen-synced** across boxes (per profile). So the v1-era "write to local AND remote independently" idea is now actively wrong — two writes to the same synced file conflict-halt Mutagen. V2's write model is therefore **write once, let sync propagate** (§5).

## 2. Goals / non-goals

**Goals**
- Approval-gated **apply** of a full-file rewrite to a `SKILL.md`, with a diff the human approves and a timestamped backup.
- **Scheduling** of read-only reviews (never writes) via an in-process scheduler.
- A persistent **JSON-per-run ledger** of reports + per-gap apply outcomes, surviving restarts.
- All write paths gated, localhost-only, default OFF, and safe against the red-team failure modes (§7).

**Non-goals**
- No auto-apply ever (scheduling is strictly read-only).
- No new heavy dependencies (stdlib + existing `anthropic`/CLI only; no APScheduler, no SQLite).
- Not re-solving skill storage (the reconciliation did that).

## 3. Locked decisions

1. **Scope:** one spec — write-back + scheduling + ledger.
2. **Edit mechanism:** FULL-FILE REWRITE. At apply time, re-read the FULL current `SKILL.md` (not v1's 3000-char review context), have Claude produce the COMPLETE revised file, show an old-vs-new diff, human approves, write atomically with a timestamped backup.
3. **Apply is ALWAYS human-gated.** Scheduling only auto-runs read-only reviews.
4. **Write-target model (revised by reconciliation):** **write once + propagate** (§5), not independent dual-write.
5. **Scheduler:** in-process daemon thread (always-on Argus); per-instance schedule in config.
6. **Ledger:** JSON-per-run under the Argus state dir + index. No SQLite.
7. **Gate:** new `enable_skill_writeback`, localhost-only, default OFF, separate from `enable_skill_review`.

## 4. Architecture

| Module | Responsibility |
|---|---|
| `backend/transport.py` (extend) | Add `write_file(path, content_bytes, *, make_backup)` to BOTH runners. **Byte-exact** (no newline translation): local `os.write`/binary temp + `os.replace`; SSH stream **bytes** over stdin via a new `_exec_in`, atomic temp+`mv` with backup. New `read_bytes(path)`. `WriteResult{ok, backup_path, sha256, error, bytes_written}`. |
| `backend/skill_writeback.py` (new) | The apply engine: `resolve_skill_path` (profile-aware, §5), `read_full_skill` (bytes), `rewrite_skill` (Claude full-file rewrite — API tool or CLI sentinel), `compute_diff`, `sanity_check`, `apply_edit` (SHA-guarded, per-path-locked, atomic + backup). Never called by the scheduler. |
| `backend/review_ledger.py` (new) | JSON-per-run store under `reviews_state_dir()` + `index.json`; `write_run`, `read_run`, `list_runs`, `update_gap_outcome`, `prune`. Atomic writes (`tempfile`+`os.replace`), per-instance lock, files `0600`/dir `0700`. |
| `backend/review_scheduler.py` (new) | Daemon thread; `due_instances()` (pure, level-triggered) honoring per-instance schedule; fires the SAME `start_review` helper as the manual run; read-only; gated by `enable_skill_review` only; guarded against double-start + TestClient. |
| `backend/app.py` (extend) | Extract `start_review(app, agg, instance, trigger)` = the atomic single-flight compare-and-set (used by BOTH manual endpoint and scheduler). New routes: `POST .../propose-edit`, `POST .../apply-edit`, `GET .../runs`, `GET .../runs/{id}`. Persist every report to the ledger. Start scheduler on FastAPI startup. |
| `backend/settings.py` (extend) | `enable_skill_writeback`, `ScheduleConfig`, `Instance.schedule`, `skill_writeback_available()`, `reviews_state_dir()`. |
| `backend/models.py` (extend) | `ProposedEdit`, `ApplyOutcome`, `GapRecord`, `LedgerIndexEntry`, `LedgerRecord`; `ReviewReport.run_id`/`trigger`; `Features.skill_writeback`. |
| `frontend/src/review/` (extend) | Per-gap "Prepare edit" → DiffModal (approve/cancel) → apply result; injection-warning banner; History list from the ledger; everything gated on `features.skill_writeback`. |

## 5. Write-target model (sync-aware, profile-aware)

A `SkillGap.target_skill` is a skill name; resolve it to the **active profile's** path: `skills_root_for(instance)/<category>/<name>/SKILL.md` (reusing the profile-path fix). Then:

- **Shared synced root is operator-declared, not guessed.** A new optional `instance.synced_skills: true` flag (default false) marks an instance whose skills tree is kept in sync by an external tool (Mutagen). When the target instance — or any instance sharing the canonical write — is `synced_skills`, **apply on ONE instance only** (the local one where Argus runs) and let the sync tool propagate; the other instance's Apply is shown as "syncs via Mutagen", not a second write. This avoids the two-way-safe conflict. Auto-detection of Mutagen is explicitly out of scope (fragile); the flag is the contract.
- **No shared sync** → write per-instance (local FS, or SSH for a remote instance).
- **Fleet-wide updates fan out across profiles, not boxes.** Because per-profile skill copies are not deduped within a box, "update skill X everywhere" writes X into each configured profile's tree **on the local box**; Mutagen carries each profile to the other box. The UI offers "apply to this profile" (default) and "apply to all profiles" (fan-out).

This makes the common case a **local-only write** — the scary SSH-write path is the fallback for non-synced/remote-only setups, not the default.

## 6. Write-back data flow

1. Review already ran; its `LedgerRecord` (with `run_id`, stable `gap_id` per gap) is shown. Gaps with a real (non-"new", non-truncated) `target_skill` show "Prepare edit".
2. `POST /propose-edit {run_id, gap_id}` → gate (`skill_writeback_available`), load run, resolve path, `read_bytes` the FULL file, `rewrite_skill` → complete revised file, `sanity_check`, `compute_diff`. **Server stores the proposed new bytes** under a `proposal_id` (in the ledger) and returns `{proposal_id, path, diff, old_sha256, warnings, injection_flags}`. Nothing written.
3. UI renders the diff + any injection/sanity warnings (a separate acknowledge for injected-content flags). User approves.
4. `POST /apply-edit {run_id, gap_id, proposal_id}` → gate; acquire **per-path lock**; re-`read_bytes` current file, recompute SHA; if `!= old_sha256` → **409** (file changed). Else `write_file` the **server-stored** proposed bytes (atomic temp+`os.replace`/`mv`, backup first), read-back verify the bytes landed. Record `ApplyOutcome` in the ledger.
5. UI marks the gap applied (shows backup path) or shows the 409 "re-propose" / failure.

## 7. Red-team requirements (hard, not optional)

These are confirmed failure modes from the adversarial pass; each is a requirement:

- **R1 Byte-exact writes / CRLF.** Read and write raw bytes; never round-trip through newline-translating text mode. Compute the integrity SHA over raw bytes (`read_bytes`), not the lossy review text. (We just hit this exact CRLF wall in the reconciliation.)
- **R2 max_tokens truncation = hard fail.** Reject an API rewrite with `stop_reason == "max_tokens"`; size `max_tokens` from input length; cap the file size writeback will attempt (422 oversized). A length-shrink heuristic is NOT a substitute.
- **R3 CLI sentinel extraction.** On the subscription CLI path, wrap the file in unique nonce sentinels and extract strictly between them — never fence-strip (SKILL.md files contain their own ``` blocks). Missing sentinel → 422.
- **R4 Server-stored proposed bytes.** Apply writes the bytes the server proposed (referenced by `proposal_id`), not bytes echoed by the client — the displayed diff and the written file must be the same artifact.
- **R5 Path-traversal + name allowlist.** Validate `target_skill`/new-skill name against `^[A-Za-z0-9._-]{1,64}$`; require the name to be a member of the freshly parsed `skills list`; assert `realpath(target)` is contained in `realpath(skills_root)` and basename is `SKILL.md`.
- **R6 Prompt-injection scanner.** Scan ADDED diff lines for new fenced shell blocks, `curl|wget … | sh`, new URLs, new frontmatter exec keys (`allowed-tools`/`command`/`hooks`), and secret-shaped strings; surface as a distinct, separately-acknowledged blocking banner (skill content is executed by the agent).
- **R7 New-skill exclusive create.** `target_skill == "new"` writes with O_EXCL / remote `set -C`; collision → 409 "exists, use harden". Never branch the backup decision on an unverified "absent" assumption.
- **R8 Collision-proof backups, outside the synced tree.** Backups go to the Argus state dir (`reviews/<instance>/backups/<skill>/<ts>`), NOT beside `SKILL.md` (so Mutagen doesn't replicate them / conflict). High-resolution timestamp + uniqueness token; exclusive-create so one backup never overwrites another.
- **R9 Per-path apply lock.** Hold a path-keyed lock across re-read→SHA-check→write so the optimistic check and the rename are one atomic step (defends single-host concurrent applies).
- **R10 Real bound-host gate.** The writeback gate must reflect the ACTUAL bound socket, not `config.host` fallback. Require `ARGUS_BIND_HOST` set by `argus serve` (no silent `config.host` default for the write gate), or read the live server socket. An Argus on `0.0.0.0` must never write.
- **R11 Atomic single-flight.** `start_review` does the `status=="running"?` check-and-set under one lock; BOTH the manual endpoint and scheduler go through it (scheduler must not call the worker directly).
- **R12 Ledger privacy.** `reviews/` dir `0700`, files `0600`; persist gap recommendation + diff + content hashes, not raw memory-derived evidence; optional redaction of email/IP/key-path/token patterns before write.
- **R13 Mutagen-aware.** Don't write backups/temp files inside the synced tree (R8). For a synced skill, apply on one instance only (§5) so two physical writes never race Mutagen.

## 8. Scheduling

In-process `ReviewScheduler(threading.Thread, daemon=True)`, started from FastAPI startup only when ≥1 instance has `schedule.enabled` AND `skill_review_available`, guarded by a module `_started` flag and `ARGUS_SCHEDULER != "off"` (tests pass it off). Loop wakes every 60s; `due_instances()` is **level-triggered** (fire when `now >= today@HH:MM` AND last run < today, seeded from the ledger so a restart doesn't double-fire; interval mode: `now - last >= interval_hours`). It calls `start_review(..., trigger="scheduled")` — the SAME read-only path as a manual run — and persists to the ledger. It has **no reference to the writeback engine**; scheduling is structurally read-only and gated only by `enable_skill_review`.

`ScheduleConfig{enabled, time:"HH:MM" | None, interval_hours:int | None}` with a validator requiring exactly one of `time`/`interval_hours` when enabled. (Local-time/DST caveat documented; interval mode avoids it.)

## 9. Ledger

`reviews_state_dir()` = `%APPDATA%/Argus/reviews` (win) / `$XDG_STATE_HOME` or `~/.local/state/argus/reviews` (posix). Per instance: `<reviews>/<instance>/<run_id>.json` + `index.json`. `run_id` = UTC compact (`20260630T141500Z`). `LedgerRecord{report, gaps:[GapRecord{gap, outcome?}], trigger, created_at}`; `index.json` = `[LedgerIndexEntry{run_id, instance, started_at, finished_at, status, model, trigger, gap_count, applied_count}]`. All writes atomic; per-instance lock serializes index mutation (its OWN lock, never `review_lock` — R11/deadlock guard). `prune(keep=50)` trims run files; backups pruned separately and conservatively.

## 10. Gating

Two orthogonal localhost-bound flags. `enable_skill_review` (existing) gates reviews + the scheduler. `enable_skill_writeback` (NEW, default False) gates `propose-edit` + `apply-edit` via `skill_writeback_available(config, bind_host) = enable_skill_writeback AND is_localhost(real_bound_host) AND skill_review_available(...)`. Enforced server-side at the top of each write route (403). `Features.skill_writeback` hides the UI Apply controls when off (invisible AND inert). Non-localhost bind ⇒ both gates false regardless of flags (R10).

## 11. Testing (representative)

Byte-exact local + SSH write (CRLF preserved, backup created, atomic); `max_tokens` truncation rejected; CLI sentinel extraction with embedded fences; apply writes server-stored bytes (not client echo); SHA conflict → 409; path-traversal/name-allowlist rejected; injection scanner flags added shell/URL/frontmatter; new-skill O_EXCL collision → 409; per-path lock serializes concurrent applies; gate 403 when off or non-localhost (incl. `ARGUS_BIND_HOST=0.0.0.0`); scheduler `due_instances` level-triggered + no double-fire after restart; scheduler imports no writeback symbol; ledger roundtrip + atomic index + prune leaves backups; frontend: Apply hidden when feature off, diff modal approve→applied, 409 re-propose hint.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Rewrite subtly drops/edits unrelated content | Human approves the full diff; injection scanner (R6); sanity_check (frontmatter/empty/shrink); backup (R8) |
| Writing the live agent's skills | Human-gated; backup; read-back verify; synced-write-once (§5) |
| Scheduled review cost on a fleet | Per-instance daily default; documented; no global limit (acceptable single-user) |
| Mutagen conflict from write-back | Apply on one instance only for synced skills; backups/temp outside the synced tree (R8/R13) |
| Localhost gate bypass on a public bind | R10 — gate on the real bound host, not config.host |

## 13. Success criteria

- An operator can prepare an edit, review a faithful byte-exact diff, approve, and see the `SKILL.md` updated with a backup — local write propagating to the VPS via Mutagen, no conflict.
- A scheduled review runs read-only, lands in the ledger, and never writes.
- History survives restart. Every write path is gated, localhost-only, default off, and passes the R1–R13 tests.
