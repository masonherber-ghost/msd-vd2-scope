---
name: figma-audit-design-system
description: Audits a Figma design system file — inspects variable collections, surfaces hardcoded values, broken alias chains, naming inconsistencies, and missing tokens. Run this before /figma-design-system-css to catch issues early.
---

## Overview

This skill inspects the full variable structure of a Figma design system file and produces a structured audit report. Its purpose is to surface problems before any CSS is written, so the user can decide whether to fix issues in Figma first or proceed with extraction.

Run this skill before `/figma-design-system-css`.

---

## Before Starting

Ask the user for the Figma file URL if not already provided:

> Please share the URL to your Figma design system file. (Open the file in Figma Desktop → Share → Copy link.)

Extract the `fileKey` from the URL: `https://figma.com/design/:fileKey/:fileName`

---

## Step 1 — Fetch Variables

Use `mcp__figma-desktop__get_variable_defs` to retrieve all variable collections and their values.

**Important:** Pass the node ID of the **Colours page** (not just any page) to get the full variable set including all `Shades/*` primitives. If the user hasn't provided a Colours page node ID, use the file-level node (`0:0`) or ask the user to navigate to the Colours page in Figma Desktop first.

If the initial call returns a limited set (e.g. only a handful of tokens), try the Colours page node directly. The node ID appears in the URL when that page is selected.

---

## Step 2 — Classify Tokens

Before auditing, mentally separate the tokens into layers:

- **Primitive tokens** — value is a raw hex/rgb/oklch colour (e.g. `Shades/Greys/Black-80: #333333`)
- **Semantic tokens** — value references another variable by name (e.g. `Text/Dark/Primary → Shades/Greys/Black-80`). Note: the MCP tool resolves aliases to their final hex, so you must reconstruct alias relationships by matching resolved hex values against the primitive set.

---

## Step 3 — Produce Audit Report

Analyse the variable data and produce a report covering all four categories below.

### 🔴 Hardcoded Values (High Priority)
Semantic tokens whose resolved hex value does **not** match any primitive in the file — meaning the alias is missing and the value is set directly in Figma.

### 🟠 Broken Reference Chains (Medium Priority)
- Tokens that reference a variable that doesn't exist in the file
- Tokens with empty values (e.g. `Gradient-Blue: ""`)
- Effect tokens that reference semantic tokens which themselves have no primitive backing

### 🟡 Naming Inconsistencies (Low Priority)
- Mixed conventions within the same collection (`camelCase` vs `kebab-case` vs `Title Case`)
- Root-level tokens with no collection path (e.g. `Mid: 8`)
- Naming mismatches between related collections (e.g. slashes in primitives, dashes in composites)

### 🔵 Missing Tokens (Gaps)
- Primitive collections with no semantic aliases (unused primitives)
- Semantic categories missing states (hover/focus/disabled/active)
- Incomplete scales (e.g. feedback colours defined but not aliased into semantic layer)
- Categories present in one group but absent in another (e.g. `Icon/Dark/Warning` exists but `Text/Dark/Warning` does not)
- Breakpoints, grid, z-index, elevation levels, or dark mode tokens entirely absent

Present the audit as a table:

| Severity | Token | Current Value | Issue | Recommendation |
|----------|-------|---------------|-------|----------------|
| 🔴 | `Text/Dark/Primary` | `#333333` | No matching primitive — value hardcoded | Add `Shades/Greys/Black-80` primitive and alias |
| 🟠 | `Gradient-Blue` | _(empty)_ | Token exists but value is empty | Define gradient in Figma |
| 🟡 | `Mid` | `8` | Root-level orphan — no collection path | Move into `Corner radius/` or `Spacing/` collection |
| 🔵 | `Shades/Red/Red-15` | `#f8e1e0` | Primitive defined but no semantic token aliases it | Add `Background/Light/Error` semantic token |

---

## Step 4 — Summary & Recommendation

After the table, provide a brief summary:

- Total tokens found (primitive vs semantic count)
- Number of issues by severity
- Whether it is safe to proceed with `/figma-design-system-css` as-is, or whether Figma fixes are strongly recommended first

**Then ask:**

> Here is the audit report. Do you want to fix issues in Figma first, or proceed with `/figma-design-system-css` to extract tokens as-is (hardcoded values will be flagged with TODO comments in the CSS)?
