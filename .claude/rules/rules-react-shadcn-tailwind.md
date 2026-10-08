# React Application Development Guide
## Vite + Shadcn/UI + Tailwind CSS v4 + Firebase (Firestore + Auth) — static, no server

---

## Project Structure

```
project-root/
├── src/
│   ├── components/
│   │   ├── ui/           # Shadcn/UI components (owned, editable)
│   │   └── icons/        # Custom SVG icon components
│   ├── pages/            # Route-level page components
│   ├── routes/index.tsx  # The route table (lazy pages, basename)
│   ├── hooks/            # TanStack Query hooks + Context providers (AuthContext)
│   ├── lib/
│   │   ├── api-client.ts      # Every read and write the app makes — typed, Firestore underneath
│   │   ├── scope-store.ts     # The held store: one load, queued writes
│   │   ├── firestore-client.ts# Firestore IO: read the store, commit a plan
│   │   ├── scope-plan.ts      # Pure planners — validation + writes, one per action
│   │   ├── scope-graph.ts     # deriveScopeGraph — what every view renders
│   │   ├── scope-records.ts   # Stored document shapes, collection names
│   │   ├── firebase.ts        # SDK init from VITE_FIREBASE_*
│   │   └── validators.ts      # zod schemas
│   ├── assets/fonts/     # Fingerprinted by Vite — keep files out of public/
│   ├── globals.css       # Tailwind import + all design tokens (@theme)
│   └── main.tsx
│
├── admin/                # Node + Admin SDK: re-import, backup, restore, seed (bypasses rules)
│   └── import/           # Source-document parsers, reconcile, overrides, plan-import
├── public/.htaccess      # Apache: SPA fallback, caching, https (copied into dist/)
├── firestore.rules       # The security boundary — owner UID pinned
├── firebase.json         # Emulator config
├── .github/workflows/    # ci.yml (branches) + deploy.yml (main → cPanel)
├── backups/              # Firestore JSON backups; sqlite/ = final pre-migration DB
├── .env.example          # VITE_FIREBASE_* (public web config) + VITE_USE_EMULATORS
├── vite.config.ts        # base: '/scopemap/'
└── package.json          # single root package.json
```

There is **no server**. The browser talks to Firestore; the host serves files.
Data rules: `rules-firebase.md`. Hosting: `rules-deploy-hosting.md`.

---

## Vite Setup

**Path aliases** — configure in `vite.config.ts` and `tsconfig.json`:
- `@/` → `src/`
- `@/components` → `src/components/`
- `@/lib` → `src/lib/`
- `@/hooks` → `src/hooks/`

**Base path** — the site is served from `/scopemap/`, so `base: '/scopemap/'`.
The dev server is therefore at `http://localhost:5173/scopemap/`. Never write a
root-absolute URL (`/foo`) in code or CSS; import assets so Vite rewrites them.

**Environment variables** — client vars are `VITE_`-prefixed and compiled into
the public bundle, so **nothing secret ever goes in one**. The Firebase web
config is public by design (`firestore.rules` is the boundary). Never commit
`.env`; keep `.env.example` listing every key. `src/lib/firebase.ts` fails
loudly on a missing value.

```
# .env (root — read by Vite)
VITE_FIREBASE_API_KEY=… (six VITE_FIREBASE_* values)
VITE_USE_EMULATORS=false   # true points the dev build at the local emulators
```

Secrets live only in `admin/service-account.json` (Admin SDK, gitignored) and,
if AI is ever added, Cloud Functions secrets (`rules-ai-api.md`).

---

## Tailwind CSS v4 (CSS-First)

**No `tailwind.config.ts`**. All configuration lives in `src/globals.css`. If a tool generates a `tailwind.config.ts`, delete it.

**`globals.css` has four sections in order:**
1. `@import "tailwindcss"` — replaces the old `@tailwind` directives
2. `@theme { }` — all design tokens as CSS custom properties
3. `.dark { }` — only the tokens that change in dark mode
4. `@layer base { }` — HTML element resets only

**Do not write section 3 as `@variant dark { :root { } }`.** It compiles to `:where(.dark, .dark *) :root` — a descendant selector that can never match `<html>` — so every dark token is silently dropped and the theme toggle appears to do nothing. Use a plain `.dark { }` selector: it is unlayered, and unlayered CSS outranks the `@layer theme` block that `@theme` compiles into, so the overrides win regardless of specificity.

**Token naming drives utility generation automatically:**
- `--color-*` → `bg-*`, `text-*`, `border-*`, `ring-*`
- `--font-*` → `font-*`
- `--spacing-*` → `p-*`, `m-*`, `gap-*`, sizing
- `--radius-*` → `rounded-*`
- `--breakpoint-*` → responsive modifiers (`sm:`, `md:`, etc.)

**Required Shadcn/UI color names** — the full list, and the token naming contract that drives utility generation, are in `rules-design-tokens.md`.

**Use `oklch()` for all color values** — perceptually uniform, easier to derive light/dark variants by adjusting the lightness channel.

**Dark mode** — class-based. Add `dark` to `<html>` to activate. Persist to `localStorage`. Apply the class via an inline script in `<head>` before first render to prevent flash — it must be inline and in `<head>`; an external or deferred script paints the light theme first.

Tailwind v4's built-in `dark` variant keys off `prefers-color-scheme`, so class-based dark mode needs an explicit override near the top of `globals.css`:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Use `:where(.dark, .dark *)` — not `(.dark *)` — so the variant matches the root element itself as well as its descendants.

**Verify it compiled.** After setup, build and confirm the dark tokens actually emit:

```bash
npx vite build && grep -o '\.dark{[^}]*}' dist/assets/*.css | head -c 200
```

An empty result means the overrides were dropped — the failure is silent in the browser.

**Breakpoints** — the four `--breakpoint-sm/md/lg/xl` tokens in `@theme`. Values come from the design system's grid and live only in `src/globals.css`; see `rules-design-tokens.md`. Never use an arbitrary width.

Never use arbitrary breakpoint values.

---

## Shadcn/UI

- Components are copied into `src/components/ui/` — you own them, edit freely
- Install only components needed; add more as features require
- Always check `components/ui/` before building a new component from scratch
- Scaffold from the official Shadcn Vite + Tailwind v4 installation path — confirm the docs reference v4 before following steps

---

## Icons

### Custom SVG Icons (from Figma)

When a design provides a specific icon, recreate it as a React component from the exact Figma SVG — do not substitute a similar-looking icon from a library.

**File location:** `src/components/icons/IconName.tsx`

**Component convention:**
- Name: Figma component name converted to PascalCase + `Icon` suffix (e.g. `ChevronRightIcon`)
- Accept `size`, `className`, and any variant props the Figma component defines
- Use `currentColor` for `stroke` and `fill` so the icon inherits text color
- Use `forwardRef` and extend `SVGProps` to keep it composable

**Steps to create a custom icon:**
1. Select the icon frame in Figma and copy as SVG
2. Create `src/components/icons/IconName.tsx`
3. Paste the SVG paths into a React component, replacing hardcoded colors with `currentColor`
4. Expose `size` (maps to `width` and `height`), `className`, and any Figma variant props
5. Use the icon via `<IconName size={24} className="text-primary" />`

### Fallback: Lucide React

When an icon is needed but no design has been provided, use Lucide React. It is the icon set Shadcn/UI uses internally, so it is consistent with the component library.

**Install:**
```
npm install lucide-react
```

**Usage:**
```tsx
import { ChevronRight, Search, X } from 'lucide-react'

<ChevronRight size={20} className="text-muted-foreground" />
```

**Key props:**
- `size` — number (default 24), sets width and height
- `className` — Tailwind classes, use `text-*` to control color via `currentColor`
- `strokeWidth` — default 2, adjust for lighter/heavier weight

Browse available icons at lucide.dev. Never install a separate icon library alongside Lucide — keep the icon set consistent.

---

## React Patterns

**Component hierarchy:**
- `src/components/ui/` — Shadcn/UI primitives (Button, Card, Input)
- `src/components/` — all other components: layout (Header, Footer, Sidebar) and feature-specific composites
- `src/pages/` — route-level components only; compose from above

**State:**
- `useState` / `useReducer` for local state
- React Context for app-wide concerns (theme, auth) — keep context files in `src/hooks/` alongside the hooks that consume them; one context per concern
- TanStack Query for all server state (fetching, caching, mutations)
- Never use raw `fetch()` in components — always go through a custom hook

**Code splitting:**
- Lazy-load routes with `React.lazy()` + `Suspense`
- Lazy-load heavy dependencies (charts, editors)

**Naming:**
- Components + files: `PascalCase` (`UserProfileCard.tsx`)
- Hooks: `camelCase` with `use` prefix (`useUserData`)
- Constants: `UPPER_SNAKE_CASE`

---

## Routing

**Library:** React Router v7, `createBrowserRouter` + `RouterProvider`.

Use v7, not v6. Every v6 release — including the latest, 6.30.6 — is affected by an open-redirect advisory (`>=6.0.0 <7.18.0`) that was never backported; the fix exists only in v7.18.0+. For a SPA using `createBrowserRouter`/`RouterProvider`/`NavLink`/`Outlet`, v7 is API-compatible with v6, so there is no migration cost. Run `npm audit` after installing and expect zero vulnerabilities.

**Route config** — define all routes in `src/routes/index.tsx`. Keep `main.tsx` clean; it only mounts the router. The router's `basename` is derived from Vite's `base` (`import.meta.env.BASE_URL`) — never hardcode it.

**Lazy loading** — wrap every page component in `React.lazy()` and wrap the router with `<Suspense>`. This code-splits each page automatically.

**Layout routes** — use a parent route with a shared layout component (Header, Sidebar, Footer) and `<Outlet />` for the page content. Nested routes inherit the layout without repeating it.

**Auth gate** — `<RequireAuth>` (in `main.tsx`, around the router) renders the sign-in page until Firebase has restored a session. It is a convenience, not security: `firestore.rules` decides what a signed-in account can read.

**404** — always include a catch-all `path="*"` route at the end of the config that renders a not-found page.

**Navigation** — use `<NavLink>` for navigation items (applies active class automatically) and `<Link>` for all other internal links. Never use `<a href>` for internal navigation.

**Direct URL access** — Vite serves `index.html` for client routes in dev; in production `public/.htaccess` does (SPA fallback). A new route needs nothing extra.

---

## Data

**Firestore, from the browser — see `rules-firebase.md`.** In short: one load of
the whole store, every view derived from it, every write a pure planner in
`src/lib/scope-plan.ts` committed in one transaction, the cache synced without a
refetch. Components never import Firebase; they use hooks, and hooks use
`apiClient`.

There is no file storage. If the app ever stores uploads, they go to Firebase
Storage with a rule of their own — never into a Firestore document.

---

## Testing

**Tools:**
- Vitest — unit and component tests
- React Testing Library — component tests (query by role/label/text, not class names)
- Firebase emulators — rules tests and the Web SDK smoke test (`npm run test:emulator`, needs Java)

**Data tests** — planners are pure: build a `RawScope`, run the planner, assert `plan.result`, `plan.next`, or the `ApiError` it throws (`src/lib/scope-plan*.test.ts`, `scope-invariants.test.ts`). Page and hook tests mock `@/lib/api-client` with a **stateful** fake whose writes change the graph it returns — including `scope.cached` — so a write genuinely round-trips; a canned response per call passes while the wiring is broken. After any data-layer change, run `npm run test:emulator`: it is the only test that goes through the real SDK with rules enforced.

**What not to test:**
- Tailwind class names or exact styles
- Shadcn/UI internals
- React framework behavior
- Firebase SDK internals — mock at the boundary (`@/lib/api-client`), or use the emulator

**Scripts (root `package.json`):**
- `npm run dev` — Vite dev server (`/scopemap/`)
- `npm run build` — production build; must complete with zero errors
- `npm run test` — Vitest (single run, exits)
- `npm run test:watch` — Vitest in watch mode
- `npm run test:ui` — Vitest with browser UI
- `npm run lint` — ESLint
- `npm run test:emulator` — rules + Web SDK smoke test against the emulators
- `npm run emulators` — Auth + Firestore emulators, UI on :4000
- `npm run import-scope` — re-import the source documents (dry run; see `/import-scope`)
- `npm run backup-db` — Firestore backup to `backups/` (see `/backup-db`)

---

## Pre-Commit Checklist

- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] No hardcoded secrets, root-absolute URLs, or color/spacing values
- [ ] No `console.log` left in
- [ ] Environment variables used for all config
- [ ] `npm run build` completes cleanly
- [ ] Data-layer change → `npm run test:emulator` passes
