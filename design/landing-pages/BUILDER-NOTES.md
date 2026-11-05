# Landing page builder: HTML design study

Phase 01: five responsive, standalone HTML templates and a local review studio. These files are isolated from the production dashboard, API, page schema, and storefront. No store pages are created, saved, published, or migrated. Open `index.html` through a local HTTP server to use the chooser and section library. Individual template pages also work directly as files.

## Preview

From the repository root:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory design/landing-pages
```

Open http://127.0.0.1:4174/. The studio has a two-column, three-row chooser: Blank, Shikor, Pantry, Nira, Mithai, Nirvor. On small screens the main collection becomes one column; the creation modal keeps two columns. “New landing page” collects a name and template selection, then opens a **prototype preview**, without writing to the app. Desktop/mobile controls, a section library with actual HTML miniatures, and temporary style controls are provided for review. Changes to the preview are intentionally not saved.

| Template | Direction | Distinctive composition |
| --- | --- | --- |
| Shikor | Food / heritage | Warm brick and cream, arched food photography, split story, numbered process, reviews, packs, checkout |
| Pantry | Combo / offer | Forest green hero, real spice-jar photography, four-item contents grid, itemized offer, pack selector |
| Nira | Oil / personal care | Quiet olive, generous whitespace, real coconut-oil photography, editorial image story, routine steps |
| Mithai | Single-product funnel | Compact centered hero, real sweets photography, flavor sequence, comparison table, mobile purchase bar; deliberately no header/footer |
| Nirvor | Practical product | Teal split hero, real folding-screen photography, specifications and setup steps |

The Nirvor concept broadens the builder beyond food; its product is illustrative rather than a copy of the reference's funeral product. All brand names, prices, shipping charges, and product specifications are demonstration content. Review sections are explicitly empty placeholders, not fabricated testimonials. Photography is illustrative, not evidence of the sample products. Forms calculate local preview totals and never transmit data or place orders.

## Reference review — 5 November 2026

All 12 provided URLs were attempted using the web reader and then visited in the browser. Eleven were visually inspectable. EcoEats blocked inspection; only the initial heading and order link were readable. Findings below describe the observed pages, not independently verified product claims.

| Reference | Useful pattern | Improvement for our templates |
| --- | --- | --- |
| [Chuijal](https://chuijal.com/) | Section anchor navigation, cooking video, product gallery, FAQs, multi-size checkout | Stronger first-screen composition; reduce empty space beside tall media; give sizes a clear hierarchy |
| [Ekhatifood five-item combo](https://www.ekhatifood.com/main-landing-page-ekhatifoods-5item) | Dark green/gold split hero, contents cards, usage media, package checkout | Keep bundle count and prices consistent: the inspected page mixes four/five-item wording and ৳1,000/৳1,400 prices |
| [EcoEats Chui Mithai](https://offer.ecoeatsbd.com/step/chui-mithai/) | Initial natural-ingredient positioning and order anchor were readable | Partial review only: page displayed a protection notice; do not claim a full layout analysis |
| [M3Food](https://m3food.com/) | Narrow mobile funnel, product image, proof/media areas, offer stack, reviews, sticky COD action | Support desktop layout; avoid unsupported medical claims and carry only merchant-verified proof |
| [Khatirhut coconut oil](https://khatirhut.com/coldpress-coconut-oil/) | Centered introduction, production story, benefits, volume options | Put product imagery and clear product information in the first screen; footer can be simplified or removed |
| [Deshi Food Mart spice combo](https://www.deshifoodmart.com/products/গুড়া-মসলা-কম্বো-1) | Product-first poster, benefits, customer-message proof, package choices | Render headings, pricing and benefit text as editable HTML, rather than baking them into product posters |
| [Deshidala](https://order.deshidala.com/) | Numbered reasons and preparation process; quantity options before checkout | Restrain oversized branding; place product and proposition earlier; improve section rhythm |
| [Naturo coconut oil](https://naturobd.com/product/Coconut-Oil) | Thumbnail gallery, volume buttons, quantity, direct contact | Adapt focused product controls to a landing page without inherited catalog navigation and related-product clutter |
| [Special Organic](https://specialorgenicshop.com/) | Image/text split, benefits, usage instructions and volume options | Fix weak text contrast, remove duplicated benefits and repeated malformed headings |
| [Tahkeek Chui Jhal](https://tahkeekfood.com/pages/chui-jhal) | Flavor sequence, three-step guarantee, comparison, packages, mobile sticky CTA | Avoid dominant urgency chrome and claims not supplied by a seller; keep the page easy to read |
| [Knowledge Products](https://knowledgeproducts.com.bd/step/smart-murda-msaree) | Two color variants, dimensions, product details, proof gallery, checkout | Avoid repeating the same variant cards; use a concise specification section; handle expired offers honestly |
| [SeraSodai mustard oil](https://serasodaibd.com/step/traditional-wooden-mustard-oil-press/) | Production video, specification/comparison, review area, multiple sizes | Resolve initial browser check, simplify crowded offer hierarchy, keep language consistent and medical claims substantiated |

## Existing implementation

- `apps/dashboard/src/pages/Pages.tsx`: `NewPageDialog` currently asks for a name and POSTs `{ title }`.
- `apps/storefront/src/schema.ts`: 12 section definitions, generated settings fields, strict validation; version-1 content contains only `sections`. `starterContent` supplies seven sections; maximum 40.
- `apps/storefront/src/sections.tsx`: shared editor/storefront rendering; `PageView` unconditionally inserts the store-name header and footer.
- `apps/dashboard/src/pages/PageEditor.tsx`: section picker currently uses icon/text rows. Preview already shares storefront components, which is a good basis for accurate section previews.

## Proposed builder implementation, after design review

### 1. Canvas and template creation

Replace the name-only dialog with these six choices. Keep one page name field and one create action. Send a validated template key to the API; the server seeds a **fresh draft** from a known template, assigning unique section IDs. Templates must not carry another store's product/media IDs. Product and media fields remain unbound until the seller chooses their own assets. A template's sample illustration can be a clearly designated platform asset, never a copied tenant asset.

Start new blank pages with zero sections and no implicit chrome. Model header, announcement, footer and sticky purchase action as optional sections. Preserve existing published pages' current header/footer behavior with an explicit migration or a backward-compatible document version. Do not silently change old pages. Preview and public storefront must use the same canvas settings and shared section renderers.

### 2. Section catalog derived from the designs

| Section family | Needed variants / content | Controls that matter |
| --- | --- | --- |
| Header | Brand/logo, anchor links, optional CTA | Height, width, alignment, background, border, sticky behavior |
| Announcement | Short message, optional real deadline | Background, text, padding, optional link; expiry behavior |
| Hero | Split, centered, product stack, image/video | Media side, ratio, crop, heading, supporting text, CTA(s), price, mobile stacking |
| Trust strip | Icon + short label items | Columns, dividers, gap, colors |
| Image + story | Media/text split, editorial heading | Column ratio, media shape, position, alignment, section background |
| Benefits | Cards, checklist, numbered items | 1–4 columns, icon/image support, card border/background, gap |
| Bundle contents | Repeatable product/media, quantity, description | Grid columns, image fit, card treatment; no forced commerce IDs |
| Steps | Row sequence or stacked numbered list | Orientation, numbering, connector, mobile stacking |
| Specifications | Label/value pairs | Row/grid, borders, units, typography |
| Comparison | Column headers, row labels, values | Highlighted column, alternating rows, accessible mobile overflow |
| Offer summary | Included items, amount, optional genuine comparison price | Split/card, title, CTA, emphasis; derive commerce pricing from product data |
| Package selector | Product variant/quantity options | Cards/rows, selected state, optional merchant-supplied badge |
| Gallery / video | Existing section families with layout variants | Thumbnail positions, aspect ratio, crop; accessible video title and real media URL |
| Customer stories | Text, screenshot or video review | Grid, image ratio, name, optional verified rating; empty until seller provides evidence |
| FAQ | Native accordion with real questions | Spacing, divider, icon position, first-open option |
| Order form | Existing real product binding and COD checkout | Split/stacked, summary position, field layout, button styling; business rules stay server-owned |
| Contact / footer | Optional brand, contact, policies | Columns, alignment, colors, borders |
| Sticky purchase action | Linked order anchor and current price | Mobile/desktop visibility, height, safe-area padding; must not obscure content |

Thirteen reusable section miniatures are provided now. Header/footer/sticky and media sections should also receive genuine previews when integrated into the builder. The prototype's sample photography is not a substitute for product media upload or a production video implementation.

### 3. Shared settings rather than endless special sections

Provide Content, Layout, and Style tabs. Most visual variety should come from reusable settings and variants, not a separate hard-coded section for each template.

- **Layout:** contained/full width, max width, 1–4 columns, column ratio, horizontal/vertical alignment, gap, per-side padding/margin, media order and ratio, object fit/position.
- **Typography:** supported font family, heading/body/button size, weight, line height, letter spacing, alignment, text and link colors.
- **Surface:** background color/image with overlay, text color, border style/width/color per edge, linked/unlinked corner radius, shadow presets.
- **Buttons/cards:** primary/secondary colors, hover/focus contrast, padding, radius, borders, card surface and spacing.
- **Responsive:** explicit desktop/mobile overrides for columns, type size, spacing, media order, visibility. Choose predictable tablet fallbacks and store only overrides.
- **Canvas defaults:** page palette and type scale, inherited by sections; an individual section can override them. Preserve contrast and visible keyboard focus.

Use bounded, typed JSON settings and safe enums. The existing validator drops unknown settings, so API validation, types, editor controls and rendering must change together. Do not add arbitrary HTML/JavaScript/CSS strings or external URLs as a shortcut. Keep the real order form, stock checks, integer money calculations, product ownership and draft/published revision checks intact.

### 4. Section picker

Searchable cards should show the actual renderer at a fixed preview width with sample content. Use inert, unfocusable miniature frames or controlled renderer previews so thumbnail controls cannot submit forms or capture focus. Present a clear section label and Add action. Cache screenshots only if needed for measured performance; use a versioned render key so a changed section does not retain an old picture. Keep both content and imagery accessible outside the thumbnail.

### 5. Integration checks

Once the schema work starts, verify: blank has no chrome; each template seeds isolated IDs; templates respect media/product ownership; new styling survives save/reload and publish; older pages preserve appearance; editor preview matches storefront; mobile sections stay readable; picker thumbnails stay inert; checkout totals, stock and errors remain correct. Run focused schema/API/storefront tests and the normal build for that implementation phase.

## Assets

The former SVG product illustrations have been removed. All displayed imagery is real stock photography; see [PHOTO-SOURCES.md](PHOTO-SOURCES.md) for sources. Decorative CTA arrows have also been removed. Local Inter and Noto Sans Bengali fonts are copied from the existing project's Fontsource packages (SIL Open Font License; copies included). Public Unsplash photographs used only as illustrative design imagery:

- Curry: https://images.unsplash.com/photo-1603894584373-5ac82b2ae398
- Spices: https://images.unsplash.com/photo-1596040033229-a9821ebd058d
- Oil bottle: https://images.unsplash.com/photo-1608571423902-eed4a5ad8108

No reference-store logo, testimonial, review count, certification, health claim, or limited-time offer was copied into the sample templates.

## Validation performed

- JavaScript syntax checks passed for both scripts.
- All local HTML asset and page references resolve.
- All five templates were visually inspected at 1280px desktop and 390px mobile widths, with no horizontal overflow or broken images observed.
- Confirmed six choices in a two-column creation modal, named template preview, style color update, section search and insertion, and zero header/footer/sections on the blank canvas.
- Confirmed package change + delivery change: Pantry two-box pack ৳1,690 + outside-Dhaka delivery ৳120 = ৳1,810.
- Confirmed the demonstration checkout shows a local status message rather than creating an order.
- Production build/tests were not run because this phase changes only isolated static design files.

## Current persistence audit

See [EDITOR-PERSISTENCE.md](EDITOR-PERSISTENCE.md) for the traced editor → API → PostgreSQL JSONB → published storefront flow and verified schema limitations.
