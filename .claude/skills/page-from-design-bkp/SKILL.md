---
name: page-from-design-bkp
description: Builds a React page or section from a Figma design or description. Use when asked to create a new page, route, or section of an existing page.
---

## Before writing any code, read these files:
- `.claude/rules/rules-figma.md` — Figma inspection checklist and token matching process
- `src/design-tokens.css` — existing tokens to match against
- `src/styles/typography.css` — utility classes for text sizes, colours, and gradients
- `src/styles/utilities.css` — utility classes for backgrounds, colours, and other helpers

## UI priority order

1. **Reuse** existing components from `src/components/ui/` (Tag, Button, Card, Badge, etc.)
2. **Custom utilities** from `src/styles/mixins.css`, `typography.css`, and `utilities.css`
3. **Inline JSX + Tailwind** for one-off layout and spacing

Do not create new component or CSS files. Keep all markup in the page file.

---

## Core implementation rules — enforce on every build

### Semantic HTML
- Use semantic HTML elements throughout: `<h1>`, `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, `<section>`, `<header>`, `<nav>`, `<main>`, `<article>`, `<aside>` etc.
- Never substitute a `<div>` where a semantic element fits
- Headings must follow a logical hierarchy (h1 → h2 → h3); never skip levels

### IDs on interactive and structural elements
- Every `<section>`, `<header>`, `<nav>`, `<aside>`, and `<main>` must have an `id` attribute
- Every `<button>` must have an `id` attribute (e.g. `id="add-staple-btn"`)
- Every icon used interactively must have an `id` attribute
- Every significant card or list item container must have an `id` attribute
- Use kebab-case, descriptive IDs (e.g. `id="staple-detail-panel"`, `id="reaction-patterns-section"`)

### Use existing components — never reinvent
- **Buttons** → always use the `<Button>` component from `src/components/ui/Button.tsx`; never use a plain `<button>` element
- **Tags / pills / badges** → always use the `<Tag>` component (or equivalent badge component) from `src/components/ui/`; never style a plain `<span>` as a tag
- Check `src/components/ui/` for: Card, Input, Select, Tabs, Badge, Tag, Avatar, Tooltip, etc. before building anything custom

### Typography utility classes
- Read `src/styles/typography.css` before implementing any text
- Use Headings, Paragraphs, and Lists for all text content; never use `<div>` or `<span>` for text.
- Apply the utility classes from that file for text sizes (e.g. `.text-label`, `.text-body`, `.text-heading-sm`)
- Apply colour and gradient utilities from `typography.css` and `utilities.css` (e.g. `.text-muted`, `.text-accent`, `.gradient-text`)
- Never hardcode font-size, color, or font-weight values inline — always use utility classes or design tokens

### Background and colour utilities
- Read `src/styles/utilities.css` before implementing any backgrounds or colours
- Use the utility classes for background colours and gradients; never hardcode colour values

---

## Step 1 — Inspect the design, then ask clarifying questions

Do not write any code yet. Use the Figma MCP to inspect the design (following `rules-figma.md`), then ask about:
- Which design elements map to existing components or features
- Any Figma values with no match in `design-tokens.css`
- Interaction and hover states not visible in static frames
- Responsive behaviour at mobile / tablet (744px) / desktop (1280px)
- Features not shown — intentional removal or just off-screen?

**If this is a full page, also ask about:**
- Header and footer variants used in this page
- Grid structure (e.g. 12-column, content spanning 8 columns, sidebar in remaining 4)

**Use the `AskUserQuestion` tool to present these as clickable options. Do not ask questions in plain text. Wait for answers before proceeding.**

---

## Step 2 — Plan, then implement

State a brief plan, then build:

**If this is a full page:**
1. **Scaffold** — use `src/pages/ScaffoldTwoCol.tsx` as the boilerplate template for any 2-column layout page. It uses a 12-column grid (`grid lg:grid-cols-12 gap-6`) with pre-wired IDs (`#scaffold-hero`, `#scaffold-left-col`, `#scaffold-right-col`). Copy it, rename it, and replace the placeholder divs with real content. Adjust column widths using `col-span-{number}` on each column (e.g. `col-span-5` left + `col-span-7` right for an asymmetric split); the two columns must always sum to 12.
2. **Layout** — use `.content` + Tailwind grid for page structure, derived from the design's column layout
3. **Add route** — update the router in `src/routes.tsx`

**If this is a section:**
1. **Locate** the correct page file and find the right place to add the section
2. **Layout** — use Tailwind flex/grid utilities scoped to the section

**Both page and section:**
Implementation layout elements rules: `rules-layout-elements.md`
- **No new BEM CSS files** — do not create or modify component CSS for page-level styles.
- **IDs** — apply `id` attributes to all sections, buttons, icons, and major structural elements (see above).
- **Semantic HTML** — use heading tags, paragraph tags, lists etc. (see above).
- **Existing components** — use Button, Tag, and other `ui/` components wherever they fit (see above).
- **Typography utilities** — apply classes from `typography.css` and `utilities.css` for all text styling (see above).
- **Run Vitest + ESLint** — verify all tests and linting pass before finishing.
