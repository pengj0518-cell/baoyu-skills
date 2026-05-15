import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const scriptPath = path.join(repoRoot, "skills", "baoyu-slide-deck", "scripts", "outline-to-ir.ts");

async function mkfixture(outline: string, formats: string[] = ["png"]): Promise<{ dir: string; ir: () => Promise<any> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slide-ir-test-"));
  await fs.writeFile(path.join(dir, "outline.md"), outline);
  const args = [scriptPath, dir];
  for (const f of formats) {
    args.push("--format", f);
  }
  await execFileAsync("bun", args);
  return {
    dir,
    ir: async () => JSON.parse(await fs.readFile(path.join(dir, "slides.json"), "utf-8")),
  };
}

async function run(outline: string, formats: string[] = ["png"]) {
  const fixture = await mkfixture(outline, formats);
  const ir = await fixture.ir();
  await fs.rm(fixture.dir, { recursive: true, force: true });
  return ir;
}

const baseHeader = `# Slide Deck Outline
**Topic**: Test Topic
**Style**: corporate
**Audience**: general
**Language**: en
**Slide Count**: SLIDE_COUNT
**Generated**: 2026-05-15 10:00

---

<STYLE_INSTRUCTIONS>S</STYLE_INSTRUCTIONS>

---
`;

function header(count: number): string {
  return baseHeader.replace("SLIDE_COUNT", String(count));
}

test("parses cover/content/closing types and basic fields", async () => {
  const outline = header(3) + `
## Slide 1 of 3
**Type**: Cover
**Filename**: 01-slide-cover.png
// KEY CONTENT
Headline: Hello
Sub-headline: World

---

## Slide 2 of 3
**Type**: Content
**Filename**: 02-slide-points.png
// KEY CONTENT
Headline: Points
Body:
- First
- Second

---

## Slide 3 of 3
**Type**: Back Cover
**Filename**: 03-slide-back-cover.png
// KEY CONTENT
Headline: Goodbye
`;
  const ir = await run(outline);
  assert.equal(ir.slides.length, 3);
  assert.equal(ir.slides[0].type, "cover");
  assert.equal(ir.slides[0].title, "Hello");
  assert.equal(ir.slides[0].subtitle, "World");
  assert.equal(ir.slides[1].type, "content");
  assert.deepEqual(ir.slides[1].bullets, ["First", "Second"]);
  assert.equal(ir.slides[2].type, "closing");
});

test("parses quote block with text + attribution", async () => {
  const outline = header(1) + `
## Slide 1 of 1
**Type**: Quote
**Filename**: 01-slide-quote.png

// QUOTE
Text: Latency is the new dial-up.
Attribution: Werner Vogels
`;
  const ir = await run(outline);
  assert.equal(ir.slides[0].type, "quote");
  assert.equal(ir.slides[0].quote.text, "Latency is the new dial-up.");
  assert.equal(ir.slides[0].quote.by, "Werner Vogels");
});

test("parses data block with markdown table + auto-numeric coercion", async () => {
  const outline = header(1) + `
## Slide 1 of 1
**Type**: Data
**Filename**: 01-slide-data.png

// KEY CONTENT
Headline: Latency

// DATA
Kind: bar
| mode | p95 |
|------|-----|
| Cloud | 240 |
| Edge | 28 |
`;
  const ir = await run(outline);
  assert.equal(ir.slides[0].type, "data");
  assert.equal(ir.slides[0].data.kind, "bar");
  assert.equal(ir.slides[0].data.rows.length, 2);
  assert.equal(ir.slides[0].data.rows[0].mode, "Cloud");
  assert.equal(ir.slides[0].data.rows[0].p95, 240);
  assert.equal(typeof ir.slides[0].data.rows[0].p95, "number");
});

test("parses code block with Lang + raw source", async () => {
  const outline = header(1) + `
## Slide 1 of 1
**Type**: Code
**Filename**: 01-slide-code.png

// KEY CONTENT
Headline: Cosine

// CODE
Lang: python

def cosine(a, b):
    return dot(a, b) / (norm(a) * norm(b))
`;
  const ir = await run(outline);
  assert.equal(ir.slides[0].type, "code");
  assert.equal(ir.slides[0].code.lang, "python");
  assert.ok(ir.slides[0].code.source.includes("def cosine"));
  assert.ok(!ir.slides[0].code.source.includes("---"));
});

test("parses diagram block and strips trailing section divider", async () => {
  const outline = header(1) + `
## Slide 1 of 1
**Type**: Diagram
**Filename**: 01-slide-diagram.png

// KEY CONTENT
Headline: Flow

// DIAGRAM
Kind: mermaid

graph LR
  A --> B
`;
  const ir = await run(outline);
  assert.equal(ir.slides[0].type, "diagram");
  assert.ok(ir.slides[0].diagram_spec.includes("graph LR"));
  assert.ok(!ir.slides[0].diagram_spec.trimEnd().endsWith("---"));
});

test("Render override appears as render_override in IR", async () => {
  const outline = header(1) + `
## Slide 1 of 1
**Type**: Content
**Render**: html
**Filename**: 01-slide-x.png
// KEY CONTENT
Headline: Override demo
`;
  const ir = await run(outline);
  assert.equal(ir.slides[0].render_override, "html");
});

test("validation rejects bullets-style filter false positive (Split: prefix)", async () => {
  const outline = header(1) + `
## Slide 1 of 1
**Type**: Content
**Filename**: 01-slide-x.png
// KEY CONTENT
Headline: Modes
Body:
- Split: option A
- Full: option B
`;
  const ir = await run(outline);
  assert.deepEqual(ir.slides[0].bullets, ["Split: option A", "Full: option B"]);
});

test("style_compatibility loaded from per-preset Compatible Outputs", async () => {
  const outline = header(1).replace("**Style**: corporate", "**Style**: corporate") + `
## Slide 1 of 1
**Type**: Cover
**Filename**: 01-slide-x.png
// KEY CONTENT
Headline: X
`;
  const ir = await run(outline);
  assert.equal(ir.meta.style_compatibility.png, "excellent");
  assert.equal(ir.meta.style_compatibility.html, "excellent");
  assert.equal(ir.meta.style_compatibility["pptx-editable"], "excellent");
});

test("validation rejects unsupported format/style combo", async () => {
  const outline = header(1).replace("**Style**: corporate", "**Style**: fantasy-animation") + `
## Slide 1 of 1
**Type**: Cover
**Filename**: 01-slide-x.png
// KEY CONTENT
Headline: X
`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slide-ir-test-"));
  await fs.writeFile(path.join(dir, "outline.md"), outline);
  let exitErr: any = null;
  try {
    await execFileAsync("bun", [scriptPath, dir, "--format", "html"]);
  } catch (e: any) {
    exitErr = e;
  }
  await fs.rm(dir, { recursive: true, force: true });
  assert.ok(exitErr, "expected non-zero exit");
  assert.ok(String(exitErr.stderr).includes("unsupported"), exitErr.stderr);
});

test("validation rejects mismatched slide count", async () => {
  const outline = header(5) + `
## Slide 1 of 5
**Type**: Cover
**Filename**: 01-slide-x.png
// KEY CONTENT
Headline: only one slide
`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slide-ir-test-"));
  await fs.writeFile(path.join(dir, "outline.md"), outline);
  let exitErr: any = null;
  try {
    await execFileAsync("bun", [scriptPath, dir, "--format", "png"]);
  } catch (e: any) {
    exitErr = e;
  }
  await fs.rm(dir, { recursive: true, force: true });
  assert.ok(exitErr, "expected non-zero exit");
  assert.ok(String(exitErr.stderr).includes("slide_count"), exitErr.stderr);
});
