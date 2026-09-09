---
name: page-from-wireframe
description: Builds a working React page or section from a wireframe. Use when given a wireframe (image, sketch, FigJam, or low-fidelity Figma frame) rather than a finished design. The wireframe indicates layout and functionality only — not final visual detail.
---

## What a wireframe is, and is not

A wireframe tells you **what is on the page, roughly where it sits, and what it does**. It is *not* a visual specification.

| The wireframe IS the source of truth for | The wireframe is NOT the source of truth for |
|---|---|
| Which elements exist on the page | Exact colours, shadows, gradients |
| Their reading order and rough grouping | Exact font sizes, weights, letter spacing |
| Layout structure (columns, sidebar, stacking) | Exact padding, margins, gaps |
| What each control does when used | Border radii, icon weight, stroke widths |
| States that must exist (empty, loading, error) | Pixel positions or line lengths |
| Navigation in and out of the page | Anything that looks like a placeholder box |

**Never measure a wireframe.** Do not extract values from it, do not eyedrop colours from it, do not treat grey boxes as real components. Grey boxes, lorem text, and crossed rectangles are placeholders — read what they *represent*, then build it with project tokens and Tailwind defaults.

Where the wireframe is silent on visual detail, use the **project defaults**: tokens from `@theme` in `src/globals.css` and the Tailwind scale. Pick the sensible default and move on — do not invent a bespoke value, and do not stop to ask about a padding the wireframe never specified.

**This produces a working version of the page.** Real markup, real interaction, real data wiring where the wireframe implies data. Visual refinement happens later against a real design via `/page-from-design`.

---

## Before writing any code, read these files:
- Any product docs in `_docs/` — who this is for and what the page must do
- `src/globals.css` (`@theme`) — the only source of token values
- `.claude/rules/rules-layout-elements.md` — page-level element rules
- `src/components/ui/` — what already exists; check before building anything
- `src/routes/index.tsx` — the route config, if adding a page
- An existing page (e.g. `src/pages/MyStories.tsx`) — to match house style

If `src/styles/` exists, read `typography.css` and `utilities.css` and prefer their utility classes for text and background styling. If it does not exist, use Tailwind utilities backed by `@theme` tokens.

---

## UI priority order

1. **Reuse** existing components from `src/components/ui/` (Button, Card, Badge, Input, Select, Dialog, DropdownMenu, Label, Textarea)
2. **Utility classes** from `src/styles/*.css`, where present
3. **Inline JSX + Tailwind** for everything else

**Create no new files other than the page file, its route entry, and its test.** No new components, no new BEM CSS files, no new `src/components/` entries. If a piece of the wireframe looks like it wants to be a component, build it inline in the page and note it as a future extraction — extracting it is `/component-from-design`'s job, once a real design exists.

---

## Core implementation rules — enforce on every build

### Semantic HTML
- Use semantic elements throughout: `<h1>`–`<h3>`, `<p>`, `<ul>`, `<li>`, `<section>`, `<header>`, `<nav>`, `<main>`, `<article>`, `<aside>`, `<form>`, `<label>`
- Never substitute a `<div>` where a semantic element fits
- Headings follow a logical hierarchy — never skip levels
- One `<h1>` per page

### IDs on interactive and structural elements
- Every `<section>`, `<header>`, `<nav>`, `<aside>`, `<main>` gets an `id`
- Every button gets an `id` (e.g. `id="add-panel-btn"`)
- Every interactive icon gets an `id`
- Every significant card or list-item container gets an `id`
- Kebab-case and descriptive (`id="story-progress-bar"`, not `id="div3"`)

These IDs are what the QA agent and future tests anchor to. They are not optional.

### Use existing components — never reinvent
- **Buttons** → the `<Button>` component from `src/components/ui/button.tsx`; never a bare `<button>`
- **Tags / pills / badges** → the `<Badge>` component; never a styled `<span>`
- **Inputs, selects, dialogs, menus** → the `ui/` primitives
- Check `src/components/ui/` first, every time

### Tokens only — never a hardcoded value
- No hardcoded colour, spacing, radius, font size, or breakpoint
- Tailwind utilities resolve to `@theme` tokens; use them
- If the wireframe implies something with no matching token, use the nearest token and say so in your summary. Do not add a token — that is `rules-design-tokens.md` work and needs its own decision.

### Data and state
- Any server state goes through a TanStack Query hook in `src/hooks/` — **never a raw `fetch()` in the page**
- If the wireframe implies data that has no hook yet, either reuse the closest existing hook or stub with local state and flag it explicitly in your summary. Do not invent a new endpoint silently.
- Every async surface renders three states: pending, error, and empty. The wireframe usually shows only the populated state — build the other three anyway.

### Accessibility requirements (WCAG 2.1 AA) — apply without being asked
- Comfortable touch targets on every interactive control
- Text and interactive boundaries meet AA contrast
- Every control has an accessible name; every input has an associated label
- The primary journey is completable by keyboard alone, with visible focus throughout
- Visible progress feedback on any multi-step flow
- Minimal drag-and-drop; anything draggable needs a keyboard/button equivalent
- Plain, short copy

---

## Step 1 — Read the wireframe, then ask only what matters

Inventory the wireframe first: list every element, its purpose, and its state requirements. Then ask **only about things the wireframe genuinely leaves ambiguous about layout or behaviour**.

Ask about:
- What a control actually does, where the wireframe shows it but not its effect
- Where data comes from, when the wireframe implies real content
- Whether a boxed area is a real feature or a placeholder for later
- Responsive intent — what stacks, what collapses, what hides at mobile
- Navigation — how the user arrives, and where each exit leads
- Whether something absent is intentionally out of scope or just not drawn

Do **not** ask about:
- Colours, spacing, type, radii, shadows — use tokens and defaults
- Hover and focus styling — use the project defaults
- Anything already answered by the product docs in `_docs/` or the rules files

**Use the `AskUserQuestion` tool — clickable options, not plain-text questions. Wait for answers before writing code.**

---

## Step 2 — Plan, then implement

State a brief plan (element inventory → layout structure → data → states), then build.

**If this is a full page:**
1. **Scaffold** — for a two-column layout, copy `src/pages/ScaffoldTwoCol.tsx` if it exists; otherwise start from the closest existing page. Use a 12-column grid (`grid lg:grid-cols-12 gap-6`); column spans must sum to 12.
2. **Layout** — Tailwind grid/flex, mobile-first. Base styles are mobile; add `sm:` / `md:` / `lg:` / `xl:` to enhance. Never an arbitrary breakpoint.
3. **Route** — add the lazy-loaded entry to `src/routes/index.tsx`. Static segments before dynamic ones; the `path: '*'` catch-all stays last.
4. **Navigation** — add the page to the relevant nav component so it is reachable.
5. **Test** — add a render test alongside the page (`src/pages/<Page>.test.tsx`), following the house pattern: `installFakeApi` from `src/test/fake-api.ts`, wrapped in `QueryClientProvider` + `MemoryRouter`. Query by role, label, and text — never by class name.

**If this is a section:**
1. **Locate** the page file and the correct insertion point
2. **Layout** — Tailwind flex/grid scoped to the section
3. **Extend** the page's existing test rather than adding a new file

**Both:**
- No new BEM CSS files, no new components
- IDs on all sections, buttons, icons, and major containers
- Semantic HTML with a valid heading hierarchy
- `ui/` primitives wherever they fit
- Tokens for every value

---

## Step 3 — Verify, then hand off to QA

Run all three and confirm they pass:

```bash
npm run test
npm run lint
npm run build
```

Then write your build summary, in this order:
1. **What was built** — the element inventory, mapped to what you implemented
2. **Assumptions made** — every default you chose where the wireframe was silent, and every answer you got in Step 1
3. **Flagged gaps** — stubbed data, missing hooks, missing tokens, wireframe items deliberately not built
4. **Deviations** — anything you built differently from the wireframe, and why

### Write the brief down before you call the agent

**The agent cannot see the wireframe.** A subagent receives text only — a pasted image, a
Figma frame, or anything you looked at in this conversation is invisible to it. If you hand
off without transcribing, it will reconstruct the intent from the code it is meant to be
judging, and the review becomes worthless.

So before calling it, write the brief into the prompt as text: every element the wireframe
shows, what each control does, the states required, the layout structure, and the navigation
in and out. If the wireframe is a file on disk, give the path **as well as** the transcription.

### Launch the agent

Call the `qa-tester` agent with all of:

- **The transcribed brief** — as above
- **The wireframe file path**, if one exists
- **Paths** — the page file, its route entry, its hooks, its test file
- **Your build summary**, verbatim — assumptions, gaps, and deviations included
- **Anything already settled** — the Step 1 answers, so it does not re-raise a decision the user already made

Run it in the foreground; the fix loop below depends on its report.

The agent derives the scenarios, judges whether the existing tests are the right tests, writes
the missing ones, records everything in `_docs/qa-scenarios.md`, and reports defects with
severity. It does not edit the page — that is Step 5.

---

## Step 4 — Triage the report

**Its report is not shown to the user.** Relay it yourself: the verdict, the gate results, and
every S1/S2 finding. Do not bury a failure in a summary line.

Expect the suite to be red. The agent writes tests for gaps it found, and a test that fails
against the current build is its most valuable output — not a mistake to undo.

Give every finding one of three dispositions:

| | When | What you do |
|---|---|---|
| **Accept** | The finding is correct | Fix it in Step 5 |
| **Dispute** | The finding is wrong on the facts | Say why, with the evidence. Then re-check — a disputed S1 is usually a real bug you have not understood yet. |
| **Defer** | Correct, but out of scope for a prototype | Only with a stated reason, and only for the severities below |

**What you may not do:**

- **Never dispute a finding by changing its test.** Weakening an assertion, deleting a case, or
  loosening a query to get a green run is the one thing that makes this whole loop a lie. If a
  test is genuinely wrong, say so explicitly in your report and leave it failing.
- **S1 and S2 are not deferrable.** An accessibility failure is a functional defect; a prototype
  that fails one is not a working prototype.
- **Do not defer silently.** Anything deferred is named in your final summary.

S3 and S4 are legitimately deferrable on a wireframe build — say so and move on.

---

## Step 5 — Fix, re-verify, then close the loop

1. **Fix every accepted finding**, S1 first. Same rules as Step 2 — tokens, semantic HTML, IDs,
   `ui/` primitives, hooks for server state. A fix that hardcodes a value or bypasses a hook
   trades one defect for another.
2. **Re-run the gates** until `npm run test`, `npm run lint`, and `npm run build` all pass.
3. **Re-review.** Call `qa-tester` a second time in **re-review mode**: give it your disposition
   for each finding, what you changed, and ask it to verify the fixes and re-run the gates.
   It re-checks the findings rather than re-deriving the page from scratch.

**Cap the loop at one fix round and one re-review.** If findings survive that, stop and put the
decision to the user — do not keep cycling. Repeated rounds on the same finding mean the brief
is ambiguous, not that the fix is hard.

### Final summary

1. **Verdict** — do all three gates pass, and did the re-review clear?
2. **Fixed** — each finding and what changed
3. **Disputed** — each one and the evidence
4. **Deferred** — each one, its severity, and the reason
5. **Still open** — anything the re-review did not clear, and what it needs
6. **Assumptions carried forward** — the ones now recorded in `_docs/qa-scenarios.md`
7. **Next step for a real design** — what `/page-from-design` will need to refine

A prototype is done when the gates are green, the re-review is clear, and every assumption is
written down. Not when the page renders.
