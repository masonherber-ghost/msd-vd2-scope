# Design source — Claude Design "VD2 Scope Map"

The visual language comes from the Claude Design project
`2c848a8b-fab7-4197-9111-d5dbb3f04183`, exported as
`_inputs/VD2 Scope Map-claude-design.html` (a self-unpacking bundle).

## What was taken

- **Colour** — the MSD ramp from the design's own `:root` block, converted
  from sRGB to `oklch()` for `@theme`. Nothing was invented; every value
  traces to that file.
- **Type** — Atkinson Hyperlegible, self-hosted in `public/fonts/`.
- **Layout** — phases across the top as numbered stages, rows down the side,
  dashed empty cells, cards with an ID, a release pill and a coloured leading
  edge, the actor legend, release chips and the closing release horizons.

## What was deliberately not taken

**The data.** The mockup carries placeholder content that disagrees with the
database, which is authoritative:

| | Mockup | Database |
|---|---|---|
| Releases | 4 (R1–R4 → 1.1–1.4) | 5 (adds 2; 1.9 merged into 1.4 by OV-003) |
| Stages | 8, including "Onboarding via invite" | 7 canonical — PRD §4 folds the invite stage into Access & Onboarding |
| Feature ids | includes `SVD-993`, `SVD-958`, `—` | `F-nnn` only |
| Placement | e.g. F-050/F-051 under Manage Vacancies | as the two source documents record them |

The mockup also predates the F-085 split, so it has 48-era content.

**Dark mode.** The design defines none, and dark mode was removed rather than
inventing a dark palette with no source.

## Deviations worth knowing

- **Rows are switchable.** The design has both an actor view and a release
  view; both are kept. Release view is the default because a cell then
  carries the release the create flow pre-fills from.
- **A fifth actor row, "No actor recorded."** Actors come from a feature's
  capabilities, so F-008 and F-029 — which have none — would otherwise
  vanish from the actor view.
- **A feature appears in every actor row it has capabilities for.** The
  design does the same, putting F-001 in both the employer and system rows.
- **`@theme static`.** Several tokens are only referenced through a var()
  name composed at runtime, which Tailwind's scanner cannot see; without
  `static` they are tree-shaken out and the colour silently resolves to
  nothing.
