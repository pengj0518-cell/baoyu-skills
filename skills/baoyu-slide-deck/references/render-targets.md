# Render Targets

Three output formats, each consuming the same `slides.json` IR via a dedicated renderer. This doc states the capabilities, limits, and fidelity expectations of each, so Step 2 confirmation can warn users before generation, not after.

## Summary

| Format | Renderer | Phase | What user gets |
|--------|----------|-------|----------------|
| `png` | AI image backend (e.g. `baoyu-imagine`) + `merge-to-pptx.ts` + `merge-to-pdf.ts` | shipped | Per-page PNG images, plus PPTX/PDF containing those images |
| `html` | `scripts/render-html.ts` | Phase 3 | Single self-contained `.html` file, navigable in browser |
| `pptx-editable` | `scripts/render-pptx-editable.ts` | Phase 4 | Real `.pptx` with editable text boxes layered over AI background |

Multiple formats can be selected in one run; each renderer runs independently and writes alongside the deck.

## Format Details

### `png` (default)

**Pipeline**: `slides.json` → `prompts/NN-slide-{slug}.md` → AI image backend → `NN-slide-{slug}.png` → `merge-to-pptx.ts` packs PNGs into PPTX, `merge-to-pdf.ts` packs into PDF.

**Fidelity**: highest — the AI renders the entire page including styled type and bespoke illustrations. Every preset is rated `excellent` here.

**Editability**: none. Modifying a slide requires editing the prompt and regenerating.

**Use when**: user wants visual sophistication and is happy to read/share rather than edit.

**Limits**:
- Text inside the image can have spelling errors or layout drift.
- Charts are AI-painted approximations, not data-accurate.
- Generation cost scales with slide count (~10–30 s per slide).

### `html`

**Pipeline**: `slides.json` → `render-html.ts` → `{topic-slug}.html` (single file, all CSS inlined, fonts via system stack).

**Fidelity**: depends on preset. `compatible_outputs.html` rating:
- `excellent` / `good`: visually faithful, real selectable text, real charts.
- `degraded`: the preset's signature texture (watercolor, pixel art, fantasy animation) cannot be reproduced in CSS — output is a flattened approximation.
- `unsupported`: do not offer this preset as an HTML option.

**Editability**: full — open the HTML, every slide is a `<section>`, hand-edit any text.

**Use when**: user wants to share via URL, embed in docs, or have selectable/searchable text.

**Self-contained constraints** (firm):
- Single `.html` file, no external CSS/JS network requests.
- No bundled fonts — use a CSS font stack with safe fallbacks declared in the preset's CSS token file.
- Images that the slide actually needs (per-slide AI backgrounds) are base64-inlined.

**Hybrid mode**: a slide with `render_override: "image"` is included as a full-bleed `<img>` tag inside its `<section>` rather than CSS-rendered.

**Bonus**: HTML decks export to PDF via headless Chrome with sharper text than image-based PDF.

### `pptx-editable`

**Pipeline**: `slides.json` → AI backend generates **background only** (no text) → `render-pptx-editable.ts` lays real text boxes / shapes / charts on top using `pptxgenjs` → `.pptx`.

**Fidelity**: depends on preset. `compatible_outputs.pptx-editable` rating:
- `excellent` / `good`: faithful (mostly `corporate` / `minimal` / `notion` / `scientific`).
- `degraded`: textured backgrounds (watercolor, vintage, chalkboard) only approximate.
- `unsupported`: presets that rely on hand-drawn type (`fantasy-animation`, `pixel-art`) are hidden from selection.

**Editability**: full — open in PowerPoint / Keynote / Google Slides, edit text, swap colors, resize boxes.

**Use when**: user genuinely needs a deck they can rev later or hand off to a designer.

**Constraints** (firm):
- No font embedding. Each preset declares 2–3 fallback fonts using PowerPoint-universal families (`Calibri`, `Cambria`, `Microsoft YaHei`, `PingFang SC`, …).
- AI backgrounds must include the slide's `text_safe_zone` so prompts instruct "leave this region empty for overlaid text".
- `data` slides use pptxgenjs native chart APIs, not AI images.

## Style × Format Compatibility

The canonical matrix lives in `style-compatibility.md` and a copy is stamped into every preset's frontmatter as `compatible_outputs`. Renderers read the per-preset value, not the central matrix, so a custom user style can declare its own ratings.

Ratings:

| Rating | Step 2 behaviour | Meaning |
|--------|------------------|---------|
| `excellent` | Default-offer for this format | Full visual fidelity |
| `good` | Default-offer | Faithful with minor compromises |
| `degraded` | Warn before offering | Signature look is approximated; user should consider another preset |
| `unsupported` | Hide the format option | Cannot produce acceptable output; offer `png` instead |

## Format Selection (Step 2 Q6)

The Step 2 confirmation asks `output_formats` as a multi-select. Only formats with rating `excellent` / `good` / `degraded` for the chosen preset appear. If the user selects `degraded` formats, the next message warns them and lets them switch presets without restarting.

If the user picks a preset whose only compatible format is `png`, Q6 is skipped (only one valid answer).

## Cross-Format Workflow

1. User picks `png + html` in Step 2.
2. Single shared `outline.md` and `slides.json` are produced.
3. Step 7 runs the PNG generation (most expensive).
4. Step 7b runs the HTML renderer using the same IR; AI-generated backgrounds from the PNG step are reused for `cover` / `image` slides via `background_image`.
5. Step 8 produces `.pptx` (PNG-packed), `.pdf` (PNG-packed), and `.html` side by side.

This sharing is why the IR is necessary: without it, each format would re-prompt the model and waste budget.
