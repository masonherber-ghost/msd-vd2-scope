---
name: design-system-ui
description: A guide for building out a design system UI for a new project. The foundation files (tokens, globals, utilities) are assumed to already exist. This document covers how to verify them, then how to scaffold the design system documentation app so components can be added modularly over time.
---

## File Structure

```
src/
├── main.tsx                          # Entry point — imports globals.css
├── routes/index.tsx                  # Router — add /design-system/* route here
│
├── globals.css                            # @theme tokens — single source of truth (see rules-design-tokens.md)
├── globals.css                       # Tailwind import, @theme block, base resets
├── utilities.css                     # Typography, colour, gradient utility classes
│
└── design-system/
    ├── DesignSystem.tsx              # Route entry point
    ├── DSLayout.tsx                  # Outer layout: sidebar + content area
    ├── DSSidebar.tsx                 # Navigation sidebar (driven by section registry)
    ├── DSSection.tsx                 # Reusable section wrapper component
    ├── DSCodeBlock.tsx               # Code snippet display component
    └── sections/
        ├── index.ts                  # Central section registry
        ├── OverviewSection.tsx
        ├── ColorsSection.tsx
        ├── TypographySection.tsx
        ├── SpacingSection.tsx
        ├── ShadowsSection.tsx
        ├── BordersSection.tsx
        └── ButtonSection.tsx       # Components group stub
```

---

## Before You Start: Verify Foundation Files

Check all three files are in place before building anything. If any are missing or incomplete, resolve them first using the `/figma-design-system-css` skill.

### `src/globals.css` (`@theme`)

Must exist and contain CSS custom properties on `:root` for:
- Color primitives and semantic colour mappings
- Gradients
- Typography — font family, weights, and a full type scale (h1–h6, body, component text) with responsive `@media` overrides at tablet and desktop breakpoints
- Spacing scale
- Border widths and radii
- Shadows / elevation
- Breakpoints

### `src/globals.css`

Must exist and:
- Import Tailwind (`@import "tailwindcss"`)
- Tokens come from the `@theme` block in `src/globals.css`; import `./utilities.css` for helper classes
- Contain an `@theme inline` block mapping token variables into Tailwind utilities (colours, radii, breakpoints)
- Apply base body resets using token variables

### `src/utilities.css`

Must exist and contain utility classes for:
- Typography — one class per type style (`.text-h1` through `.text-h6`, body sizes, component styles)
- Text colours — one class per semantic text token
- Background colours — one class per semantic background token
- Border colours — one class per semantic border/stroke token
- Gradient backgrounds — one class per gradient token

---

## Step 1: Design System UI Shell

Build the documentation app shell at the `/design-system/*` route.

### Header Navigation

Add a "Design System" link to `src/components/Header.tsx` alongside the existing nav links, using the same `NavLink` + active class pattern:

```tsx
<NavLink
  to="/design-system"
  className={({ isActive }) =>
    cn('text-sm', isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')
  }
>
  Design System
</NavLink>
```

### Routing

Add the design-system route to `src/routes/index.tsx`. Use a lazy-loaded `DesignSystem` component and nest section routes inside it. Redirect the index to the first section (Overview).

```tsx
const DesignSystem = lazy(() => import('@/design-system/DesignSystem'))

// Inside createBrowserRouter:
{
  path: '/design-system',
  element: <DesignSystem />,
  children: [
    { index: true, element: <Navigate to="overview" replace /> },
    // section routes are generated from the registry in DesignSystem.tsx
  ],
}
```

### Layout

Two-column layout: fixed-width sticky sidebar on the left, scrollable content area on the right. On mobile, the sidebar stacks above the content.

- Sidebar background: `var(--semantic-grey-surface-1)`
- Content area background: `var(--primitive-white)`
- Content area max-width: constrained to a readable width with padding from spacing tokens
- Sidebar stays visible while scrolling (`position: sticky; top: 0; height: 100vh`)

### Sidebar Navigation

Driven entirely by the section registry — no manual updates needed when sections are added.

- Group items under their group label ("Getting Started", "Foundation", "Components")
- Group labels: small, subdued style using `var(--semantic-text-secondary)`
- Active link: `var(--semantic-text-primary)` with a subtle background fill using `var(--semantic-primary-surface-1)`
- Group dividers: `var(--semantic-grey-border-1)`

### Section Registry

`src/design-system/sections/index.ts` — single source of truth for all sections. Sidebar, routing, and index pages all read from here.

```ts
export const sections = [
  { path: 'overview',    label: 'Overview',   group: 'Getting Started', component: OverviewSection },
  { path: 'colors',      label: 'Colors',     group: 'Foundation',      component: ColorsSection },
  { path: 'typography',  label: 'Typography', group: 'Foundation',      component: TypographySection },
  { path: 'spacing',     label: 'Spacing',    group: 'Foundation',      component: SpacingSection },
  { path: 'shadows',     label: 'Shadows',    group: 'Foundation',      component: ShadowsSection },
  { path: 'borders',     label: 'Borders',    group: 'Foundation',      component: BordersSection },
  // { path: 'button', label: 'Button', group: 'Components', component: ButtonSection },
]
```

### DSSection — Section Wrapper

Every section uses this as its outer wrapper. Props: `title`, optional `description`, `children`. Renders a heading, a divider, and a content area with consistent vertical spacing from spacing tokens.

### DSCodeBlock — Code Display

Preformatted code block. Style with `var(--primitive-dark-bg-deep)` background, light text, `var(--radius-md)` radius, and small font size from `var(--font-size-copy-sm)`.

---

## Step 2: Foundation Sections

One component per foundation area, each using `DSSection` as the wrapper. Read live token values at render time — do not hardcode values:

```ts
getComputedStyle(document.documentElement).getPropertyValue('--token-name')
```

### Colors

Group by category: primitives, brand colours, semantic mappings (text, background, border), status colours (success, error, warning, info), gradients.

For each colour token show: a filled swatch square, the token name, and the resolved colour value. For gradients, use a wider swatch bar.

### Typography

Render each type style as a live example (text styled with the class) alongside its token values (size, weight, line-height). Group by: headings, body, component styles. Note that sizes are responsive and update automatically at breakpoints.

### Spacing

Visual scale for all spacing tokens. Each step shows a filled bar whose size matches the spacing value, the token name, and the pixel value. Ordered smallest to largest.

### Shadows / Elevation

Each elevation level rendered as a card against a white background, labelled with its token name and `box-shadow` value.

### Borders

All border width tokens and all radius tokens. For radii, show a square with the radius applied so rounding is visible. Label with token name and pixel value.

---

## Step 3: Component Stubs

Add a "Components" group to the sidebar by registering stub sections in the registry. Each stub shows a placeholder state and a usage code example. The sidebar will display the "Components" group heading automatically once any section with `group: 'Components'` is added.

Create a stub section for each component using `DSSection` as the wrapper:

```tsx
// src/design-system/sections/ButtonSection.tsx
import DSSection from '../DSSection'
import DSCodeBlock from '../DSCodeBlock'

export default function ButtonSection() {
  return (
    <DSSection title="Button" description="Interactive button component with multiple variants and sizes.">
      <div style={{ padding: 'var(--spacing-32)', background: 'var(--semantic-grey-surface-1)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--semantic-grey-border-2)', textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--font-size-copy-md)', color: 'var(--semantic-text-secondary)' }}>
          Button component documentation coming soon.
        </p>
      </div>
      <DSCodeBlock>{`<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>`}</DSCodeBlock>
    </DSSection>
  )
}
```

Register it in `sections/index.ts`:

```ts
const ButtonSection = lazy(() => import('./ButtonSection'))

{ path: 'button', label: 'Button', group: 'Components', component: ButtonSection },
```

Sidebar, routing, and layout update automatically. No other files need to change.

## Adding More Components Later

1. Build the component (e.g. `src/components/ui/Button.tsx`)
2. Create `src/design-system/sections/ButtonSection.tsx` using `DSSection`
3. Add one line to `sections/index.ts`:
   ```ts
   { path: 'button', label: 'Button', group: 'Components', component: ButtonSection },
   ```

Sidebar, routing, and layout update automatically. No other files need to change.

---

## Summary

| Layer | File | Purpose |
|---|---|---|
| Tokens | `src/globals.css` (`@theme`) | All CSS variables |
| Integration | `src/globals.css` | Tailwind, `@theme` mapping, base resets |
| Utilities | `src/utilities.css` | Typography, colour, and gradient utility classes |
| Shell | `DSLayout.tsx`, `DSSidebar.tsx` | Sticky sidebar + content area |
| Registry | `sections/index.ts` | Single source of truth for all sections |
| Wrappers | `DSSection.tsx`, `DSCodeBlock.tsx` | Consistent section presentation |
