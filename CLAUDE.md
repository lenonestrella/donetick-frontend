# CLAUDE.md — donetick frontend (fork)

## Why this repo exists

This is a **fork** of [donetick/frontend](https://github.com/donetick/frontend) (React web app). It adds the
owner's custom requirements and **must keep merging cleanly with upstream**. Every change you make should
keep the next `git merge upstream/develop` as small and conflict-free as possible. When two designs both work,
pick the one that touches fewer upstream lines.

- Fork: `lenonestrella/donetick-frontend` (default branch `develop`)
- Upstream: `donetick/frontend`, branch `develop`
- Sibling fork: `lenonestrella/donetick` (Go API). It embeds this repo as its `web/` submodule and ships it to
  Railway built with `vite build --mode selfhosted`.
- Nothing in this fork is meant to go back upstream. Don't shape changes for upstream PRs.
- The fork's running changes are listed in [`FORK.md`](FORK.md). **Read it before changing anything** and
  keep it current (see below).
- Only the **web app** is in scope. The fork doesn't build the mobile apps.

## Fork rules (apply to every change)

### 1. Add rather than edit

- Put new behavior in **new files** (new component, hook, util, query module, test file) instead of growing
  upstream files. Upstream files should only get small hooks: one import, one route, one rendered component,
  one call.
- Keep each touch on an upstream file to a few contiguous lines, so a conflict is small and easy to read.
- Don't rename, move, delete or re-indent upstream code. Don't fix upstream style, typos or warnings you
  happen to pass. Unrelated cleanups in upstream files cost you at every future merge.
- **Never run `npm run lint:fix` or `prettier -w .`.** They rewrite the whole repo. Format only the files you
  changed: `npx prettier -w <files>` and `npx eslint --fix <files>`.
- Don't edit upstream tests (`tests/*.test.mjs`, `e2e/tests/*.spec.js`) unless the fork deliberately changes
  the behavior they assert. Add fork tests in new files instead.
- Don't add or bump npm dependencies unless the feature needs it. `package-lock.json` conflicts are painful.
  If you must, change only what's required and note it in `FORK.md`.
- Don't hand-edit `package.json` `version` or the `android/`/`ios/` version files. Upstream bumps them with
  every release.

### 2. Put custom behavior behind feature flags

- New behavior that changes what upstream UI does should be **off by default**. With the flag off, the app
  behaves exactly like upstream.
- Choose the flag mechanism per feature:
  - **Build-time**: a `VITE_*` var (read via `import.meta.env`, like `src/Config.js`). If it must be on for
    the Railway deploy, set it in a fork-owned env file or as a build arg, not by editing upstream's
    `.env*` values.
  - **Runtime, from the backend**: when the backend fork has a matching flag, read it from an API response,
    so one Railway setting controls both sides.
- Purely additive features (a new page only reachable through a fork-owned link) don't need a flag.
- Record every flag in `FORK.md`: its name, default and what it controls.

### 3. Keep `FORK.md` current, in the same commit as the change

`FORK.md` has one section per custom feature. When you add or change a feature, add or update its section:
purpose, flag(s), the fork-owned files, and **every upstream file it touches, with why and what the hook
looks like**. Also note what to watch for in a merge. Merges are resolved from this file, so a missing entry
is a bug.

### 4. Frontend patterns that keep merges small

- **Translations**: upstream syncs `public/locales/*/*.json` through Crowdin, so adding keys there conflicts
  constantly. Put fork strings in a **fork-owned namespace** (e.g. `public/locales/en/fork.json`, used with
  `useTranslation('fork')`), registered with a single line in the `ns` list in `src/i18n/config.js`.
  English is enough unless the owner asks for other languages. Run `npm run lint:i18n` after.
- **Routes and menus**: add a route or nav entry with one line that points at a fork-owned component. Don't
  restructure upstream's route tree or settings pages.
- **Shared components**: to change an upstream component's behavior, prefer wrapping it or passing a new
  optional prop with an upstream-identical default over rewriting its internals.
- **API**: call new backend-fork endpoints from fork-owned query/hook files, not by editing upstream's
  `src/queries/*` or `src/utils/Fetcher.jsx`.

### 5. What's out of scope

Don't modify these unless the owner asks: `android/`, `ios/`, `fastlane/`, `Gemfile*`, `capacitor.config.ts`,
`ionic.config.json`, `resources/`, `bump-version.js`, `AUTOMATED_RELEASE.md`, `scripts/release.sh`,
`scripts/*-secrets.sh`, `crowdin.yml`, `.github/workflows/*`, `wrangler.toml` (Cloudflare hosting of
donetick.com), `brag-output/`. If a web change seems to need one of them, ask first.

## Syncing with upstream

The owner merges upstream into the fork (**merge, not rebase**). Never rewrite published history. When asked
to sync:

```bash
git remote get-url upstream 2>/dev/null || git remote add upstream https://github.com/donetick/frontend.git
git fetch upstream develop
git merge --no-ff upstream/develop      # on the working branch, starting from origin/develop
```

1. Resolve conflicts yourself, using `FORK.md` to see what each fork hook must still do. Keep upstream's new
   code and re-apply the fork's hook on top, rather than keeping the fork's old copy of the file.
   `package-lock.json`: take upstream's version, re-add any fork dependency with `npm install <pkg>`, then
   commit the result.
2. If upstream now does something a fork feature did, or moved the code a hook depends on, adapt the hook and
   update the feature's `FORK.md` section.
3. Run the full checks (below), including e2e. Fix anything the merge broke.
4. Check every upstream file listed in `FORK.md` still has its hook (`git diff upstream/develop -- <file>`).
5. Report: list **every conflicted file, how you resolved it and why**. Flag anything uncertain. Put this in
   the PR description or final message so the owner can review it.
6. Sync the backend fork to roughly the same upstream point. API changes land in both repos together.

To see the fork's divergence at any time: `git diff upstream/develop...HEAD --stat`.

## After changing this repo: bump the backend submodule

Whenever a task changes this repo, also update the `web` submodule pointer in the `donetick` backend fork to
the new (pushed) frontend commit, in its own commit there. Without that bump, Railway keeps deploying the old
frontend. See the backend's `CLAUDE.md` for the commands. In cloud sessions the backend is checked out as a
sibling at `../donetick`.

## Dev guide

### Stack

React 18 + Vite (JS/JSX, some TS config) · MUI Joy UI · TanStack Query · react-router · i18next ·
Capacitor (mobile shell, out of scope here) · Tailwind (limited) · Node 20.

### Layout

- `src/main.jsx` → `src/App.jsx`/`Application.jsx`: app bootstrap. `src/contexts/RouterContext.jsx`: routes.
- `src/views/`: screens, grouped by feature (`Chores`, `Settings`, `Timer`, …). `src/views/components/` and
  `src/components/`: shared UI.
- `src/queries/`: TanStack Query hooks per resource. `src/utils/Fetcher.jsx` / `ApiClient.js`: HTTP layer.
- `src/utils/`: auth/session (`AuthSession.js`, `TokenStorage.js`), offline support (`OfflineDB.js`,
  `SyncEngine.js`, `CommandQueue.js`), feature checks (`FeatureToggle.js`), helpers.
- `src/Config.js`: env-derived config (`VITE_APP_API_URL`, …). Modes: `.env` (default), `.env.development`,
  `.env.selfhosted` (used for the Railway build: same-origin API).
- `public/locales/<lng>/<ns>.json`: translations (Crowdin-managed). `src/i18n/config.js`: namespaces.
- `tests/*.test.mjs`: unit/source tests run with Node's test runner (SWC transform + `vm` sandbox, mocks
  inline). `e2e/`: Playwright suite against a real backend.
- Import alias `@` → `/src`.

### Commands

```bash
npm install
npm run dev                           # Vite dev server on :5173; API from VITE_APP_API_URL
npx vite build --mode selfhosted      # the build Railway ships
npm run build                         # CI build check
npm run lint                          # eslint + prettier check + i18n audit (CI runs lint:ci)
node --test tests/                    # unit tests
bash e2e/run-e2e.sh                   # e2e: starts ../donetick backend on :2022 and vite on :5180, runs Playwright
                                      # (cd e2e && npm install first; uses /opt/pw-browsers/chromium if present)
```

### Code style

Prettier: no semicolons, single quotes (JSX too), trailing commas, 2-space indent, 80 cols. ESLint sorts
imports (`simple-import-sort`) and destructured keys. Match the surrounding file's patterns (Joy UI
components, `useTranslation` for every user-visible string, TanStack Query for server state).

### Before every commit

For changes to this repo: `npm run lint` (or eslint/prettier on the changed files plus `npm run lint:i18n`),
`node --test tests/`, and `npm run build`. If the change affects UI flows (auth, task create/edit, projects,
filters, navigation), also run `bash e2e/run-e2e.sh`. Report failures honestly. Don't skip or weaken tests to
get green.
