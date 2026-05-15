# Style × Output-Format Compatibility Matrix

The canonical mapping between the 17 presets and the three render targets defined in `render-targets.md`. Renderers and Step 2 confirmation both read this table to decide which format options to offer and whether to warn.

## Ratings

| Rating | Meaning |
|--------|---------|
| `excellent` | Full visual fidelity in this format |
| `good` | Faithful with minor compromises |
| `degraded` | Signature look is approximated; warn user before selecting |
| `unsupported` | Cannot produce acceptable output; hide this format option |

## Matrix

| Preset | png | html | pptx-editable | Notes |
|--------|-----|------|----------------|-------|
| `blueprint` | excellent | good | good | Grid texture reproduces well in CSS / PPTX background |
| `chalkboard` | excellent | good | degraded | HTML uses chalk-style web font; PPTX backgrounds available but type fidelity drops |
| `corporate` | excellent | excellent | **excellent** | Best preset for editable PPTX — clean geometry, system-safe fonts |
| `minimal` | excellent | excellent | **excellent** | Same as `corporate`; ideal for editable formats |
| `sketch-notes` | excellent | good | degraded | Hand-drawn web font in HTML; PPTX text falls back to system handwriting font |
| `hand-drawn-edu` | excellent | good | degraded | HTML emulates with rough.js-style SVG; PPTX cannot reproduce strokes |
| `watercolor` | excellent | degraded | degraded | Watercolor texture cannot be faithfully reproduced outside raster |
| `dark-atmospheric` | excellent | excellent | good | High-fidelity dark CSS; PPTX dark templates available |
| `notion` | excellent | excellent | excellent | Native to web aesthetics; works everywhere |
| `bold-editorial` | excellent | excellent | good | Strong typography; PPTX requires careful font fallback |
| `editorial-infographic` | excellent | good | good | Dense info layouts work in both vector formats |
| `fantasy-animation` | excellent | unsupported | unsupported | Hand-painted style only achievable via AI raster |
| `intuition-machine` | excellent | good | good | Technical academic look reproducible in both |
| `pixel-art` | excellent | degraded | unsupported | HTML can use pixelated CSS; PPTX cannot |
| `scientific` | excellent | excellent | excellent | Charts/diagrams native to both vector formats |
| `vector-illustration` | excellent | good | good | SVG fits HTML naturally; PPTX needs shape-based recreation |
| `vintage` | excellent | good | degraded | Paper texture approximated in CSS; PPTX flat |

## Field Reference for Per-Preset Files

Each preset under `references/styles/<preset>.md` declares its row of this table inline near the top, in this form:

```markdown
## Compatible Outputs

| Format | Rating |
|--------|--------|
| png | excellent |
| html | good |
| pptx-editable | good |
```

Renderers and Step 2 confirmation read the per-preset declaration as the source of truth. This central matrix exists so authors can see the full picture in one place and audit consistency across presets. **If the two disagree, the per-preset file wins** — update this central matrix to match.

## Adding a New Preset

When introducing a new preset, fill in all three ratings during initial authoring. Default heuristic:

| Texture | Default html rating | Default pptx-editable rating |
|---------|---------------------|------------------------------|
| `clean` | excellent | excellent |
| `grid` | good | good |
| `organic` | good | degraded |
| `pixel` | degraded | unsupported |
| `paper` | good | degraded |

These are starting points — adjust based on what the texture interacts with (e.g., handwritten typography degrades PPTX rating regardless of texture).

## Adding a New Format

When adding a fourth render target (e.g. Keynote, Google Slides API), append a column here, then update every preset's `Compatible Outputs` block. Step 2 confirmation reads the per-preset table dynamically — no copy edits needed in `confirmation.md`.
