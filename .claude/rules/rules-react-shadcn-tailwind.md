# React Application Development Guide
## Vite + Shadcn/UI + Tailwind CSS v4 + OpenAI + SQLite (better-sqlite3)

---

## Project Structure

```
project-root/
├── src/
│   ├── components/
│   │   ├── ui/           # Shadcn/UI components (owned, editable)
│   │   └── icons/        # Custom SVG icon components
│   ├── pages/            # Route-level page components
│   ├── hooks/            # Custom React hooks + Context providers
│   ├── lib/              # utils.ts (cn), api-client.ts, validators.ts
│   ├── globals.css       # Tailwind import + all design tokens (@theme)
│   ├── App.tsx
│   └── main.tsx
│
├── server/
│   ├── routes/           # Express route handlers
│   ├── services/         # openai-service.ts, prompt-service.ts
│   ├── migrations/       # Run-once migration files
│   ├── repositories/     # One file per entity (user-repository.ts, etc.)
│   ├── middleware/       # error-handler.ts, auth.ts
│   ├── prompts.json      # Centralized AI prompts
│   ├── database.ts
│   └── server.ts
│
├── .env.example          # VITE_* vars for frontend
├── server/.env.example   # Server-only vars
├── components.json       # Shadcn/UI config
├── vite.config.ts
├── tsconfig.json
├── package.json          # Single root package.json — runs both client and server
└── .gitignore
```

---

## Vite Setup

**Path aliases** — configure in `vite.config.ts` and `tsconfig.json`:
- `@/` → `src/`
- `@/components` → `src/components/`
- `@/lib` → `src/lib/`
- `@/hooks` → `src/hooks/`

**Dev proxy** — proxy `/api` to the Express server in `vite.config.ts` to avoid CORS issues in development. Do not hardcode `localhost` ports in frontend fetch calls; use the proxy path.

**Ports (defaults):**
- Vite dev server: `5173` (may increment if port is taken — see CORS note below)
- Express server: `3001`

**Environment variables** — prefix client-side vars with `VITE_`. Backend vars need no prefix. Never commit `.env` files. Always maintain `.env.example` files with all required keys listed.

Standard vars for this stack:
```
# .env (root — read by Vite)
VITE_API_URL=http://localhost:3001

# server/.env
PORT=3001
CLIENT_URL=http://localhost:5173
```

**CORS** — the Express server reads `CLIENT_URL` from env to configure the allowed origin. If Vite increments its port (e.g. to `5174` because `5173` is in use), the CORS check will fail. Fix by killing whatever holds `5173` (`lsof -ti :5173 | xargs kill -9`) or updating `CLIENT_URL` to match the actual port. Using the Vite proxy for all `/api` calls avoids this problem entirely in development.

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

**Library:** React Router v7. Configure in `src/main.tsx` using `createBrowserRouter` + `RouterProvider`.

Use v7, not v6. Every v6 release — including the latest, 6.30.6 — is affected by an open-redirect advisory (`>=6.0.0 <7.18.0`) that was never backported; the fix exists only in v7.18.0+. For a SPA using `createBrowserRouter`/`RouterProvider`/`NavLink`/`Outlet`, v7 is API-compatible with v6, so there is no migration cost. Run `npm audit` after installing and expect zero vulnerabilities.

**Route config** — define all routes in `src/routes/index.tsx`. Keep `main.tsx` clean; it only mounts the router.

**Lazy loading** — wrap every page component in `React.lazy()` and wrap the router with `<Suspense>`. This code-splits each page automatically.

**Layout routes** — use a parent route with a shared layout component (Header, Sidebar, Footer) and `<Outlet />` for the page content. Nested routes inherit the layout without repeating it.

**Protected routes** — create a `<ProtectedRoute>` wrapper component that checks auth state from Context and redirects to `/login` if unauthenticated. Wrap protected route groups with it in the route config.

**404** — always include a catch-all `path="*"` route at the end of the config that renders a not-found page.

**Navigation** — use `<NavLink>` for navigation items (applies active class automatically) and `<Link>` for all other internal links. Never use `<a href>` for internal navigation.

**Direct URL access** — configure the Express dev server (or Vite proxy) to serve `index.html` for all non-API routes so that refreshing a client-side URL works correctly.

---

## SQLite — better-sqlite3 + Express

**Driver: `better-sqlite3`** — synchronous API, fastest Node.js SQLite driver, reliable across Node versions. The async `sqlite3` alternative breaks frequently on Node upgrades; do not use it.

**Database file** — stored at `server/msd-vd2-scope.db`, gitignored.

**Repository pattern** — one file per entity in `server/repositories/`. Repositories encapsulate all SQL; route handlers call repository functions and never write SQL directly.

**Prepared statements** — `better-sqlite3` makes these the natural default. Prepare once, run many times. Never concatenate user input into SQL strings.

**Transactions** — use `better-sqlite3`'s transaction wrapper for any multi-step write. It handles rollback automatically on error.

**Migrations** — run-once files in `server/migrations/`. Run on server start; track which have been applied in a `migrations` table.

**Testing** — pass `:memory:` as the database path to get a clean in-memory database per test run. No file cleanup needed.

---

## File Storage

**Local development** — serve uploaded files from `server/uploads/`. Add `express.static('uploads')` to the Express server and store paths (not file contents) in the database.

**Gitignore** — add `server/uploads/` to `.gitignore`.

---

## Testing

**Tools:**
- Vitest — unit and component tests
- React Testing Library — component tests (query by role/label/text, not class names)
- MSW (Mock Service Worker) — mock API responses in integration tests
- Playwright — E2E for critical paths only

**Database tests** — use `better-sqlite3` in `:memory:` mode. Reset schema between tests. Test CRUD, constraints, and transaction rollback. Do not mock the database in repository tests.

**What not to test:**
- Tailwind class names or exact styles
- Shadcn/UI internals
- React framework behavior
- OpenAI/SQLite library internals — mock at the boundary

**Scripts (root `package.json`):**
- `npm run dev` — start both Vite and Express concurrently
- `npm run client` — Vite dev server only
- `npm run server` — Express API server only (watches for changes)
- `npm run build` — production build; must complete with zero errors
- `npm run test` — Vitest (single run, exits)
- `npm run test:watch` — Vitest in watch mode
- `npm run test:ui` — Vitest with browser UI
- `npm run lint` — ESLint

---

## Pre-Commit Checklist

- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] No hardcoded secrets, ports, or color/spacing values
- [ ] No `console.log` left in
- [ ] Environment variables used for all config
- [ ] `npm run build` completes cleanly
