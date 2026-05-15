# Presentation Analysis Framework

Deep content analysis for effective slide deck creation.

## 1. Message Hierarchy

Identify the core message structure before designing slides.

### Core Message (One Sentence)
- What is the single most important takeaway?
- If the audience remembers only one thing, what should it be?
- Can you state it in ≤15 words?

### Supporting Points (3-5 Maximum)
- What evidence supports the core message?
- What sub-topics must be covered?
- Prioritize by audience relevance, not source order

### Call-to-Action
- What should the audience DO after viewing?
- Is it clear, specific, and achievable?
- Where does it appear (slide position)?

## 2. Audience Decision Matrix

| Question | Analysis |
|----------|----------|
| Who is the primary audience? | [Role, expertise level, relationship to topic] |
| What do they currently believe? | [Existing knowledge, assumptions, biases] |
| What decision do we want them to make? | [Specific action or conclusion] |
| What barriers exist? | [Objections, concerns, missing information] |
| What evidence will convince them? | [Data types, credibility sources, emotional hooks] |

### Audience Adaptation

| Audience Type | Content Focus | Visual Treatment |
|---------------|---------------|------------------|
| Executives | Outcomes, ROI, strategic impact | High-level, clean, data highlights |
| Technical | Architecture, implementation, specs | Detailed diagrams, code, schematics |
| General | Benefits, stories, relatability | Visual metaphors, simple charts |
| Investors | Market size, traction, team | Growth charts, milestones, comparisons |
| Learners | Step-by-step, examples, practice | Progressive reveals, exercises |

## 3. Visual Opportunity Map

Identify which content benefits from visualization.

### Content-to-Visual Mapping

| Content Type | Visual Treatment | Example |
|--------------|------------------|---------|
| Comparisons | Side-by-side, before/after | Feature comparison table |
| Processes | Flow diagrams, numbered steps | Workflow illustration |
| Hierarchies | Org charts, pyramids, trees | Organizational structure |
| Timelines | Horizontal/vertical timelines | Project milestones |
| Statistics | Charts, highlighted numbers | Key metrics with context |
| Concepts | Icons, metaphors, illustrations | Abstract idea visualization |
| Relationships | Venn diagrams, networks | Ecosystem or dependencies |
| Lists | Structured grids, icon rows | Feature bullets with icons |

### Visual Priority

Rate each piece of content:
- **Must Visualize**: Complex data, key differentiators, memorable moments
- **Should Visualize**: Supporting evidence, secondary points
- **Text Only**: Simple statements, transitions, minor details

### Type Selection per Slide

Each slide carries a `**Type**` tag that drives renderer dispatch (`references/slide-ir-schema.md`). Tag deliberately by matching content signals — the type changes how HTML and editable-PPTX render the slide; the PNG path still works for any type.

| Signal in source | Recommended `Type` | Block to include |
|------------------|--------------------|------------------|
| Quotation marks around a sentence + attribution | `Quote` | `// QUOTE` |
| Table of numbers, comparison metrics, KPIs | `Data` | `// DATA` with markdown table |
| Code snippet, command, configuration | `Code` | `// CODE` |
| Mermaid / PlantUML spec, flowchart sketch | `Diagram` | `// DIAGRAM` |
| Photo / illustration as the whole point | `Image` | (image-only, no body) |
| Title page / agenda / section break | `Cover` | (no special block) |
| Final call-to-action / wrap | `Back Cover` | (no special block) |
| Anything else | `Content` | `// KEY CONTENT` with bullets |

**Why this matters per format**:

- `code` slides in HTML render real `<pre><code>` blocks; in PPTX render a monospace text box. Both let users copy the code; the PNG path would otherwise show an AI-painted approximation with typos.
- `data` slides in HTML render an SVG chart from real numbers; in PPTX render a native chart that the recipient can edit. The PNG path would paint an inaccurate approximation.
- `diagram` slides render the spec verbatim in a monospace box for now (Phase 6 will swap to `baoyu-diagram` SVG). Tag the type now so the future upgrade lifts the slide automatically.
- `quote` slides in HTML render a `<blockquote>` with attribution; in PPTX render a left-accent rectangle next to the quote text. PNG path paints a quote card.

### Per-Slide Render Override

For unusual cases, add a `**Render**: image | html | pptx` field to force one slide into a specific renderer regardless of the deck-level `output_formats`. Examples:

- Whole deck is HTML, but slide 4 is a hero illustration → `**Render**: image` (AI-painted PNG inlined full-bleed).
- Whole deck is PNG, but slide 8 is a code listing → `**Render**: html` (HTML fragment rasterised at merge time so the code is crisp).

If `Render` is absent the slide is produced in every format listed in `meta.output_formats`.

## 4. Presentation Flow

Structure for impact and retention.

### Opening (First 2-3 Slides)

| Element | Purpose |
|---------|---------|
| Hook | Capture attention (surprising stat, question, story) |
| Context | Why this matters now |
| Preview | What audience will learn/gain |

### Middle (Content Slides)

| Pattern | When to Use |
|---------|-------------|
| Problem → Solution | Introducing new products/ideas |
| Situation → Complication → Resolution | Complex business cases |
| What → Why → How | Educational content |
| Past → Present → Future | Transformation stories |
| Claim → Evidence → Implication | Data-driven arguments |

### Closing (Final 2-3 Slides)

| Element | Purpose |
|---------|---------|
| Synthesis | Tie back to core message |
| Call-to-Action | Clear next steps |
| Memorable Close | Resonant quote, image, or statement |

### Transitions

- Each slide should answer: "What comes next?"
- Use narrative connectors between sections
- Build logical progression, not topic jumps

## 5. Content Adaptation

Decide what to keep, transform, or omit.

### Keep (High Value)
- Core arguments and evidence
- Unique insights or data
- Audience-relevant examples
- Memorable quotes or statistics

### Simplify (Medium Value)
- Technical details → Visual summaries
- Long explanations → Bullet hierarchies
- Multiple examples → Best 1-2 examples
- Background context → Brief framing

### Visualize (Transform)
- Data tables → Charts or highlighted numbers
- Process descriptions → Flow diagrams
- Comparisons in text → Side-by-side visuals
- Abstract concepts → Concrete metaphors

### Omit (Low Value)
- Tangential information
- Redundant examples
- Excessive caveats
- Background the audience already knows

## 6. Analysis Checklist

Before outline creation, confirm:

### Message Clarity
- [ ] Core message stated in one sentence
- [ ] 3-5 supporting points identified
- [ ] Call-to-action defined

### Audience Fit
- [ ] Primary audience identified
- [ ] Existing beliefs mapped
- [ ] Desired decision clear
- [ ] Evidence matches audience needs

### Visual Planning
- [ ] Key visualizations identified
- [ ] Chart/diagram types selected
- [ ] Visual priority assigned

### Flow Design
- [ ] Opening hook defined
- [ ] Middle pattern selected
- [ ] Closing approach planned
- [ ] Transitions considered

### Content Decisions
- [ ] Keep/simplify/visualize/omit applied
- [ ] Source material fully processed
- [ ] No important content overlooked
