---
name: ui-from-prompt
description: Builds a section of React page from a description. Use when asked to adjust an exising page.
---

If there is no prompt or instruction provided as an argument, ask the user in plain text: "What page or section would you like to build?" — do not use the `AskUserQuestion` tool for this. Wait for their response before proceeding.

## Priority order for UI
1. **Reuse** existing components from `src/components/ui/`
2. **Custom Utilies** existing global styles from `src/utilities.css`
2. **Inline JSX + Tailwind** for one-off layout elements

Do **not** create new component files (e.g. `JobCard.jsx`) unless it is specifically prompted. Keep markup in the page file.

## Step 1 — Analyse, then ask clarifying questions

Do not write any code yet. Review the instruction and ask about:
- Interaction and hover states (if unclear, ask for specifics)
- Responsive behaviour at each breakpoint — base (mobile), then the four `--breakpoint-*` tokens in `src/globals.css` (if unclear, ask for specifics)
- Whether anything appears to be a feature intentional removal
- If ANYTHING is unclear, STOP and ask questions - do not assume.

**If this is a full page, also ask about:**
- Header and footer variants used in this page
- Grid structure (e.g. 12-column, content spanning 8 columns, sidebar in remaining 4)

**Use the `AskUserQuestion` tool to present these as clickable options. Do not ask questions in plain text. Wait for answers before proceeding.**


## Step 2 — Plan, then implement

State a brief plan (no approval needed), then build:

Implementation layout elements rules: `rules-layout-elements.md`

## Rules
- Never hardcode colours or font sizes — use css mixins or reference design tokens.
- Avoid creating new component files.
- If anything is unclear, stop and ask — do not assume.
- Every distinct section or potential component must have a unique `id` attribute on its root element (e.g. `id="readiness-card"`, `id="active-hunches"`, `id="triage-bubble"`). Use kebab-case, descriptive names. This allows targeted re-skinning in future.
