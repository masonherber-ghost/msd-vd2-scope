# Deploying to Linux Shared Hosting (cPanel + Apache)

How the static SPA gets from a push on `main` to `https://masonherber.com/scopemap/`. Read this before touching anything in `.github/workflows/`, `public/.htaccess`, `vite.config.ts` → `base`, or `src/routes/index.tsx` → `basename`.

---

## Architecture

```
push to main ──► GitHub Actions ──► build dist/ ──► FTPS ──► public_html/scopemap/ ──► Apache
                 (lint, test, tsc)                  (scoped acct)
```

**The host serves files and nothing else.** All backend is Firebase — Firestore and Auth via the SDK, straight from the browser. No Node on the server, no cPanel "Setup Node.js App", no build on the host, no `/api` proxy. If a task ever needs server-side logic, it goes in a Cloud Function (`rules-ai-api.md` → Architecture), never on the web host.

| Thing | Value |
|---|---|
| Host | MyHost NZ shared, server `vancouver.myhost.nz` (103.250.232.247) |
| cPanel | `https://vancouver.myhost.nz:2083/` |
| Live URL | `https://masonherber.com/scopemap/` |
| Docroot | `public_html/scopemap` |
| FTP account | `scopemapdeploy@masonherber.com`, scoped to `public_html/scopemap/` |
| Transport | FTPS, explicit TLS on port 21, `security: strict` |
| `FTP_SERVER` | **`vancouver.myhost.nz`** — verified: Let's Encrypt cert, CN and sole SAN are that exact name |
| Workflows | `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` |

---

## The subdirectory contract — three files must agree

The app is served from `/scopemap/`, not the domain root. Three places encode that, and **all three must match or the deploy is silently broken**:

| File | Setting |
|---|---|
| `vite.config.ts` | `base: '/scopemap/'` (trailing slash) |
| `src/routes/index.tsx` | `basename` — **derived** from `import.meta.env.BASE_URL` (Vite's `base` minus the trailing slash), so it cannot drift |
| `public/.htaccess` | `RewriteBase /scopemap/`, `RewriteRule . /scopemap/index.html [L]`, and the https redirect's host |

Changing the subdirectory means changing `base` and `.htaccess`, plus the cPanel FTP account's scoped directory and every `/scopemap/` in `deploy.yml` (environment URL, artifact gate, smoke test).

**Root-absolute asset URLs only get rewritten to `base + path` when the file exists in `publicDir`.** A `<link href="/foo.svg">` with no `public/foo.svg` stays `/foo.svg` verbatim and escapes `/scopemap/` entirely. There is no favicon today; adding one means adding the file to `public/` and checking the built URL. Always verify built output, never assume.

---

## Non-negotiables

These each produce a **green build that deploys a broken site**. That is why the build gate exists.

1. **`include-hidden-files: true` on `actions/upload-artifact`.** Default is `false`, which drops `dist/.htaccess`. Every step stays green and the site loses its SPA fallback and cache headers. The single nastiest trap here.
2. **Never set `exclude:` on `SamKirkland/FTP-Deploy-Action`.** Defaults are `["**/.git*", "**/.git*/**", "**/node_modules/**"]` and setting the input *replaces* them wholesale. Matching is basename-wise, so a slashless pattern reaches further than it looks. If you must add one, re-list all three.
3. **Never `dangerous-clean-slate: true`.** It wipes everything in `server-dir` including excluded paths, on a shared docroot.
4. **`concurrency: cancel-in-progress: false`** on the deploy workflow. A half-finished FTP sync plus a stale state file is far worse than a queued run.
5. **Trailing slashes on `local-dir` and `server-dir`** are mandatory.
6. **Node comes from `.nvmrc` (22)**, via `node-version-file`, never `lts/*` — floating majors have broken installs before. Runners are pinned to `ubuntu-24.04` for the same reason.
7. **Never `submodules: recursive` on checkout** — a `.claude/worktrees` gitlink with no `.gitmodules` makes recursive checkout hard-fail.
8. **Pass `VITE_*` via the step's `env:` block, never a written `.env` file.** Vite's `loadEnv` already merges process env at highest priority, so behaviour is identical — and writing `.env` puts a hidden file on disk in a job that has hidden-file artifact upload enabled.

---

## Secrets vs variables

**Repository *variables* (not secrets)** — the six Firebase web-config values. They are baked into the bundle verbatim and are public identifiers by design; `firestore.rules` is the security boundary (`rules-firebase.md`). Marking them secret makes GitHub mask strings like `vd2-scope` across unrelated log lines.

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`

`VITE_USE_EMULATORS` is **not** passed — `src/lib/firebase.ts` only honours it when `import.meta.env.DEV`, so it cannot survive a production build.

**Repository secrets** — `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`.

### `FTP_SERVER` must be `vancouver.myhost.nz` — verified, not assumed

The cert presented on port 21 is Let's Encrypt with `CN=vancouver.myhost.nz` and exactly one SAN, `vancouver.myhost.nz`. Consequences, all confirmed by probing:

- `masonherber.com` as `FTP_SERVER` fails `security: strict` with *"no alternative certificate subject name matches target host name"*, even though MyHost's welcome email lists the domain as the FTP hostname. That advice predates TLS validation — do not follow it.
- Never use a bare IP. Certs are not issued for IPs, so strict validation cannot pass.
- **Never downgrade to `security: loose` or plain FTP to work around a cert error.** Plain FTP sends the password in cleartext on every deploy. If strict fails, the hostname is wrong — fix the hostname.

Sanity check any host before wiring it in (`530` means TLS negotiated fine and only auth failed — that is the healthy result):

```bash
curl -sS --max-time 20 --ssl-reqd -o /dev/null ftp://<host>/
openssl s_client -starttls ftp -connect <host>:21 </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

Beware unrelated hosting accounts. `masonherber.com` resolves to `103.250.232.247` (`vancouver.myhost.nz`); a SiteHost box at `120.138.18.201` (`php5.air.sitehost.co.nz`) also exists on this account and serves nothing at the live domain. Confirm `dig +short masonherber.com` matches the FTP host before deploying anywhere.

**Failed logins trip cPHulk.** A handful of wrong-credential attempts can temporarily block the source IP — including a GitHub runner. Verify credentials once, deliberately, rather than looping variants.

### The domain root is a different site — never deploy there

`https://masonherber.com/` serves **Mason's portfolio**, a separate site living directly in `public_html/`. The scope map deploy must never touch it; the smoke test checks the portfolio still loads after every publish. Two things keep it safe, and both must hold:

- the FTP account is scoped to `public_html/scopemap`, so the credential physically cannot reach the parent
- `server-dir: ./` in `deploy.yml`, which is only correct *because* the account is scoped

If the FTP account is ever recreated, re-verify the scope before deploying. Log in and list the root: you must see the scope map build, not an empty directory and not the portfolio. For a fresh, empty folder, upload a test file and fetch it from `https://masonherber.com/scopemap/` — a 200 proves the mapping.

```bash
curl -sS --max-time 25 --ssl-reqd --list-only -u "<user>:<pass>" ftp://vancouver.myhost.nz/
```

An empty listing means the account points somewhere that is not web-served. Fix it in cPanel → FTP Accounts → *Change Directory*, never work around it with `server-dir`.

**The correct value — confirmed working:**

```
public_html/scopemap/
```

cPanel shows a fixed `/home/masonher/` prefix beside the field and joins whatever you type onto it. So you type the path *relative to the home directory*, and only that form resolves to the served docroot.

**The trap:** `masonherber.com` is the account's **primary** domain, so its document root is `/home/masonher/public_html`. A sibling directory named `/home/masonher/masonherber.com/` exists but is served by nothing. Worse, cPanel does not reject an unrecognised path — it silently creates it. An account pointed at `/home/masonher/masonherber.com/scopemap` therefore looks right in the UI, accepts logins over FTPS, and uploads into a directory no browser can reach.

Tell the two apart by mtime: if the directory is empty and its timestamp matches the moment the FTP account was created, cPanel just created it and it is the wrong one. A correctly scoped account lists the live site's files immediately.

### Clear the folder before a first deploy

FTP-Deploy-Action computes deletions from its own state file, never from a remote listing. Files it did not upload are invisible to it — so anything already sitting in the directory from a manual upload survives every deploy, forever, as an orphan. Empty the directory once via cPanel File Manager before the first pipeline run. Never reach for `dangerous-clean-slate` to do this. (`public_html/scopemap/` was new and empty for its first deploy; a `ping.txt` from the FTP check was the only stray.)

**The FTP credential must be a scoped sub-account** (cPanel → FTP Accounts, Directory = `public_html/scopemap/`), never the main cPanel login. A scoped credential limits a leak to one directory and lets the workflow use `server-dir: ./`.

---

## The build gate

`deploy.yml` asserts before uploading. Extend it whenever a new class of silent breakage appears — a gate is cheaper than a broken deploy.

- `dist/.htaccess` and `dist/index.html` exist
- `dist/index.html` references `/scopemap/assets/` for both script and stylesheet
- no Firebase config key (`apiKey`, `authDomain`, …) is `void 0` in the bundle — this is how a missing repo variable manifests: Vite emits `{apiKey:void 0,authDomain:void 0,…}` and still builds green. Verified to fire on a build without the variables

The post-publish smoke test then curls the live site: the page and a deep link (`/scopemap/coverage`) return 200, a hashed asset returns `immutable`, `.ftp-deploy-sync-state.json` returns 403, and the portfolio at the root still serves its own title.

---

## Why the upload order is safe

FTP-Deploy-Action syncs *create dirs → upload new → replace changed → delete removed*. Vite fingerprinting maps onto this exactly: every new chunk is a **new path** (uploaded first), while `index.html` keeps its path (replaced after). So assets always land before the HTML that references them.

The reverse case — a tab open across a deploy firing a `lazy()` import for a just-deleted chunk — is handled in the app, not the pipeline:

```ts
// src/main.tsx
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})
```

Every route in `src/routes/index.tsx` is lazy-loaded, so do not remove this.

---

## Rollback

`workflow_dispatch` on `deploy.yml` with `redeploy_run_id` = a previous successful run id. The `build` job skips, `publish` pulls that run's `dist` artifact, and the sync diffs the server *back* to it — including re-uploading chunks the bad deploy deleted. Window is `retention-days: 90`.

Beyond that: `git revert` + push. Rebuilds are deterministic (`package-lock.json` at lockfileVersion 3, `npm ci`).

---

## `.htaccess` notes

It lives at `public/.htaccess` so Vite copies it verbatim into `dist/`. It is **tracked** — check `git status` after editing, it is easy to leave untracked.

- mod_rewrite rules are **not** inherited into a child `.htaccess`, but `Redirect`/`RedirectMatch` (mod_alias) run *before* mod_rewrite, and `Header`/`Options` merge. Read `~/public_html/.htaccess` before debugging anything odd.
- The HTTPS redirect checks `X-Forwarded-Proto` / `X-Forwarded-SSL` as well as `%{HTTPS}`, so it cannot loop if TLS is ever terminated upstream.
- `.ftp-deploy-sync-state.json` is denied by name — Apache blocks `.ht*` by default but nothing else, and that file is a full manifest of every path and hash.
- The `immutable, max-age=31536000` rule matches by extension, not by `assets/`. Anything unfingerprinted served from `public/` would be cached for a year — which is why the fonts live in `src/assets/fonts/`, where Vite hashes them. Keep `public/` to `.htaccess`.

---

## Changing the pipeline

1. Edit the workflow, push to a branch — `ci.yml` runs on every branch but `main`, so you get a free syntax/behaviour check without deploying.
2. Verify the build gate locally first: `npm run build`, then run the gate's assertions by hand against `dist/`.
3. Merge to `main`, watch the run. First deploy after a change: confirm `📄 Upload:` lines include `.htaccess`, and that `index.html` appears *after* the asset uploads.
4. If a deploy half-fails, **do not** re-run with `dangerous-clean-slate`. Re-run the workflow; the state file makes the sync idempotent.

---

## Optional upgrade — SSH/rsync

MyHost grants SSH on request. The only real win is **atomic deploys and 2-second rollback** via a symlinked releases directory (`~/releases/<sha>` ← `public_html/scopemap`). Worth doing if deploys become frequent; not needed to ship.

Probe first — some hardened cPanel hosts disable `FollowSymLinks`, which 403s everything under `/scopemap`:

```bash
mkdir -p ~/releases/probe && echo ok > ~/releases/probe/t.txt
ln -s ~/releases/probe ~/public_html/symprobe
curl -sI https://masonherber.com/symprobe/t.txt | head -1   # 200 = go; 403 = stay on FTPS
rm ~/public_html/symprobe && rm -rf ~/releases/probe
```

Use raw `rsync` in a `run:` block, not an action — `SamKirkland/web-deploy` is unmaintained since 2022, and `burnett01/rsync-deployments` rebuilds a Docker image every run. Swap with `mv -Tf` (`rename(2)`, genuinely atomic), not `ln -sfn` alone (unlink+symlink, has a gap). Keep `releases/` **outside** `public_html`, retain the last 5 so old lazy chunks stay resolvable.
