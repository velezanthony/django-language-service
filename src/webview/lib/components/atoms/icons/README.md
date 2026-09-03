# Icons

Material Symbols rendered as inline SVG. One `.svelte` file per icon for tree-shaking.

## Adding a new icon

1. Go to <https://fonts.google.com/icons>
2. Pick the icon, copy its SVG `path` data
3. Create `IconXxx.svelte` here following the existing pattern (Icon atom wrapper + path string)
4. **Add it to `index.ts`**: `export { default as IconXxx } from './IconXxx.svelte';`
   The barrel is exhaustive — one export per file — and skipping this step is
   the whole failure: the component exists, nothing can import it by the name
   every consumer uses, and the icon is simply absent.
5. Import where needed, from the barrel: `import { IconXxx } from '$icons';`
   Every consumer in the tree does it this way. The direct-path form this file
   used to prescribe appears nowhere else in the repository.

## Why inline SVG instead of a font

- VS Code webview CSP blocks external resources by default — no Google CDN
- Bundling the whole font (even subset) for the few icons we need is wasteful
- SVG inherits `currentColor` from CSS, so theme tokens (`text-vsc-link` etc.) work directly
- Tree-shaking: only the icon components you import end up in the bundle
