# Confirmation Questions

Concrete option copy for the confirmation steps. SKILL.md lists which questions to ask — this file gives the verbatim options used in Claude Code. Adapt copy to the runtime's native user-input tool; the intent matters more than the exact wording.

## Round 1 (Always)

Batch all six questions in a single `AskUserQuestion` call. Q6 is conditionally hidden when the chosen preset only supports `png` (see Q6 below).

### Q1: Style

```yaml
header: Style
question: Which visual style for this deck?
options:
  - label: "{recommended_preset} (Recommended)"
    description: Best match based on content analysis
  - label: "{alternative_preset}"
    description: "{alternative style description}"
  - label: Custom dimensions
    description: Choose texture, mood, typography, density separately
```

### Q2: Audience

```yaml
header: Audience
question: Who is the primary reader?
options:
  - label: General readers (Recommended)
    description: Broad appeal, accessible content
  - label: Beginners/learners
    description: Educational focus, clear explanations
  - label: Experts/professionals
    description: Technical depth, domain knowledge
  - label: Executives
    description: High-level insights, minimal detail
```

### Q3: Slide Count

```yaml
header: Slides
question: How many slides?
options:
  - label: "{N} slides (Recommended)"
    description: Based on content length
  - label: "Fewer ({N-3} slides)"
    description: More condensed, less detail
  - label: "More ({N+3} slides)"
    description: More detailed breakdown
```

### Q4: Review Outline

```yaml
header: Outline
question: Review outline before generating prompts?
options:
  - label: Yes, review outline (Recommended)
    description: Review slide titles and structure
  - label: No, skip outline review
    description: Proceed directly to prompt generation
```

### Q5: Review Prompts

```yaml
header: Prompts
question: Review prompts before generating images?
options:
  - label: Yes, review prompts (Recommended)
    description: Review image generation prompts
  - label: No, skip prompt review
    description: Proceed directly to image generation
```

### Q6: Output Formats

**Multi-select** — the user can choose any combination. Filter options by the chosen preset's `Compatible Outputs` block in `references/styles/<preset>.md`:

- Show options rated `excellent`, `good`, or `degraded` for the chosen preset.
- **Hide** options rated `unsupported`.
- If only `png` remains after filtering, skip this question (no choice to make).

```yaml
header: Output
question: Which output formats? (multi-select)
multiSelect: true
options:
  - label: Image slides (Recommended)
    description: AI-painted PNG per slide, packed into PPTX + PDF. Highest visual fidelity.
  - label: Single-file HTML
    description: Self-contained .html with selectable text. Available from v1.115. {warn_if_degraded:html}
  - label: Editable PPTX
    description: Real text boxes layered over AI background. Edit in PowerPoint/Keynote. Available from v1.116. {warn_if_degraded:pptx-editable}
```

Render `{warn_if_degraded:<format>}` as `(⚠ approximated for this style)` when the per-preset rating for that format is `degraded`; render nothing when `excellent` or `good`.

The internal keys for the selected labels are:

| Label | IR key |
|-------|--------|
| Image slides | `png` |
| Single-file HTML | `html` |
| Editable PPTX | `pptx-editable` |

Store the resulting array as `meta.output_formats` in `slides.json`.

## Round 2 — Custom Dimensions

Triggered only when Q1 of Round 1 = "Custom dimensions". Batch all four dimension questions.

### Texture

```yaml
header: Texture
question: Which visual texture?
options:
  - label: clean
    description: Pure solid color, no texture
  - label: grid
    description: Subtle grid overlay, technical
  - label: organic
    description: Soft textures, hand-drawn feel
  - label: pixel
    description: Chunky pixels, 8-bit aesthetic
```

`paper` is also valid — accept via "Other".

### Mood

```yaml
header: Mood
question: Which color mood?
options:
  - label: professional
    description: Cool-neutral, navy/gold
  - label: warm
    description: Earth tones, friendly
  - label: cool
    description: Blues, grays, analytical
  - label: vibrant
    description: High saturation, bold
  - label: macaron
    description: Pastel blocks on cream
```

`dark`, `neutral` valid via "Other".

### Typography

```yaml
header: Typography
question: Which typography style?
options:
  - label: geometric
    description: Modern sans-serif, clean
  - label: humanist
    description: Friendly, readable
  - label: handwritten
    description: Marker/brush, organic
  - label: editorial
    description: Magazine style, dramatic
```

`technical` valid via "Other".

### Density

```yaml
header: Density
question: Information density?
options:
  - label: balanced (Recommended)
    description: 2-3 key points per slide
  - label: minimal
    description: One focus point, maximum whitespace
  - label: dense
    description: Multiple data points, compact
```

## Outline Review (Step 4)

```yaml
header: Confirm
question: Ready to generate prompts?
options:
  - label: Yes, proceed (Recommended)
    description: Generate image prompts
  - label: Edit outline first
    description: I'll modify outline.md before continuing
  - label: Regenerate outline
    description: Create new outline with different approach
```

## Prompt Review (Step 6)

```yaml
header: Confirm
question: Ready to generate slide images?
options:
  - label: Yes, proceed (Recommended)
    description: Generate all slide images
  - label: Edit prompts first
    description: I'll modify prompts before continuing
  - label: Regenerate prompts
    description: Create new prompts with different approach
```

## Post-Render Reroll (Step 7.5)

After Step 7's PNG generation finishes, list the generated slides and ask which (if any) the user wants to regenerate. Multi-select so the user can flag several at once.

```yaml
header: Reroll
question: Any slides to regenerate? (multi-select; leave all unchecked to accept)
multiSelect: true
options:
  - label: "1. {slide_1_title}"
    description: "{slide_1_filename}"
  - label: "2. {slide_2_title}"
    description: "{slide_2_filename}"
  # one option per generated slide
```

Substitute `{slide_N_title}` with the slide's title from `slides.json` and `{slide_N_filename}` with its PNG filename. Cap the option list at 30 entries (matches max slide count).

Behavior:

- **No selection** → proceed to Step 8 (merge).
- **One or more selected** → re-invoke Step 7a only for those slide numbers (equivalent to `--regenerate N1,N2,...`). When that batch finishes, ask this question again until the user clears all selections.
- This loop only applies to the `png` branch. HTML and editable-PPTX are deterministic — re-running them is cheap, so the user can just re-issue the command if they want a different output after editing `slides.json`.

Skip this step entirely when `output_formats` does not include `png`.

## Existing Content (Step 1.3)

```yaml
header: Existing
question: Existing content found. How to proceed?
options:
  - label: Regenerate outline
    description: Keep images, regenerate outline only
  - label: Regenerate images
    description: Keep outline, regenerate images only
  - label: Backup and regenerate
    description: Backup to {slug}-backup-{timestamp}, then regenerate all
  - label: Exit
    description: Cancel, keep existing content unchanged
```
