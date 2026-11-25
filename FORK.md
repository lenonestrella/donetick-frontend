# FORK.md — divergence from upstream (frontend)

Upstream: `donetick/frontend@develop`. Last merged upstream commit: `ede1c38` (Release 1.2.78, 2026-11-23).

This file lists every way this fork differs from upstream, one section per feature. Keep it accurate. Upstream
merges are resolved from it (see `CLAUDE.md`). Check it against `git diff upstream/develop...HEAD --stat`.

Section template:

```
## <Feature name>
- **Purpose**: why the fork needs it.
- **Flag**: `VITE_*` var / backend setting (default: off), or "none — additive only" / "none — bug fix".
- **Fork-owned files**: new files that upstream never touches.
- **Upstream files touched**: `path` — what the hook/change is and why it has to live there.
- **Merge notes**: what to check or re-apply when upstream changes the touched areas.
```

---

## Sign-in survives a stuck IndexedDB

- **Purpose**: on mobile Safari, IndexedDB can stop answering after the tab is backgrounded. Login waited
  forever on the offline-cache clear, so sign-in spun after the server had already accepted the credentials.
- **Flag**: none (bug fix; behavior is unchanged when IndexedDB is healthy).
- **Fork-owned files**: `tests/auth-session.test.mjs`.
- **Upstream files touched**:
  - `src/utils/AuthSession.js`: the offline-cache clear during login is bounded at 3s. On timeout the stuck
    connection is dropped and clearing continues in the background. An outright failure still raises
    `SessionStorageError`.
  - `src/utils/OfflineDB.js` (web path): closes the old connection before re-opening after a visibility
    change, and shares one in-flight open between concurrent callers.
- **Merge notes**: if upstream rewrites login/session restore or `OfflineDB` opening, check the timeout and
  single-open behavior still hold (run `node --test tests/auth-session.test.mjs`). If upstream fixes the hang
  itself, drop the fork's version and this section.
- Commit: `c722a29`.

## Test-suite fixes (unit + e2e)

- **Purpose**: bring upstream's failing unit tests (30) and e2e specs (11) back to green, so fork changes can be
  verified.
- **Flag**: none.
- **Fork-owned files**: none.
- **Upstream files touched**:
  - Unit tests: `tests/action-theme`, `feedback-theme`, `navigation-theme`, `project-board-card`,
    `project-board-offline`, `project-task-row`, `settings-navigation`, `startup-screen`,
    `task-editor-compatibility` (`*.test.mjs`): new mocks and assertions updated to current upstream UI.
  - E2E: `e2e/global-setup.js` (UTC user, cleans leftover "E2E " projects/filters), `e2e/playwright.config.js`
    (UTC timezone, optional `E2E_CHROMIUM_PATH`), `e2e/run-e2e.sh` (finds the backend at `$BACKEND_DIR` or
    `../donetick`, uses `/opt/pw-browsers/chromium` when present), `e2e/fixtures/auth.js`, and specs
    `add-task-modal`, `auth`, `chore-edit`, `chores`, `projects-filters`.
  - App code, two small fixes found by the tests:
    - `src/views/components/BaseOptionPicker.jsx`: trigger `aria-label` uses the visible text.
    - `src/views/Timer/TimerDetails.jsx`: the finished-session chip uses the skin-aware completion color.
- **Merge notes**: these files conflict whenever upstream edits the same tests. **Prefer upstream's version**
  of a test, then re-run `node --test tests/` and `bash e2e/run-e2e.sh`, and re-apply only what's still needed.
  Keep the `run-e2e.sh` backend discovery and Chromium path, since cloud sessions depend on them. Drop the
  two app-code fixes if upstream fixes them differently.
- Commits: `9c71acb`, `41b5501`.

## Claude guidance files

- **Purpose**: instructions for Claude Code on working in this fork.
- **Flag**: none.
- **Fork-owned files**: `CLAUDE.md`, `FORK.md`.
- **Upstream files touched**: none.
