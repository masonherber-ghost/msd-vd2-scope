---
description: Rules for inspecting and implementing Figma designs using the Figma MCP connection
---

# Working with Figma Designs

## Before implementing anything

When given a Figma design, use the Figma MCP (`figma-desktop`) to inspect the design programmatically. Do not guess at values — read them directly from the file.

Work through each category below in order. For each one: read the Figma values via MCP, then check whether a matching token already exists in `src/globals.css` (`@theme`). Report any gaps before writing any code.

---

## Inspection checklist

### 1. Colors
- Read all fill and stroke values used in the design
- For each value, find the matching variable in `src/globals.css` (`@theme`)
- Flag any hardcoded hex/rgb values that are not referenced through a Figma variable
- Flag any Figma variables that have no match in `src/globals.css` (`@theme`)

### 2. Spacing
- Read all padding, margin, and gap values
- Match each to the closest spacing token in `src/globals.css` (`@theme`)
- Flag any values that fall between existing tokens or don't match the scale

### 3. Typography
- Read the type style applied to each text element (font family, size, weight, line height, letter spacing)
- Check whether each maps to an existing type style or HTML tag style in the project
- Flag any type styles that are new or don't have a matching token/style

### 4. Border radius
- Read all border-radius values
- Match each to an existing radius token in `src/globals.css` (`@theme`)
- Flag any new values not in the token set

### 5. Icons
- Read the icon component names from Figma
- Check `src/components/icons/` for matching existing components
- For any icon not already implemented: extract the exact SVG paths from Figma — do not substitute with Lucide or any other library
- Only use Lucide React when no Figma design exists for that icon at all

### 6. Other
- Note any gradients, shadows, or effects and check for matching tokens in `src/globals.css` (`@theme`)
- Flag anything with no existing token

---

## After inspection — before implementing

Present a summary of findings:
- Which values map cleanly to existing tokens
- Which values have no match and need new tokens added to `src/globals.css` (`@theme`)
- Which icons need to be created as new components
- Any ambiguities about responsive behaviour, hover/focus states, or features not shown in the design

**Wait for confirmation before proceeding to implementation.**

---

## Token file

See `rules-design-tokens.md` for the token system — naming contract, the required Shadcn colour names, and how to verify a token compiled.

All design tokens live in `src/globals.css` (`@theme`). This file is imported into `src/globals.css` and feeds the `@theme` block. Always match Figma values to tokens in `src/globals.css` (`@theme`) — never hardcode values in component files.

---

## Icon extraction

When creating a new icon component from Figma:
1. Use the MCP to get the exact SVG node from Figma (do not use copy/paste if MCP can read it directly)
2. Create the component at `src/components/icons/IconName.tsx`
3. Name: Figma component name → PascalCase + `Icon` suffix (e.g. `ArrowRightIcon`)
4. Replace hardcoded fill/stroke colors with `currentColor`
5. Expose `size` (sets `width` and `height`), `className`, and any Figma variants as props
6. Use `forwardRef` and extend `SVGProps`
