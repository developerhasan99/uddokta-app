# Landing-page editor implementation

Implemented 5 November 2026. Premade template presets remain deferred.

## From designs to shared sections

The existing eleven section types remain: hero, text, image, benefits, video, reviews, FAQ, order form, gallery, countdown and contact. Thirteen additions bring the picker to **24 section types**:

| Section | Design need | Content / layout controls |
| --- | --- | --- |
| Announcement bar | Short campaign or delivery message | Text, optional button and destination |
| Page header | Optional branding/navigation | Brand name, logo, navigation link list, CTA |
| Page footer | Optional brand/contact/policy information | Heading, text, link list |
| Image with text | Product story or usage narrative | Heading, body, media, split/reversed/centered layout, CTA |
| Trust strip | Short reassurance or service information | Repeatable title/detail items |
| Steps / process | Preparation, use or ordering sequence | Repeatable numbered steps; grid or list |
| Specifications | Product materials, dimensions, quantities | Label/value rows |
| Comparison table | Compare two packages or options | Column headings, repeatable feature/value rows |
| Image cards / bundle contents | Show ingredients, included items or features | Repeatable image/title/description cards |
| Call to action | Close a narrative with a next step | Heading, description, button, destination |
| Standalone icon | Decorative symbol or linked contact/action | Icon, accessible label, optional destination |
| Icon cards | Service, trust, benefit or marketing cards | Repeatable icon/title/detail cards |
| Icon list | Benefits or checklist with individual symbols | Repeatable icon/title/detail rows |

The existing hero gains eyebrow text, a custom destination, and split/reversed/centered layouts. Checkout gains stacked/two-column layouts and row/card variant presentations; variants, availability, money, server submission and checkout protections still use the existing commerce implementation.

## Settings

Content, Layout and Style tabs separate editing tasks. Layout and Style use grouped, collapsible inspector panels, compact unit inputs, visual alignment/device controls, and color swatches with editable HEX values, palettes and theme resets. There are 49 schema-declared presentation controls, with irrelevant grid/media/icon controls omitted for sections that do not support them:

- Alignment, content maximum width, desktop/mobile grid columns.
- Per-side padding and margins, desktop/mobile spacing box, linked sides, and item gaps.
- Device visibility: all, desktop only or mobile only.
- Background, text, accent/button text, card and border colors.
- Heading/body/button font sizes, mobile heading size, heading weight.
- Noto Sans Bengali / Tiro Bangla font overrides, with their font stylesheets loaded when used.
- Border width/style, card/media corners, section corners, button corners and shadow presets.
- Media object fit and aspect ratio.
- Icon size, stroke, foreground/background color, corners, and plain/soft/outline/solid treatments.

Blank controls inherit defaults. Zero is a valid spacing/border/corner override. Resetting a tab removes its presentation overrides. Layout also exposes each section's usable anchor link. Custom links permit explicit HTTPS, section anchors, tel and mailto destinations; unsafe schemes are rejected.

## Persistence and compatibility

The existing version-1 JSON format now accepts optional `section.style` and `content.canvas` objects. Validation uses fixed field definitions, bounded numbers, hex colors and enumerated choices. Unknown properties are discarded; invalid declared values are refused. No arbitrary CSS or HTML is stored.

```json
{
  "version": 1,
  "canvas": { "header": false, "footer": false },
  "sections": [
    {
      "id": "story",
      "type": "imageText",
      "hidden": false,
      "settings": {
        "heading": "Our story",
        "text": "Where the product comes from",
        "image": null,
        "layout": "reverse",
        "button": "Details",
        "link": "#details"
      },
      "style": {
        "background": "#163b2e",
        "color": "#fffaf0",
        "headingSize": 52,
        "mobileHeadingSize": 30,
        "paddingTop": 80,
        "mobilePaddingTop": 32,
        "radius": 20
      }
    }
  ]
}
```

Existing documents without a canvas object retain their store header/footer and existing default appearance. Page settings can independently disable these bars. New Admin creations send `blank: true` and receive zero sections with both bars off. The API keeps its legacy starter default when `blank` is omitted, preserving older clients and existing callers. No database column migration is required.

Draft/published snapshots, optimistic revisions, tenant ownership checks and media usage tracking remain in place. Nested images in new card sections use the same ownership and deletion protections as existing images. No new template-preset system is introduced.

## Picker previews

The picker uses the real shared section components inside inert, sandboxed, non-focusable iframe miniatures. Sample product IDs are isolated to the preview and never enter a seller's document. The sample photograph is real Unsplash photography; its source is recorded alongside the dashboard asset. Frame scaling follows the card width, including mobile.

## Validation

- Production build and TypeScript checks passed.
- Full test suite passed: **88 API + 35 storefront + 14 dashboard = 137 tests**.
- Added checks cover section validation, invalid CSS/links, zero/mobile style values, blank/legacy chrome, escaped text, anchors, save/reload/publication isolation, nested-image ownership and split checkout rendering.
- Browser-verified actual Admin creation, thumbnail search, content/style controls, real image selection, nested card media, save/reload, responsive heading sizes and the mobile picker.
- An unpublished `Section builder review` draft in the local `editor-qa` store is available for inspection. It has not been published.

The historical preimplementation audit in `EDITOR-PERSISTENCE.md` describes the starting point, rather than the postimplementation schema.

## Curated icon library

The icon picker provides 80 reviewed Lucide icons in eight marketing categories,
with English/Bangla search, category filters, selected previews and removal.
It is loaded on demand. Benefits, image cards, trust strips and steps support
per-item choices; hero/header/announcement/story/CTA and checkout buttons support
optional icons. Buttons do not receive icons automatically.

Icons persist as stable IDs in section settings, with no database migration.
Older documents keep missing optional fields and their existing rendering.
Public pages use the same shared renderer as the editor and receive only the
selected inline SVGs, with no icon font, CDN or icon JavaScript. The curated
shapes are vendored from the existing dependency; no package was added. See
`apps/storefront/src/icons/README.md` and its license for maintenance details.

Regression checks cover all 80 SVG definitions, safe ID validation, legacy
compatibility, accessible labels, JSON round trips, and an actual API save and
publish followed by a public HTTP response. Browser checks cover desktop/mobile
picker layout, bilingual search, categories, empty results, selection/removal,
keyboard dismissal/focus restoration and styled icons after save/reload.
