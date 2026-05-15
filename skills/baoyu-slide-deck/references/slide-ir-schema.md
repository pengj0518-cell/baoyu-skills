# Slide IR Schema

The Slide IR (Intermediate Representation) is the structured contract between **outline parsing** and **rendering**. It lives at `slide-deck/{topic-slug}/slides.json` and is consumed by all three renderers (PNG, HTML, editable PPTX) so each page is independently controllable.

## Why an IR

Before the IR existed, the only renderer was "ask the image model to paint the whole page". Adding HTML and editable PPTX rendering requires structured fields per slide (title, bullets, quote, chart data, etc.) so a non-image backend has something to lay out.

The IR is generated **once** after the outline is reviewed, then becomes the source of truth for:

- `scripts/ir-to-prompts.ts` → `prompts/NN-slide-{slug}.md` (PNG path)
- `scripts/render-html.ts` (Phase 3) → single-file HTML
- `scripts/render-pptx-editable.ts` (Phase 4) → editable .pptx

If a user edits the outline, regenerate the IR. If a user edits a single slide, they should prefer editing `slides.json` directly because it propagates to every renderer.

## File Location

```
slide-deck/{topic-slug}/
├── outline.md       # human-authored / AI-generated outline
├── slides.json      # ← this file (IR)
├── prompts/
│   └── NN-slide-{slug}.md
└── NN-slide-{slug}.png
```

Backup rule applies: an existing `slides.json` is moved to `slides-backup-YYYYMMDD-HHMMSS.json` before being overwritten.

## Top-Level Shape

```jsonc
{
  "meta": { ... },
  "style_instructions": "...",
  "slides": [ ... ]
}
```

## `meta`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | ✓ | Human-readable topic |
| `topic_slug` | string | ✓ | Kebab-case directory slug |
| `style` | string \| object | ✓ | Preset name (e.g. `blueprint`) or `{texture, mood, typography, density}` |
| `audience` | string | ✓ | `beginners` / `intermediate` / `experts` / `executives` / `general` |
| `lang` | string | ✓ | BCP-47 short code (`en`, `zh`, `ja`, …) |
| `slide_count` | integer | ✓ | Length of `slides[]` |
| `output_formats` | string[] | ✓ | Subset of `["png", "html", "pptx-editable"]`; renderers dispatch off this |
| `style_compatibility` | object | ✓ | `{ png, html, pptx-editable }` each `excellent` / `good` / `degraded` / `unsupported` (copied from `style-compatibility.md`) |
| `generated` | string | ✓ | ISO-8601 timestamp |

## `style_instructions`

Verbatim copy of the `<STYLE_INSTRUCTIONS>` block from `outline.md`. Stored once at deck level so per-slide prompts can embed it without re-reading style files. The HTML and PPTX renderers do **not** consume this field — they consume the resolved style via `meta.style` and the matching templates under `references/html-styles/` and `references/pptx-themes/`.

## `slides[]`

Each entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `n` | integer | ✓ | 1-based position; matches filename prefix |
| `slug` | string | ✓ | Kebab-case, stable across renumbering |
| `filename` | string | ✓ | `NN-slide-{slug}.png` (PNG path; HTML/PPTX derive their own) |
| `type` | string | ✓ | See **Slide Types** below |
| `layout` | string | ✗ | Layout hint from `references/layouts.md`; renderer-specific |
| `narrative_goal` | string | ✗ | What this slide accomplishes in the arc |
| `title` | string | ✓ | Headline (primary text) |
| `subtitle` | string | ✗ | Sub-headline |
| `bullets` | string[] | ✗ | Body points (mainly `content` type) |
| `quote` | object | ✗ | `{ text, by? }` for `quote` type |
| `data` | object | ✗ | `{ kind: "bar"\|"line"\|"pie"\|"table", rows: any[] }` for `data` type |
| `diagram_spec` | string | ✗ | Mermaid / PlantUML / structured spec for `diagram` type |
| `code` | object | ✗ | `{ lang, source }` for `code` type |
| `image_prompt` | string | ✓ when `type` ∈ image-leaning | Free-form visual description for AI rendering |
| `background_image` | string | ✗ | Filename relative to deck dir; used in PPTX hybrid mode |
| `text_safe_zone` | object | ✗ | `{ x, y, w, h }` in 0–1 normalised coords; tells AI to leave region empty so PPTX text can overlay |
| `render_override` | string \| null | ✗ | Force this slide to render as `image` / `html` / `pptx` regardless of deck-level `output_formats` |

## Slide Types

| Type | Primary fields | Renderer behaviour |
|------|----------------|--------------------|
| `cover` | `title`, `subtitle`, `image_prompt` | PNG: full AI render; HTML/PPTX: hero text + AI background |
| `content` | `title`, `bullets`, `image_prompt` | PNG: AI render; HTML/PPTX: real list + optional sidebar image |
| `quote` | `quote.text`, `quote.by` | All renderers: large quote block |
| `data` | `data.kind`, `data.rows` | PNG: AI chart; HTML: ECharts; PPTX: native chart |
| `diagram` | `diagram_spec` | PNG: AI render; HTML: inline SVG via `baoyu-diagram`; PPTX: SVG import |
| `code` | `code.lang`, `code.source` | PNG: AI render (often poor); HTML: highlight.js; PPTX: mono text box |
| `image` | `image_prompt` | All renderers: full-bleed image |
| `closing` | `title`, `subtitle?` | Same as `cover` |

## `render_override` Semantics

Set per-slide to opt out of the deck-level format choice for that page only.

| `render_override` | Effect |
|-------------------|--------|
| `null` / absent | Slide is produced in every format listed in `meta.output_formats` |
| `"image"` | Even in HTML/PPTX decks, this slide is the AI-rendered PNG (embedded as `<img>` or full-bleed slide background) |
| `"html"` | Hand-coded HTML fragment under `slide-deck/{topic-slug}/overrides/NN-slide-{slug}.html` is inlined |
| `"pptx"` | Hand-coded pptxgenjs snippet under `slide-deck/{topic-slug}/overrides/NN-slide-{slug}.ts` is invoked |

Use cases:

- Whole deck is HTML, but page 3 is an AI-painted hero → set `render_override: "image"` on slide 3.
- Whole deck is PNG, but page 8 is a real code listing → set `render_override: "html"` (HTML fragment is then rasterised by headless Chrome at merge time).

## Example

```json
{
  "meta": {
    "topic": "Introduction to Vector Databases",
    "topic_slug": "intro-vector-db",
    "style": "blueprint",
    "audience": "intermediate",
    "lang": "en",
    "slide_count": 10,
    "output_formats": ["png", "html"],
    "style_compatibility": {
      "png": "excellent",
      "html": "good",
      "pptx-editable": "good"
    },
    "generated": "2026-05-15T10:30:00Z"
  },
  "style_instructions": "<STYLE_INSTRUCTIONS>\nDesign Aesthetic: ...\n</STYLE_INSTRUCTIONS>",
  "slides": [
    {
      "n": 1,
      "slug": "cover",
      "filename": "01-slide-cover.png",
      "type": "cover",
      "layout": "title-hero",
      "title": "Introduction to Vector Databases",
      "subtitle": "How embeddings power semantic search",
      "image_prompt": "Blueprint-style technical cover with abstract vector field visualization, deep slate text on off-white paper, engineering grid overlay"
    },
    {
      "n": 5,
      "slug": "ann-comparison",
      "filename": "05-slide-ann-comparison.png",
      "type": "data",
      "layout": "dashboard",
      "title": "ANN Algorithm Tradeoffs",
      "data": {
        "kind": "bar",
        "rows": [
          { "algo": "HNSW", "recall": 0.97, "qps": 8500 },
          { "algo": "IVF", "recall": 0.92, "qps": 12000 },
          { "algo": "ScaNN", "recall": 0.95, "qps": 10500 }
        ]
      },
      "image_prompt": "Blueprint-style bar chart comparing recall vs QPS for HNSW, IVF, ScaNN"
    }
  ]
}
```

## Validation Rules

| Rule | Reason |
|------|--------|
| `meta.slide_count === slides.length` | Consistency check |
| Every `slides[].n` is unique and ∈ `[1, slide_count]` | Renumbering safety |
| Every `slides[].filename` starts with zero-padded `n` (`01-`, `02-`, …) | Backup rule and merge scripts depend on it |
| `meta.output_formats` is non-empty subset of `["png", "html", "pptx-editable"]` | Renderer dispatch |
| For each format in `output_formats`, `meta.style_compatibility[format]` must not be `"unsupported"` | Guarded at Step 2; this catches edits |
| `type: "data"` requires `data` field present | Renderer guarantee |
| `type: "code"` requires `code.source` present | Renderer guarantee |
| `type: "quote"` requires `quote.text` present | Renderer guarantee |

The scripts under `scripts/` perform these checks and exit non-zero with a single-line error pointing to the offending slide's `n` and `slug`.

## Editing the IR Manually

Power users can edit `slides.json` directly between Step 6 (review prompts) and Step 7 (render). Workflow:

1. Edit `slides.json`.
2. Re-run `bun scripts/ir-to-prompts.ts <deck-dir>` to refresh `prompts/`.
3. Continue with Step 7 (or `--regenerate N` for specific pages).

The backup rule applies on every regeneration, so a bad edit can be rolled back from the timestamped backup.
