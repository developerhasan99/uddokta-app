# Builder icon library

80 curated Lucide icons, grouped for commerce, delivery, trust, communication,
marketing, food, lifestyle, and common actions. The English/Bangla catalog and SVG
nodes are vendored from the existing pinned `lucide-react` dependency (1.66.0).
See [LICENSE](./LICENSE) for the original Lucide ISC and Feather MIT notices.

To update the curated list, edit `scripts/update-builder-icons.mjs` and run it
from the repository root with `node scripts/update-builder-icons.mjs`. Review
the generated catalog, nodes, and license changes together. The generator only
reads explicitly listed icons and accepts a small whitelist of SVG primitives.

Page JSON stores stable IDs such as `truck`, or an empty string to remove an
icon. Optional missing fields on older documents remain missing. Validation
rejects unknown IDs; sellers never provide SVG markup or external icon URLs.

`Icon.tsx` is shared by the editor and server renderer. Public HTML includes only
the chosen inline SVGs, so icons require no icon font, external request, or
client-side JavaScript. The admin picker is loaded on demand and supports
English/Bangla search and category filtering. No new dependency is required.
