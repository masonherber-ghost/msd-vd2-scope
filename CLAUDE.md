# MSD VD2 Scope

Task routing for this repository. This file says **which workflow and which rules file applies to
which kind of task**. It deliberately carries no product description, no feature requirements, and
no design values — those belong in `_docs/` and in `src/globals.css` respectively. Keep it that way.

## Stack

Vite + React 19 + TypeScript · Tailwind CSS v4 (CSS-first) · Shadcn/UI · BEM component CSS · Express + better-sqlite3 · Anthropic API · TanStack Query · React Router v7 · Vitest

**[`.claude/rules/rules-react-shadcn-tailwind.md`](.claude/rules/rules-react-shadcn-tailwind.md) is the source of truth** for file structure, naming, configuration, and patterns. Read it before any implementation. Where another rules file conflicts with it, it wins — *except on component CSS, where `rules-css-bem.md` wins (see Styling).*

Frontend in `src/`, backend in `server/`, single root `package.json`. `npm run dev` starts both.

---

## Styling

Two approaches, each with a defined scope. **Tailwind is the general case; BEM is the specific case and trumps Tailwind wherever it applies.**

| Scope | Approach |
|---|---|
| Page and section layout, spacing, grid, flow | **Tailwind utilities** |
| Prototyping a page before components are extracted | **Tailwind utilities** |
| Shadcn/UI primitives in `src/components/ui/` | Leave as shipped; restyle via tokens |
| **Custom components with their own identity** | **BEM CSS file** — `rules-css-bem.md` |

Inside a custom component, BEM governs the internals. Tailwind utilities are still fine on its parent/wrapper element for placement. Do not reach for Tailwind to style a custom component's internals because it is quicker — extract the BEM file.

**Tokens have one home.** All design tokens live in `src/globals.css` under `@theme`, in `oklch()`. There is no `tailwind.config.ts`. **`rules-design-tokens.md` is the reference** for naming, the Shadcn colour contract, and how to verify a token compiled. Values live only in the CSS — never restated in docs.

Tailwind v4 emits every `@theme` entry as a real CSS custom property, so BEM files consume the same tokens directly:

```css
.block__element {
  color: var(--color-foreground);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
}
```

Never hardcode a color, spacing, or type value in a BEM file.

**Breakpoints — one scale for both systems.** Four `--breakpoint-*` tokens in `@theme` drive both Tailwind's `sm:`/`md:`/`lg:`/`xl:` modifiers and BEM media queries, so a component reflows at the same width as the layout around it. Never use an arbitrary breakpoint.

Page-level styling never creates a BEM file — see `rules-layout-elements.md`.

---

## Workflows

When given a task, identify the type and follow the matching workflow. If unclear, ask before proceeding.

### Component — create or refactor a UI component
Skill: `/component-from-design` · Rules: `rules-css-bem.md`

### Page or section — generate or update from a design
Skill: `/page-from-design` · Rules: `rules-layout-elements.md`

### Page or section — build a working version from a wireframe
Skill: `/page-from-wireframe` · Rules: `rules-layout-elements.md`
Use when the input is low-fidelity — a sketch, whiteboard, or wireframe frame. It indicates
layout and functionality only, never visual detail. Tailwind + existing `ui/` primitives; no
new components, no BEM files. Closes the loop itself: build → verify → `qa-tester` review →
triage → fix → re-review, capped at one fix round.

### Fallback — UI change described in words (no Figma design)
Skill: `/ui-from-prompt`

### Icon — create or replace
Skill: `/icon-from-file`

### New page / route
Rules: `rules-database.md` → **New page / route**
Register the route in `src/routes/index.tsx` (not `main.tsx` — see rules-react-shadcn-tailwind.md → Routing).

### Data change — add or modify a table, column, or index
Rules: `rules-database.md` → **Database change**
Migration → repository → route → `api-client.ts` → hook → invalidate queries. Never write SQL in a route handler; never concatenate user input into SQL.

### AI / API — create or update AI calls or prompts
Rules: `rules-ai-api.md`
Anthropic API called from Express. Prompts centralised in `server/prompts.json` with `{{variable}}` placeholders, substituted and sanitised at runtime. Service in `server/services/`, exposed via a rate-limited `/api/ai/` route, consumed through `src/lib/api-client.ts` and a hook. **The API key is server-side only — never a `VITE_` var.** Mock the provider at the boundary in tests.

### Database backup
Skill: `/backup-db` — timestamped SQLite snapshot into `server/backups/`.

### QA — review a build against its brief
Agent: `qa-tester`
Reviews the build against the brief, derives the scenarios that need covering, judges whether
the existing tests are the right tests, writes the missing ones, and records everything in
[`_docs/qa-scenarios.md`](_docs/qa-scenarios.md). It writes tests and the scenario doc only —
it reports defects with severity and does not edit application source. Run it after any page or
feature build; `/page-from-wireframe` invokes it automatically, then calls it a second time in
**re-review mode** to verify the fixes and confirm no test was weakened to get a green run.

### Design tokens — add or change a token
Rules: `rules-design-tokens.md`
Values live only in `src/globals.css` `@theme`. Never restate them in a rules file or skill.

### Design system — scaffold or extend the design system app
Skill: `/design-system-ui`

### Figma — connect, extract tokens, or audit
Skills: `/figma-mcp` (connect) · `/figma-design-system-css` (extract tokens) · `/figma-audit-design-system` (audit first)
Rules: `rules-figma.md`

### New project setup
Skill: `/setup-site`

### Platform / stack migration
Skill: `/migration-plan`

### Reference-only rules — do not follow for day-to-day work
`.claude/rules/_future/` holds rules for target states not yet in use, each carrying a
`status: future` banner. SQLite via `rules-database.md` is the active data rule; `rules-firebase.md`
and `rules-ai-api-firebase.md` are read only when running `/migration-plan` or when explicitly
asked about that migration.

---

## Before Every Implementation

1. Analyse the design or instruction
2. Check for anything unclear — common gaps:
   - Which design elements map to existing components (always check `src/components/ui/` first)
   - Whether this is page-level (Tailwind) or a custom component (BEM)
   - Figma values (color, spacing, type, radius) with no matching token in `globals.css`
   - Interaction and hover states not shown in the design
   - Responsive behaviour across breakpoints
   - Features not shown — intentional removal, or just off-screen?
3. Ask clarifying questions — do not assume
4. Wait for answers, then present an implementation plan before proceeding

---

## Always

- Preserve existing functionality unless explicitly told to remove it
- Meet WCAG 2.1 AA as the accessibility baseline — keyboard operability, visible focus, sufficient contrast, correct semantics
- Extract exact values from Figma — never approximate
- Route all server state through a TanStack Query hook — never raw `fetch()` in a component
- Write tests for new features; confirm `npm run test`, `npm run lint`, and `npm run build` all pass
- Ask before removing or replacing anything not shown in a design

## Never

- Substitute an icon with a visually similar alternative
- Style a custom component's internals with Tailwind utilities instead of a BEM file
- Hardcode a color, spacing, or type value — use a token from `@theme`
- Invent a design value that has no token or design source
- Use arbitrary breakpoint values
- Write SQL in a route handler, or concatenate user input into SQL
- Expose a secret to the client (no API keys in `VITE_` vars)
- Follow a `_future/` rules file for current work
- Use Bootstrap, Foundation, or other CSS frameworks
- Commit secrets or database credentials
