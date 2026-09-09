---
name: figma-css-tokens
description: Extracts design tokens from a Figma file into the @theme block of src/globals.css
---

## Overview

Extract design tokens from the open Figma file and write them into `src/globals.css` (`@theme`).

---

## Step 1 — Inspect the Figma file

Follow `rules-figma.md` → **Inspection checklist** in full:
1. Colors — read all fills and strokes, match to existing tokens, flag gaps
2. Spacing — read all padding/margin/gap values, match to scale, flag gaps
3. Typography — read all type styles, match to existing styles, flag gaps
4. Border radius — read all radius values, match to existing tokens, flag gaps
5. Icons — read icon names, check `src/components/icons/` for existing components
6. Other — gradients, shadows, effects

Present a summary of findings before writing any code:
- Values that map cleanly to existing tokens
- Values with no match that need new tokens
- Icons that need new components
- Any ambiguities about states or responsive behaviour

**Wait for confirmation before proceeding.**

---

## Step 2 — Write the tokens into `@theme`

- Write all confirmed tokens to `src/globals.css` (`@theme`) as CSS custom properties
- Use `oklch()` for all color values
- Group by category with section comments: Colors, Spacing, Typography, Radius, Shadows
- Import the file in `src/globals.css` and map token values into `@theme {}`
- Do not write a `tailwind.config.ts` — all tokens are consumed via `@theme {}` in `globals.css`

**When done, stop and show this checklist:**
```
Verification:
- [ ] `src/globals.css` has an `@theme` block containing tokens matching the Figma design system
- [ ] Token names follow the contract in `rules-design-tokens.md` (`--color-*`, `--breakpoint-sm/md/lg/xl`, …) so Tailwind generates utilities from them
- [ ] Tailwind utilities (e.g. bg-primary, text-foreground) resolve to the correct token values
- [ ] No hardcoded color/spacing/font-size values remain in any component CSS

Reply "done" when all pass, or describe any issues.
```
