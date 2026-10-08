---
name: setup-deploy-pipeline
description: Sets up a GitHub Actions pipeline that builds a Vite SPA and publishes it to MyHost/cPanel shared hosting over FTPS, with a build gate, smoke test and artifact rollback. Use when asked to deploy a site to shared hosting, put a new app on masonherber.com, set up CI/CD for a static site, or automate publishing to cPanel.
---

## Overview

Stands up push-to-deploy for a static Vite SPA on MyHost shared hosting (cPanel + Apache). Serves from the domain root or a subdirectory.

Written from a working pipeline — every gate below exists because its absence caused a real failure. **Do not skip steps to save time.** The failure modes here are overwhelmingly silent: green build, green upload, broken site. Four of the five problems on first setup produced no error at all until someone loaded the page.

**Stop at the end of each step and confirm the checklist before continuing.**

### Known-good host facts (MyHost, account `masonher`)

| | |
|---|---|
| FTP server | `vancouver.myhost.nz` — **not** the domain; only this name matches the TLS cert |
| cPanel | `https://vancouver.myhost.nz:2083/` |
| Docroot | `/home/masonher/public_html` (primary domain) |
| FTP Directory field | `public_html/{subdirectory}/` — relative; cPanel prepends `/home/masonher/` |
| Transport | FTPS, explicit TLS, port 21, `security: strict` |

For a different server, re-derive these in Step 4 — never assume.

---

## Step 0 — Confirm the app is a fit

- **Static only.** Grep for `/api` fetches, server routes, SSR, anything needing Node at runtime. If found, shared hosting is the wrong target — say so and stop. Backend work belongs in Cloud Functions.
- **Root or subdirectory?** `example.com` vs `example.com/app/`. Changes three files (Step 2).
- **Does the domain root already serve something?** `curl -s https://<domain>/ | grep -o '<title>[^<]*'`. If another site lives there, the deploy must never reach it — this makes the FTP scoping in Step 4 a safety requirement, not tidiness.
- **Which env vars are needed at build time**, and are they public client config or genuinely secret?

Report findings, wait for confirmation.

---

## Step 1 — Pre-flight audit

Run every check. Each maps to an observed failure.

**1a. `npm ci` in a clean tree — do this first.** It is the single most likely cause of a fast CI failure, and it cannot be caught by building locally, because an existing `node_modules` masks it.

```bash
S=$(mktemp -d); git archive HEAD | tar -x -C "$S"
cd "$S" && npm ci; echo "EXIT: $?"
```

`npm install` tolerates peer-dependency conflicts; `npm ci` refuses. A repo can lint, test and build perfectly for months while `npm ci` has been broken. Fix the conflict in `package.json` (usually aligning a plugin to its host package's major) and regenerate the lockfile — **never** paper over it with `--legacy-peer-deps` in CI.

**1b. The rest:**

| Check | Why |
|---|---|
| `base`/`basename` changes committed | CI builds the *pushed* commit; local-only config 404s every asset |
| `.htaccess` tracked, not just present | Untracked = no SPA fallback, no cache headers, silently |
| Root-absolute URLs in `index.html` | Vite only rewrites these when the file exists in `publicDir` |
| `dist/` gitignored | Confirms CI must build; the host cannot |
| Lockfile committed | `npm ci` requires it |
| Node version pinned | Native devDeps with install scripts are ABI-sensitive |
| Gitlinks without `.gitmodules` | Breaks `submodules: recursive` |
| `npm run lint` + `npm test` pass | Don't debug pre-existing failures inside CI |

**Gate:** report pass/fail for each. Fix blockers before writing any pipeline.

---

## Step 2 — Subdirectory contract (skip for root-served)

Three files must agree or the deploy is silently broken:

- `vite.config.ts` → `base: '/sub/'` (**trailing slash**)
- router → `basename: '/sub'` (**no trailing slash**)
- `.htaccess` → `RewriteBase /sub/` and `RewriteRule . /sub/index.html [L]`

**Gate:** `npm run build`, then confirm `dist/index.html` references `/sub/assets/…` and built CSS references `/sub/` for `public/` assets. Check the favicon link specifically — a missing `public/` file leaves a root-absolute URL that escapes the subdirectory entirely.

---

## Step 3 — Apache config

Write `public/.htaccess` (Vite copies it verbatim to `dist/`). In order:

1. **Canonical origin** — force HTTPS, strip `www`. Test `%{HTTPS}` **and** `%{HTTP:X-Forwarded-Proto}` / `%{HTTP:X-Forwarded-SSL}`, or it can infinite-loop behind a TLS-terminating proxy. Matters for Firebase Auth, which matches origin exactly.
2. **SPA fallback** — `-f`/`-d` guard first so real files (hashed chunks) are served as-is, then rewrite everything else to `index.html`.
3. **Caching** — fingerprinted assets `immutable, max-age=31536000`; `index.html` `no-cache, must-revalidate` or deploys never take effect. The rule matches by *extension*, so unfingerprinted files in `public/` also get a year — move those into `src/` so Vite hashes them.
4. **Private files** — deny the sync-state file by name. Apache blocks `.ht*` and nothing else:
   ```apache
   <FilesMatch "^\.(ftp-deploy-sync-state\.json|htaccess|env)$">
     Require all denied
   </FilesMatch>
   ```
5. **MIME types + compression.**

**Gate:** `git status` shows `.htaccess` tracked; it appears in `dist/` after a build.

---

## Step 4 — cPanel FTP account

**4a. Confirm the docroot.** cPanel → Domains → read the Document Root column. Primary domains use `public_html`; addon domains differ. Do not infer it.

**4b. Create a scoped account.** cPanel → Files → FTP Accounts → Add FTP Account. Directory:

```
public_html/{subdirectory}/
```

Relative — cPanel shows `/home/<user>/` as a fixed prefix and joins onto it. **cPanel silently creates any path it does not recognise**, so a wrong value yields an account that looks correct in the UI, authenticates fine, and uploads where nothing is served. Typing a full `/home/...` path nests it under the home dir again.

Never use the main cPanel login: it has full account access and no directory scoping.

**4c. Verify the server hostname against its TLS cert.**

```bash
curl -sS --max-time 20 --ssl-reqd -o /dev/null ftp://<host>/          # 530 = TLS fine, auth refused = healthy
openssl s_client -starttls ftp -connect <host>:21 </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

Use the name in the cert. The domain usually **fails** strict validation even though cPanel's welcome email lists it as the FTP hostname — that advice predates TLS verification. Never use a bare IP (no cert covers one), and **never downgrade to `security: loose` or plain FTP** to get past a cert error: plain FTP sends the password in cleartext on every deploy. A cert error means the hostname is wrong.

Also confirm the host actually serves the domain — `dig +short <domain>` must match, and `dig -x <ip>` reveals whose box it is. Credentials from an unrelated hosting account on the same project are an easy mistake.

**Gate — this is the one people get wrong.** Log in and list the account root. It must show **the live site's existing files**:

```bash
curl -sS --max-time 25 --ssl-reqd -u "<user>:<pass>" ftp://<host>/
```

An **empty listing means the wrong directory** — two wrong directories look identical, so cross-check that the remote `index.html` size matches `curl -sI` against the live URL. If it's empty, fix the Directory in cPanel (FTP Accounts → *Change Directory*, no need to recreate the account); never compensate with `server-dir`. A directory whose mtime matches the moment the account was created is one cPanel just made — i.e. the wrong one.

**Verify credentials once, deliberately.** Looping username variants trips cPHulk and can block the source IP, including a GitHub runner.

---

## Step 5 — GitHub configuration

Two separate stores on `…/settings/secrets/actions`. A name added under one is invisible to the other — the most common setup mistake.

**Variables** (`${{ vars.X }}`) — public client config, e.g. Firebase web config. These ship inside the JS bundle regardless, so making them secrets buys nothing and makes GitHub redact ordinary strings like the project id from every log line.

**Secrets** (`${{ secrets.X }}`) — `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`.

**Do not create the `production` environment manually.** The workflow references it and GitHub auto-creates it with no protection rules. Adding a required reviewer parks every deploy waiting for a click — which looks exactly like a hung pipeline.

**Gate:** each name spelled exactly as the workflow references it.

---

## Step 6 — The workflows

Two files. Never chain with `workflow_run`; `deploy.yml` re-runs its own gates.

**Look up action versions — do not recall them:**

```bash
for r in actions/checkout actions/setup-node actions/upload-artifact \
         actions/download-artifact SamKirkland/FTP-Deploy-Action; do
  printf "%-38s " "$r"
  curl -s "https://api.github.com/repos/$r/releases/latest" | grep -m1 '"tag_name"'
done
```

Then confirm the major tag resolves (`…/git/ref/tags/v7`) — a release existing does not guarantee a moving major tag.

### `ci.yml`

```yaml
name: CI
on:
  pull_request:
  push:
    branches-ignore: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7        # never submodules: recursive
      - uses: actions/setup-node@v7
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build              # no env vars; proves tsc + bundling only
```

### `deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      redeploy_run_id:
        description: 'Rollback: re-publish dist from a previous run id. Blank = build this ref.'
        required: false
        type: string
permissions:
  contents: read
  actions: read                          # cross-run artifact download for rollback
concurrency:
  group: deploy-production
  cancel-in-progress: false              # never cancel a half-finished sync
jobs:
  build:
    if: ${{ !inputs.redeploy_run_id }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - name: Build
        run: npm run build
        env:
          VITE_PUBLIC_THING: ${{ vars.VITE_PUBLIC_THING }}   # one line per var
      - name: Gate the artifact
        run: |
          set -euo pipefail
          test -f dist/index.html
          test -f dist/.htaccess
          grep -q 'src="/SUB/assets/'  dist/index.html
          grep -q 'href="/SUB/assets/' dist/index.html
          grep -q '/SUB/favicon.svg'   dist/index.html
          if grep -q 'apiKey:void 0\|apiKey:undefined' dist/assets/index-*.js; then
            echo "::error::config not injected — check repo variables"; exit 1
          fi
      - uses: actions/upload-artifact@v7
        with:
          name: dist
          path: dist/
          include-hidden-files: true     # default false DROPS dist/.htaccess silently
          if-no-files-found: error
          retention-days: 90             # = the rollback window
  publish:
    needs: [build]
    if: ${{ !cancelled() && needs.build.result != 'failure' }}
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://DOMAIN/SUB/
    steps:
      - uses: actions/download-artifact@v8
        with:
          name: dist
          path: dist
          run-id: ${{ inputs.redeploy_run_id || github.run_id }}
          github-token: ${{ github.token }}
      - uses: SamKirkland/FTP-Deploy-Action@v4.4.0
        with:
          server: ${{ secrets.FTP_SERVER }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          protocol: ftps                 # explicit TLS on 21, not ftps-legacy
          port: 21
          security: strict
          timeout: 60000                 # 30s default is tight for fonts, NZ<->US
          local-dir: ./dist/             # trailing slashes mandatory
          server-dir: ./                 # correct ONLY because the account is scoped
          state-name: .ftp-deploy-sync-state.json
          # `exclude` deliberately unset. Defaults are
          #   ["**/.git*", "**/.git*/**", "**/node_modules/**"]
          # and setting it REPLACES them. Matching is basename-wise.
          # Never dangerous-clean-slate on a shared docroot.
      - name: Smoke test
        run: |
          set -euo pipefail
          curl -fsS https://DOMAIN/SUB/ -o /tmp/i.html
          ASSET=$(grep -o '/SUB/assets/index-[^"]*\.js' /tmp/i.html | head -1); test -n "$ASSET"
          curl -fsSI "https://DOMAIN$ASSET" | grep -qi 'immutable'
          test "$(curl -s -o /dev/null -w '%{http_code}' https://DOMAIN/SUB/DEEPLINK)" = 200
          test "$(curl -s -o /dev/null -w '%{http_code}' https://DOMAIN/SUB/.ftp-deploy-sync-state.json)" = 403
```

**Verify the gate actually fires.** Build once with the env removed, into a scratch dir, and confirm the pattern matches — Vite inlines a missing var as `void 0` and still builds green. A gate that never fires is worse than no gate.

**Gate:** build locally, run the gate assertions by hand against `dist/`, all pass.

---

## Step 7 — Stale chunks

If routes are lazy-loaded, a tab open across a deploy requests a deleted chunk. Fix in the app, not the pipeline — in the entry file:

```ts
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})
```

---

## Step 8 — First deploy

**8a. Clear the target directory** if anything was uploaded manually before. FTP-Deploy-Action computes deletions from its own state file, never a remote listing — files it did not upload are invisible and survive every deploy forever. Empty it via cPanel File Manager or FTP. The site 404s until the first deploy completes; back up anything unique first.

**8b. Deploy**, watching the log. Confirm uploads cover every file **including `.htaccess`**, and all smoke assertions pass.

**8c. Second deploy** (trivial commit): confirm a previous-publish date, few replace lines, and `index.html` appearing *after* the asset uploads — that is the ordering guarantee proving itself.

**8d. Drill the rollback now**, while it is fresh: dispatch with `redeploy_run_id` = the first run's id, confirm the site reverts.

**8e. In a browser:** hard-refresh a deep link, exercise auth, exercise API calls, `curl -sI` the root for redirect loops.

**8f. Rotate any credential pasted into a chat**, then update the secret.

**Gate:** all pass. Record the live URL, transport and rollback procedure in the project's rules file.

---

## Failure modes seen in practice

Ordered by how long each took to diagnose.

| Symptom | Cause |
|---|---|
| CI fails in ~14s | `npm ci` peer conflict that `npm install` tolerated. Step 1a. |
| Deploy green, site unchanged or broken | `.htaccess` missing — `include-hidden-files` defaulted to false, or the file was never `git add`ed |
| FTP logs in, nothing appears on the site | Account scoped to a directory cPanel silently created. Step 4 gate. |
| Strict TLS fails | `FTP_SERVER` set to the domain or an IP instead of the cert's hostname |
| Pipeline hangs with no error | `production` environment has a required reviewer |
| Site loads, config undefined at runtime | A `VITE_` var missing — inlines as `void 0`, builds green. The gate catches it. |
| Favicon 404s outside the subdirectory | Root-absolute URL with no matching file in `publicDir`, so Vite left it unrewritten |
| Orphan assets accumulate | Files present before the first deploy are invisible to the state file |

**Local `dist/` will not match deployed hashes.** Builds are deterministic per platform, but macOS and Linux produce different content hashes. Verify against the live URL, not by diffing local output.
