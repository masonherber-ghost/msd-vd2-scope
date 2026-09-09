---
name: component-from-design
description: Builds a React component and CSS file from a Figma design. Use when given a Figma URL and asked to implement a component.
---

## Before writing any code, read these files:
- `.claude/rules/rules-design-tokens.md` — where tokens live and how to consume them
- `.claude/rules/rules-figma.md` — Figma inspection checklist and token matching process
- `.claude/rules/rules-css-bem.md` — BEM naming, mobile-first CSS, design token usage
- `src/globals.css` (`@theme`) — existing tokens to match against
- `src/components/ui/` - check for existing components that match the design before building new ones
- `src/components/icons/` — check for existing icon components before creating new ones

## Step 1 — Inspect the design, then ask clarifying questions

Do not start implementing. Use the Figma MCP to inspect the design, following the checklist in `rules-figma.md`. Then ask about:
- Which design elements map to existing components or features
- Any Figma values with no matching token in `src/globals.css` (`@theme`)
- Interaction and hover states not visible in static frames
- Responsive behaviour across breakpoints
- Anything not shown in the design — intentional removal or just off-screen?

**Use the `AskUserQuestion` tool to present these as clickable multi-choice options. Do not ask questions in plain text. Wait for answers before proceeding.**

## Step 2 — Plan, then implement

State a brief implementation plan, then build:

1. **Check for a Shadcn/UI base** — if one exists, reskin it rather than building from scratch
2. **Create the React component** in `src/components/ui/`
3. **Create the CSS file** alongside it using BEM + design tokens, mobile-first
4. **Import the CSS** in `globals.css`
5. **Add to design system** — add a demo to the relevant design system page and update navigation
6. **Run Vitest** — verify all tests pass before finishing
