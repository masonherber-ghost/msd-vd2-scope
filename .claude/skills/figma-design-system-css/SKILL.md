---
name: figma-design-system-css
description: Extracts design tokens from a Figma design system file into the @theme block of src/globals.css, with an audit step and per-category verification.
---

## Overview

Extracts all design tokens from a Figma design system into `src/globals.css` (`@theme`), then wires them into `globals.css` (Shadcn/UI variables and Tailwind `@theme`).

Work through each step in order. After each step, pause for user verification before continuing.

---

## Before Starting

Ask the user:

> Please share the URL to the Figma design system file.
> Open that page in Figma Desktop, then go to **Share → Copy link** and paste it here.

Extract the `fileKey` from the URL: `https://figma.com/design/:fileKey/:fileName`

---

## Step 1 — Colours: Primitives & Semantics

**Goal:** Write every colour token to `src/globals.css` (`@theme`), split into primitives then semantics.

**Classification — based on raw value only (not token name):**
- **Primitive** — value is a raw colour (`#rrggbb`, `rgba()`, `oklch()`, etc.)
- **Semantic** — value references another variable (shows a variable name string, not a colour)

**Primitives** — group by top-level Figma path segment, one section comment per group:

```css
:root {
  /* ========================================
     PRIMITIVE COLOURS
     ======================================== */

  /* Brand */
  --brand-msd-blue: #017ac9;
  --brand-msd-navy: #134276;

  /* Shades */
  --shades-grey-100: #f5f5f5;
  /* ... */
```

**Semantics** — append inside the same `:root` block, group by top-level path segment. Use `var(--primitive-name)` where a matching primitive exists; otherwise write the hex with a `TODO` comment:

```css
  /* ========================================
     SEMANTIC COLOURS
     ======================================== */

  /* Text */
  --text-dark-accent: var(--brand-msd-blue);
  --text-dark-primary: #333333; /* TODO: no primitive — add one in Figma */

  /* Background */
  --background-light-primary: #ffffff; /* TODO: no primitive — add one in Figma */
  /* ... */
}
```

> Step 1 complete. Check `src/globals.css` (`@theme`):
> - Every colour token from Figma is present
> - Raw-value tokens are in **Primitives**; reference tokens are in **Semantics** using `var(--…)`
> - Any unmatched semantic values have a `TODO` comment
>
> Type **yes** to continue to Step 2, or describe any issues.

---

## Step 2 — Gradients

**Goal:** Write all gradient definitions. Name tokens `--gradient-*`; use `var()` colour references.

```css
  /* ========================================
     GRADIENTS
     ======================================== */

  --gradient-blue: linear-gradient(135deg, var(--brand-msd-blue) 25%, var(--brand-msd-navy) 100%);
  /* ... */
```

> Step 2 complete. Check each gradient uses `var()` references and angles/stops match Figma exactly.
>
> Type **yes** to continue to Step 3, or describe any issues.

---

## Step 3 — Typography

Before extracting, ask the user:

> Please share the URL to the **Typography page** of your Figma design system file.
> Open that page in Figma Desktop, then go to **Share → Copy link** and paste it here.

Extract the node ID from the `node-id` query parameter (e.g. `86-947` → `86:947`), then call `get_variable_defs` with that node ID.

### Step 3a — Identify fonts

From the variable data, extract every unique font family name used in the design system (e.g. `"Inter"`, `"TT Norms Pro"`).

For each font, classify it:
- **Google Font** — recognisable Google Fonts name (Inter, Roboto, Poppins, etc.)
- **Custom / commercial font** — anything else (e.g. TT Norms Pro, Söhne, Graphik)

Present the findings:

> The following fonts are used in the Figma design system:
> - `"Inter"` — available on Google Fonts
> - `"TT Norms Pro"` — custom font, not available on Google Fonts
>
> See instructions below for each font type.

### Step 3b — Set up fonts

**Create the fonts folder first.** Run this before asking the user for anything:

```bash
mkdir -p src/fonts
```

---

**Google Fonts** — generate the exact `<link>` tag using only the weights that appear in the Figma type scale. Add it to `index.html` inside `<head>`, before the closing `</head>`:

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

**Custom fonts** — tell the user exactly which files are needed and where to put them:

> The `src/fonts/` folder has been created. Please copy your **Font Name** font files into it.
>
> Files needed (based on weights used in the type scale):
> - Weight 400 (Regular) — e.g. `FontName-Regular.woff2`
> - Weight 600 (SemiBold/DemiBold) — e.g. `FontName-DemiBold.woff2`
>
> Accepted formats: `.woff2` (preferred), `.woff`, `.ttf`.
> Once the files are in `src/fonts/`, type **ready** to continue.

Once the user confirms, verify with Glob on `src/fonts/**`. List any missing files and ask again before proceeding.

Then write `@font-face` blocks at the top of `src/globals.css` (`@theme`), before `:root`. Match file names exactly to what the user dropped in:

```css
/* ========================================
   FONTS
   ======================================== */

@font-face {
  font-family: 'Font Name';
  src: url('./fonts/FontName-Regular.woff2') format('woff2'),
       url('./fonts/FontName-Regular.woff') format('woff');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Font Name';
  src: url('./fonts/FontName-DemiBold.woff2') format('woff2'),
       url('./fonts/FontName-DemiBold.woff') format('woff');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

/* ... one @font-face block per weight used in the design system ... */
```

One `@font-face` block per weight — only weights that appear in the Figma type scale.

---

**Wire fonts into `globals.css`**

After setting up the `@font-face` declarations, add base font-family rules to the `@layer base` block in `globals.css`. This ensures every heading and body element picks up the correct font without needing a utility class:

```css
@layer base {
  body {
    font-family: var(--font-family-copy);
    /* ... existing body rules ... */
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-family-heading);
  }
}
```

> Fonts set up. Check:
> - Google Fonts `<link>` is present in `index.html`
> - Custom font files exist in `src/fonts/` (verified with Glob)
> - `@font-face` blocks are at the top of `src/globals.css` (`@theme`), before `:root`
> - `font-display: swap` on every `@font-face`
> - `body` has `font-family: var(--font-family-copy)` in `globals.css`
> - `h1–h6` has `font-family: var(--font-family-heading)` in `globals.css`
>
> Type **yes** to continue, or describe any issues.

### Step 3c — Check for responsive artboards

Call `get_metadata` on the same node. Look for artboards named "Desktop", "Tablet", "Mobile" (or similar). If found, call `get_design_context` on each breakpoint's headers artboard to read exact rendered font sizes per breakpoint.

### Step 3d — Write tokens mobile-first

- `:root` holds **mobile** values (smallest breakpoint)
- Append `@media (min-width: …)` blocks after `:root` for tablet and desktop overrides
- **Never** use `max-width` or range queries

Token structure:
1. Font family (`--font-family-primary`)
2. Font weights (`--font-weight-light/regular/medium/bold`)
3. Character & paragraph spacing
4. Headings H1–H6 (size, weight, line-height)
5. Subtitle, strap titles, body copy, component styles (button, error, hint, input, label, tag)

Only include tokens that exist in Figma — do not invent categories.

```css
:root {
  /* ========================================
     TYPOGRAPHY
     ======================================== */

  --font-family-primary: 'Font Name', sans-serif;
  --font-weight-bold: 700;

  --font-h1-size: 40px;
  --font-h1-weight: var(--font-weight-bold);
  --font-h1-line-height: 1.05;
  /* ... */
}

/* ========================================
   RESPONSIVE TYPOGRAPHY — TABLET
   ======================================== */

@media (min-width: <sm>) {
  :root {
    --font-h1-size: 48px;
    /* ... only tokens that change */
  }
}

/* ========================================
   RESPONSIVE TYPOGRAPHY — DESKTOP
   ======================================== */

@media (min-width: <lg>) {
  :root {
    --font-h1-size: 60px;
    /* ... only tokens that change */
  }
}
```

### Step 3e — Verify fonts are rendering

> Open the app in your browser. Inspect an `<h1>` element and go to **DevTools → Computed → font-family**. Confirm it shows the heading font name (e.g. `"TT Norms Pro Trial"`) and not the system fallback (`system-ui`, `Arial`, etc.).
> Do the same for a body paragraph — it should show the copy font (e.g. `"Inter"`).
>
> If the font is not showing:
> 1. **Network tab** — look for 404s on font file requests. The `src` path in `@font-face` is relative to `src/globals.css` (`@theme`), so `./fonts/FileName.woff2` resolves to `src/fonts/FileName.woff2`. Check the file name matches exactly (case-sensitive).
> 2. **No font-family in Computed** — confirm the `body` and `h1–h6` rules were added to `@layer base` in `globals.css`.
> 3. **Font name mismatch** — the `font-family` string in `@font-face` must match exactly what is used in the `--font-family-*` token.
>
> Type **yes** when both heading and body fonts are confirmed, or describe what you see.

> Step 3 complete. Check:
> - Fonts are loaded (Google Fonts import or `@font-face` declarations)
> - Font family, weights, and all type styles are present
> - `:root` holds mobile values; each `min-width` query uses the `<sm>`/`<md>`/`<lg>` widths read from Figma
> - No `max-width` or range queries
> - Fonts visually confirmed in the browser
>
> Type **yes** to continue to Step 4, or describe any issues.

---

## Step 4 — Spacing, Borders, Shadows

**Goal:** Extract spacing scale, border widths, border radii, and elevation shadows.

```css
  /* ========================================
     SPACING
     ======================================== */

  --spacing-000: 0;
  --spacing-100: 4px;
  /* ... */

  /* ========================================
     BORDERS & RADII
     ======================================== */

  --border-width-thin: 1px;
  --corner-radius-none: 0;
  /* ... */

  /* ========================================
     SHADOWS / ELEVATION
     ======================================== */

  --elevation-shadow-color: rgba(22, 44, 69, 0.2);
  --elevation-level-1: 0px 2px 4px 0px var(--elevation-shadow-color);
  /* ... */
```

> Step 4 complete. Check:
> - Spacing scale covers all steps (0 → 1000)
> - All corner radius and border width tokens are present
> - Elevation levels match Figma shadow definitions
>
> Type **yes** to continue to Step 5, or describe any issues.

---

## Step 5 — Breakpoints, Grid & Z-Index

**Goal:** Extract breakpoint values, grid configuration, content max-width, and z-index scale.

```css
  /* ========================================
     BREAKPOINTS
     ======================================== */

  /* Naming must be --breakpoint-sm/md/lg/xl: Tailwind v4 generates its
     sm:/md:/lg:/xl: modifiers from these token names. Any other name
     (--breakpoint-tablet-min and friends) produces no utilities.
     Widths below are placeholders — read the real ones off the grid frame.
     See rules-design-tokens.md; never copy values from another project. */
  --breakpoint-sm: <sm>;   /* read the four widths off the grid frame */
  --breakpoint-md: <md>;
  --breakpoint-lg: <lg>;
  --breakpoint-xl: <xl>;

  /* Desktop content column; usually equals --breakpoint-lg, so the grid goes
     fixed-width at the point the outer margin drops to 0. */
  --content-max-width: <content width>;

  /* Grid — one set per breakpoint, base (mobile) unprefixed.
     Read the real numbers off the design system's grid frame. */
  --grid-columns: 4;
  --grid-gutter: 16px;
  --grid-margin: 16px;
  /* ... --grid-columns-sm / -md / -lg variants ... */

  /* ========================================
     Z-INDEX
     ======================================== */

  --z-index-dropdown: 50;
  /* ... */
```

> Step 5 complete. Check all values match the Figma grid/breakpoint specs.
>
> Type **yes** to continue to Step 6, or describe any issues.

---

## Step 6 — Wire tokens into globals.css

**Goal:** Replace default placeholder values in `globals.css` with `var(--…)` references to the tokens just written, so Shadcn/UI components and Tailwind utilities use real Figma values.

### 6a — Shadcn/UI variables (`@layer base`)

Read `globals.css`. For each variable in `:root` and `.dark` (e.g. `--background`, `--foreground`, `--primary`, `--border`, `--ring`, `--radius`), replace the placeholder `oklch()` value with the best-matching semantic token. Rules:

- Prefer semantic tokens (e.g. `--background-light-primary`) over primitives
- `.dark` block uses dark-mode semantic tokens (e.g. `--background-dark-primary`)
- `--radius` maps to the closest `--corner-radius-*` token
- If no token clearly matches, keep the existing value and add `/* TODO: map to Figma token */`
- Do not remove or rename any existing Shadcn variable — only update its value

```css
@layer base {
  :root {
    --radius: var(--corner-radius-medium);

    --background: var(--background-light-primary);
    --foreground: var(--text-dark-primary);
    --primary: var(--brand-msd-blue);
    --primary-foreground: var(--text-light-primary);
    --border: var(--stroke-default);
    /* ... */
  }

  .dark {
    --background: var(--background-dark-primary);
    --foreground: var(--text-light-primary);
    /* ... */
  }
}
```

### 6b — Tailwind `@theme` block

Update the `@theme inline` block:
- `--radius-sm/md/lg/xl` → direct `var(--corner-radius-*)` references where tokens exist

Breakpoints need **no** aliasing here — they are already named `--breakpoint-sm/md/lg/xl` in the token block, which is what Tailwind generates its modifiers from. Aliasing them to a second set of names only creates a place for the two to drift apart.

```css
@theme inline {
  --radius-sm: var(--corner-radius-small);
  --radius-md: var(--corner-radius-medium);
  --radius-lg: var(--corner-radius-large);
  /* ... */
}
```

> Step 6 complete. Check `globals.css`:
> - All Shadcn/UI `:root` variables reference `var(--…)` tokens (not raw oklch values)
> - `.dark` block references dark-mode semantic tokens
> - `@theme` breakpoints and radii reference token variables
> - Unmatched variables have a `TODO` comment
>
> Type **yes** to continue to Step 7, or describe any issues.

---

## Step 7 — Create utilities.css

**Goal:** Create `src/utilities.css` with utility classes for typography, text colour, background colour, border/stroke colour, and gradients — all using `var(--…)` references to tokens.

### File setup

Create `src/utilities.css`. Then add `@import './utilities.css';` to `globals.css` directly after the `@import "tailwindcss";` line.

### 7a — Typography utilities

One class per type style. Each class sets `font-family`, `font-size`, `font-weight`, `line-height`, and `letter-spacing` from the typography tokens. Cover every type style that exists in `src/globals.css` (`@theme`): headings H1–H6, body sizes (lg/md/sm), and component styles (label, button, error, hint, input, tag).

```css
/* ========================================
   TYPOGRAPHY UTILITIES
   ======================================== */

.text-h1 {
  font-family: var(--font-family-heading);
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-130);
  letter-spacing: var(--letter-spacing-normal);
}

.text-h2 {
  font-family: var(--font-family-heading);
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-130);
  letter-spacing: var(--letter-spacing-normal);
}

/* ... h3–h6, body-lg, body-md, body-sm, label, button, error, hint ... */
```

### 7b — Text colour utilities

One class per semantic text and brand colour token. Use the pattern `.text-{token-suffix}`.

```css
/* ========================================
   TEXT COLOUR UTILITIES
   ======================================== */

.text-primary   { color: var(--semantic-text-primary); }
.text-secondary { color: var(--semantic-text-secondary); }
.text-tertiary  { color: var(--semantic-text-tertiary); }

.text-brand-primary { color: var(--semantic-brand-primary); }
.text-brand-purple  { color: var(--semantic-brand-purple); }
.text-brand-plum    { color: var(--semantic-brand-plum); }
.text-brand-pink    { color: var(--semantic-brand-pink); }

.text-success { color: var(--semantic-success-on-surface-aa); }
.text-error   { color: var(--semantic-error-on-surface-aa); }
.text-warning { color: var(--semantic-warning-on-surface-aa); }
.text-info    { color: var(--semantic-info-on-surface-aa); }
```

### 7c — Background colour utilities

Cover white/black primitives, semantic surface tokens, brand colours, and status colours.

```css
/* ========================================
   BACKGROUND COLOUR UTILITIES
   ======================================== */

.bg-white { background-color: var(--primitive-white); }
.bg-black { background-color: var(--primitive-black); }

.bg-surface-1 { background-color: var(--semantic-grey-surface-1); }
.bg-surface-2 { background-color: var(--semantic-grey-surface-2); }

.bg-brand-primary { background-color: var(--semantic-brand-primary); }
.bg-brand-purple  { background-color: var(--semantic-brand-purple); }
.bg-brand-plum    { background-color: var(--semantic-brand-plum); }
.bg-brand-pink    { background-color: var(--semantic-brand-pink); }

.bg-success { background-color: var(--semantic-success-surface); }
.bg-error   { background-color: var(--semantic-error-surface); }
.bg-warning { background-color: var(--semantic-warning-surface); }
.bg-info    { background-color: var(--semantic-info-surface); }
```

### 7d — Border/stroke colour utilities

One class per semantic border token.

```css
/* ========================================
   BORDER COLOUR UTILITIES
   ======================================== */

.border-default { border-color: var(--semantic-grey-border-1); }
.border-strong  { border-color: var(--semantic-grey-border-2); }
```

### 7e — Gradient background utilities

One class per gradient token defined in `src/globals.css` (`@theme`).

```css
/* ========================================
   GRADIENT UTILITIES
   ======================================== */

.bg-gradient-dark         { background: var(--dark-gradient); }
.bg-gradient-purple-plum  { background: var(--gradient-dark-purple-plum); }
/* ... one class per gradient token ... */
```

**Rules for all utility classes:**
- Only create a class if the referenced token exists in `src/globals.css` (`@theme`)
- Never hardcode colour, size, or spacing values — always use `var(--…)`
- Do not duplicate Tailwind utilities that already exist (e.g. do not create `.font-bold`)
- Class names must be lowercase, hyphen-separated, and clearly describe the token they apply

> Step 7 complete. Check `utilities.css`:
> - Typography classes cover every type style in `src/globals.css` (`@theme`)
> - Text, background, border, and gradient classes use only `var(--…)` references
> - No hardcoded values anywhere
> - `@import './utilities.css';` is present in `globals.css`
>
> Type **yes** to finish, or describe any issues.

---

## Final Check

**1. Ensure imports exist in `globals.css`**

Confirm both lines are present at the top of `globals.css`, in this order:

```css
@import "tailwindcss";
@import './utilities.css';
```

**2. Present the summary**

> All done. Here is what was written:
> - ✅ Primitive colours — grouped by Figma collection
> - ✅ Semantic colour tokens — using `var()` references where a primitive exists
> - ✅ Gradients
> - ✅ Fonts — Google Fonts imported or custom fonts loaded via `@font-face` in `src/globals.css` (`@theme`)
> - ✅ Typography — mobile-first in `:root`, then one `min-width` query per breakpoint token
> - ✅ Spacing scale, border widths, radii, elevation shadows
> - ✅ Breakpoints, grid config, z-index
> - ✅ `globals.css` — Shadcn/UI variables and `@theme` wired to design tokens
> - ✅ `utilities.css` — typography, text colour, background, border, and gradient utility classes
> - ✅ Both imports present in `globals.css`
