---
description: The single reference for where design tokens live, how they are named, and how to consume them. Values themselves live only in code.
---

# Design Tokens

**This file describes the token *system*. It deliberately lists no values.**

Values change with the design system. Restating them in a rules file or skill creates a second source of truth that silently goes stale — and every doc that repeats them has to be found and edited when one number moves. So:

> **`src/globals.css` `@theme` is the only source of truth for token values.**
> Read it. Do not copy values into any other file.

Anything that needs a value at authoring time should read it from there or from the compiled CSS, not from documentation.

---

## One home

All tokens live in `src/globals.css` inside `@theme`.

- **No `design-tokens.css`.** If you find a reference to one, it predates this rule — it is wrong, and the reference should be corrected to `globals.css`.
- **No `tailwind.config.ts`.** Tailwind v4 is CSS-first. Delete it if a tool generates one.

The reason one home works: Tailwind v4 emits every `@theme` entry as a real CSS custom property on `:root`. So a BEM component file consumes the exact same declaration the utilities were generated from:

```css
/* Tailwind:  class="p-4 text-foreground"  */
/* BEM:       the same tokens, via var()   */
.story-card__title {
  color: var(--color-foreground);
  padding: var(--spacing-4);
}
```

A second token file would mean utilities and component CSS reading different definitions of the same value.

---

## Naming is load-bearing

Tailwind generates utilities from the token **prefix**. These names are a contract, not a style preference — rename them and the utilities silently stop existing:

| Prefix | Generates |
|---|---|
| `--color-*` | `bg-*`, `text-*`, `border-*`, `ring-*` |
| `--font-*` | `font-*` |
| `--spacing-*` | `p-*`, `m-*`, `gap-*`, sizing |
| `--radius-*` | `rounded-*` |
| `--breakpoint-*` | responsive modifiers (`sm:`, `md:`, `lg:`, `xl:`) |

**Breakpoints must be named `--breakpoint-sm` / `-md` / `-lg` / `-xl`.** Any other naming (`--breakpoint-tablet-min` and friends) produces no modifiers at all.

Tokens outside these prefixes — `--content-max-width`, for example — are still emitted as custom properties and usable via `var()`. They just generate no utility class.

### Required Shadcn/UI colour names

Shadcn components reference these by name. All of them must exist in `@theme` or components render unstyled:

`background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `border`, `input`, `ring`

If `shadcn init` writes these to a separate block, consolidate them into `@theme`.

---

## Consuming tokens

| Scope | How |
|---|---|
| Page and section layout | Tailwind utilities (`p-4`, `gap-6`, `sm:grid-cols-2`) |
| Custom component internals | BEM CSS file, `var(--token)` — see `rules-css-bem.md` |
| Shadcn primitives | Leave as shipped; they already read the tokens |

**Never hardcode** a colour, spacing, radius, type or breakpoint value. If the design calls for something with no matching token, that is a gap to raise — not a number to inline.

**Never use an arbitrary breakpoint.** Use the four `--breakpoint-*` values via Tailwind modifiers, or the same raw pixel numbers read from `globals.css` in a BEM `min-width` query. A component must reflow at the same width as the layout around it.

---

## Structure of `globals.css`

Four sections, in order:

1. `@import "tailwindcss"` — plus any BEM component CSS imports
2. `@theme { }` — all tokens, in `oklch()` for colours
3. `.dark { }` — only the tokens that change in dark mode
4. `@layer base { }` — element resets only

**Section 3 must be a plain `.dark { }` selector, not `@variant dark { :root { } }`.** The variant form compiles to `:where(.dark, .dark *) :root`, a descendant selector that can never match `<html>`, so every dark token is silently dropped. Class-based dark mode also needs the variant override near the top:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

---

## Verify, because failures are silent

A mis-declared token does not error — it produces no utility and no warning. After any token change, check the compiled output:

```bash
npx vite build

# breakpoints actually emitted
grep -oE "@media\(min-width:[0-9]+px\)" dist/assets/*.css | sort -u

# dark-mode overrides survived
grep -o '\.dark{[^}]*}' dist/assets/*.css | head -c 200

# a specific token resolved
grep -o -- "--content-max-width:[^;]*" dist/assets/*.css
```

An empty result means the declaration was dropped.

---

## Adding or changing tokens

1. Edit `@theme` in `src/globals.css`. Nowhere else.
2. Run the verification greps above.
3. Do **not** update value tables in other rules files or skills — there should be none to update. If you find one, delete it and link here instead.
