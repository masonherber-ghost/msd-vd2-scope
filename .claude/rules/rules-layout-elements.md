# Guide & references for different types of elements to build a page or section of a page from.

1. **Typography** — use semantic HTML (`<h1>`, `<h2>`, `<p>`) which inherits styles from `typography.css`. together with css size utilities from mixins.css. Do not use Tailwind font-size classes unless overriding a specific element.

2. **Color** — Utalise css color utilities from mixins.css (if available)
3. **Spacing and layout** — use Tailwind utilities for spacing and layout. Map to design tokens where possible.
4. **No new BEM CSS files** — do not create or modify component CSS for page-level styles.
5. **Add route** — update the router if creating a new page.
6. **Run Vitest & ESLint** — verify all tests pass.