# CSS Guidelines: BEM Naming Convention

Global CSS files with BEM naming for all component styles. This guides AI to write CSS correctly for this app.

## BEM Structure

| Pattern | Usage | Example |
|---------|-------|---------|
| `.block` | Component root | `.button`, `.card` |
| `.block__element` | Sub-component part | `.button__icon`, `.card__header` |
| `.block--modifier` | Block-level variant/state | `.button--outline`, `.card--elevated` |
| `.block__element--modifier` | Element-level variant/state | `.button__item--selected` |

Do **not** nest modifiers: `.button--outline__text` is wrong. Use `.button__text` alongside `.button--outline`.

## Rules

### 1. Design Tokens
Always use CSS variables from the `@theme` block in `src/globals.css`. Never hardcode colours, spacing, radii or typography values.

Tailwind v4 emits every `@theme` entry as a real custom property, so BEM files consume the exact same tokens the utilities use. **See `rules-design-tokens.md`** for the naming contract and the full list — do not restate token values here.

```css
.story-card__title {
  color: var(--color-foreground);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
}
```

### 2. One Component = One CSS File
Create a dedicated file alongside the component in `src/components/`, import it in `globals.css`. Never mix multiple components in one file. (`src/components/ui/` is Shadcn/UI's folder — restyle those via tokens, don't add BEM files there.)

### 3. Organize CSS with Section Comments

```css
/* ========================================
   BLOCK BASE
   ======================================== */

/* ========================================
   VARIANTS / MODIFIERS
   ======================================== */

/* ========================================
   RESPONSIVE ADJUSTMENTS
   ======================================== */
```

### 4. States with Pseudo-Classes & Data Attributes
Use `:hover`, `:disabled`, `:focus-visible` for interactive states. For Radix/shadcn components, style injected data attributes directly.

```css
.button:hover:not(:disabled) { background-color: var(--gradient-blue); }
.button:disabled { opacity: 0.6; cursor: not-allowed; }
.accordion__item[data-state="open"] { border-bottom-color: var(--stroke-accent); }
```

### 5. Modifiers Are Additive
Always apply modifiers alongside the base class: `"button button--outline button--sm"`.

### 6. Tailwind Interoperability
Use BEM for component internals. Tailwind utilities (e.g. `mb-4`, `w-full`) are fine on parent/wrapper elements.

### 7. Third-Party Overrides
When overriding external libraries (e.g. `sonner`), `!important` is acceptable to override dynamically injected inline styles.

### 8. Responsive — Mobile-First

**All CSS must be written mobile-first.** Base styles = mobile. Use `min-width` media queries to progressively enhance. Never use `max-width` or range queries.

```css
/* ✅ CORRECT — mobile first, min-width only, widths from @theme */
.card { padding: var(--spacing-4); }
@media (min-width: <sm>)  { .card { padding: var(--spacing-6); } }
@media (min-width: <md>)  { .card { padding: var(--spacing-8); } }
@media (min-width: <lg>)  { .card { padding: var(--spacing-10); } }

/* ❌ WRONG */
@media (max-width: …) { ... }                    /* max-width */
@media (min-width: <sm>) and (max-width: …) {}   /* range query */
@media (min-width: 1024px) { ... }               /* not a token */
```

Read the actual pixel values for `<sm>`/`<md>`/`<lg>`/`<xl>` from `--breakpoint-*` in `src/globals.css`.

### 9. Breakpoints — Design Tokens Only

**One scale, shared with Tailwind.** BEM media queries must use the same widths Tailwind generates its `sm:`/`md:`/`lg:`/`xl:` modifiers from, so a component reflows at the same width as the layout around it.

The four values are defined once as `--breakpoint-sm/md/lg/xl` in the `@theme` block of `src/globals.css`. **Read them from there** — see `rules-design-tokens.md`. They track the design system's grid and change with it, so they are deliberately not listed here.

CSS custom properties cannot be used inside `@media` queries, so the raw pixel value has to be typed in the query. That is the one place a token value appears outside `globals.css` — copy it from there, never from memory or from another doc.

Older named tokens (`--breakpoint-tablet-min` and friends) are retired; flag them rather than adding more.

## Component Checklist

- [ ] Dedicated `.css` file in `src/components/`, imported in `globals.css`
- [ ] Block name matches component name (lowercase, hyphen-separated)
- [ ] All values use design tokens
- [ ] States use pseudo-classes, not BEM modifiers
- [ ] CSS grouped with section comments
- [ ] Base styles are mobile; `min-width` queries use the `--breakpoint-*` values from `globals.css`
- [ ] No `max-width` queries, no range queries, no non-token breakpoints
