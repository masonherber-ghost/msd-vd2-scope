---
name: icon-from-file
description: Builds React icon components from exported SVG files and adds them to the design system Icons section under Foundations.
---

## Step 1 — Get the SVG source

Use `AskUserQuestion` to ask the user where their SVG files are — either a folder path on disk or pasted SVG markup. Wait for their answer before proceeding.

---

## Step 2 — Inventory the SVGs

Once you have the folder, use `Glob` to list all `.svg` files.

For each file, derive the component name: strip the extension, convert to PascalCase, append `Icon`.
Examples: `arrow-right.svg` → `ArrowRightIcon`, `eye open.svg` → `EyeOpenIcon`.

Then check `src/components/icons/` for a file with that name. Mark each as **create** or **already exists**.

Before proceeding, show the user the full inventory:
```
Icons to create (3): StarIcon, BellIcon, EditIcon
Already exist (2):   CloseIcon, SearchIcon
```

If any icons already exist, use `AskUserQuestion` to ask:
> "Some icons already have components. What should I do with them?"
- **Skip existing** — only create the new ones (recommended)
- **Replace all** — overwrite every icon, including existing ones, with the SVG from the source folder

Wait for the answer, then update each icon's status to **create** or **skip** accordingly before continuing.

---

## Step 3 — Check for an Icons design system page

Check `src/design-system/sections/index.ts` for an entry with `path: 'icons'`.

- **No Icons section exists** — ask the user what size options they want in the design system (suggest 16, 20, 24, 32 as defaults). Use `AskUserQuestion` and wait for their answer.
- **Icons section already exists** — skip this question and proceed directly to Step 4.

---

## Step 4 — Create icon components

For each icon marked **create**:

1. Read the `.svg` file
2. Extract the `viewBox` value — use it exactly as-is
3. Extract all inner SVG content (paths, circles, groups, etc.)
4. Replace all hardcoded fill and stroke colors (hex, rgb, named) with `currentColor` — but leave `fill="none"` unchanged
5. Remove `<defs>` and `<clipPath>` blocks that only contain a plain rect matching the viewBox — these are Figma export artefacts and are safe to remove. Remove corresponding `clip-path="url(...)"` attributes from any `<g>` elements.
6. Convert SVG attribute names to JSX camelCase: `stroke-width` → `strokeWidth`, `fill-rule` → `fillRule`, etc.
7. Create `src/components/icons/IconName.tsx` following the same pattern as the existing icons in that folder — `forwardRef`, `SVGProps`, `size` prop defaulting to 24, `displayName`, named export

Check the existing icons before writing — some may use `export default` rather than a named export. Match whichever style is already established, or use named exports for all new icons.

---

## Step 5 — Create or update the Icons design system section

### If no Icons section exists

Create `src/design-system/sections/IconsSection.tsx`. Look at existing sections in `src/design-system/sections/` for the established patterns — use `DSSection` as the wrapper and `DSCodeBlock` for usage examples.

The section should include:
- A **size selector** using the sizes confirmed in Step 3, tracked with local state
- A **responsive icon grid** — each cell shows the icon at the active size, its component name below it in monospace text, and copies the component name to the clipboard when clicked with a brief visual confirmation ("Copied!")
- A **usage code example** at the bottom

Style using design tokens only — match the visual style of other foundation sections in the design system.

Then register it in `src/design-system/sections/index.ts` as a lazy import under the `'Foundation'` group, positioned after `'Borders'`.

### If an Icons section already exists

Read the existing file. Add imports for the new icons and add them to whatever registry array the grid uses. Do not change the layout, sizes, or any existing behaviour.

---

## Step 6 — Verify

Run `npm run lint` and `npm run test`. Fix any issues before reporting back.

---

## Step 7 — Report back

```
Icons created (N):
  StarIcon, BellIcon, EditIcon → src/components/icons/

Icons replaced (N):
  CloseIcon → src/components/icons/
  — or —
Icons skipped — already existed (N):
  CloseIcon, SearchIcon

Design system:
  Created new Icons section at /design-system/icons
  — or —
  Added N icons to existing Icons section
```
