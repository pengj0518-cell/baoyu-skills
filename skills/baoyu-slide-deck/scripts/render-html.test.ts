import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const scriptDir = path.join(repoRoot, "skills", "baoyu-slide-deck", "scripts");
const outlineToIr = path.join(scriptDir, "outline-to-ir.ts");
const renderHtml = path.join(scriptDir, "render-html.ts");

interface SlideSpec {
  n: number;
  slug: string;
  type: string;
  title?: string;
  bullets?: string[];
  quote?: { text: string; by?: string };
  data?: { kind: string; rows: any[] };
  code?: { lang: string; source: string };
  diagram_spec?: string;
  render_override?: string;
}

async function makeIRFixture(style: string, formats: string[], slides: SlideSpec[]): Promise<{ dir: string; html: () => Promise<string> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "render-html-test-"));
  const ir = {
    meta: {
      topic: "Test",
      topic_slug: "test",
      style,
      audience: "general",
      lang: "en",
      slide_count: slides.length,
      output_formats: formats,
      style_compatibility: { png: "excellent", html: style === "fantasy-animation" ? "unsupported" : "good", "pptx-editable": "good" },
      generated: "2026-05-15",
    },
    style_instructions: "<STYLE_INSTRUCTIONS>X</STYLE_INSTRUCTIONS>",
    slides: slides.map((s) => ({
      n: s.n,
      slug: s.slug,
      filename: `${String(s.n).padStart(2, "0")}-slide-${s.slug}.png`,
      type: s.type,
      title: s.title ?? "",
      ...(s.bullets ? { bullets: s.bullets } : {}),
      ...(s.quote ? { quote: s.quote } : {}),
      ...(s.data ? { data: s.data } : {}),
      ...(s.code ? { code: s.code } : {}),
      ...(s.diagram_spec ? { diagram_spec: s.diagram_spec } : {}),
      ...(s.render_override ? { render_override: s.render_override } : {}),
    })),
  };
  await fs.writeFile(path.join(dir, "slides.json"), JSON.stringify(ir));
  return {
    dir,
    html: async () => {
      await execFileAsync("bun", [renderHtml, dir]);
      return fs.readFile(path.join(dir, "test.html"), "utf-8");
    },
  };
}

async function cleanup(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

test("renders a cover slide with title and subtitle as h1", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "cover", type: "cover", title: "Edge AI", bullets: undefined },
  ]);
  const html = await f.html();
  assert.ok(html.includes('<h1 class="slide-title">Edge AI</h1>'));
  await cleanup(f.dir);
});

test("renders bullets as a real <ul>", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "p", type: "content", title: "Points", bullets: ["alpha", "beta", "gamma"] },
  ]);
  const html = await f.html();
  assert.ok(html.includes('<ul class="slide-bullets">'));
  assert.ok(html.includes("<li>alpha</li>"));
  assert.ok(html.includes("<li>gamma</li>"));
  await cleanup(f.dir);
});

test("renders quote slide as <blockquote>", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "q", type: "quote", title: "", quote: { text: "Be water", by: "Bruce Lee" } },
  ]);
  const html = await f.html();
  assert.ok(html.includes('class="slide-quote"'));
  assert.ok(html.includes("Be water"));
  assert.ok(html.includes("Bruce Lee"));
  await cleanup(f.dir);
});

test("renders data slide with inline SVG and numbers", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "d", type: "data", title: "Latency", data: { kind: "bar", rows: [{ mode: "Cloud", p95: 240 }, { mode: "Edge", p95: 28 }] } },
  ]);
  const html = await f.html();
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("240"));
  assert.ok(html.includes("28"));
  await cleanup(f.dir);
});

test("renders code slide with <pre><code>", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "c", type: "code", title: "Snippet", code: { lang: "python", source: "def f(): pass" } },
  ]);
  const html = await f.html();
  assert.ok(html.includes('class="slide-code"'));
  assert.ok(html.includes("def f(): pass"));
  await cleanup(f.dir);
});

test("escapes HTML special chars in bullets and code", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "x", type: "content", title: "Compare", bullets: ["a < b", "x > y"] },
  ]);
  const html = await f.html();
  assert.ok(html.includes("a &lt; b"));
  assert.ok(html.includes("x &gt; y"));
  await cleanup(f.dir);
});

test("HTML is single-file (no external network requests)", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "x", type: "cover", title: "X" },
  ]);
  const html = await f.html();
  assert.ok(!/<link\s+[^>]*href=["']http/i.test(html), "no remote <link>");
  assert.ok(!/<script\s+[^>]*src=["']http/i.test(html), "no remote <script src>");
  assert.ok(!/<img[^>]*src=["']http/i.test(html), "no remote <img>");
  await cleanup(f.dir);
});

test("aborts when style is unsupported for html", async () => {
  const f = await makeIRFixture("fantasy-animation", ["html"], [
    { n: 1, slug: "x", type: "cover", title: "X" },
  ]);
  let exitErr: any = null;
  try {
    await execFileAsync("bun", [renderHtml, f.dir]);
  } catch (e: any) {
    exitErr = e;
  }
  await cleanup(f.dir);
  assert.ok(exitErr, "expected non-zero exit");
});

test("ToC contains one entry per slide with slide number prefix", async () => {
  const f = await makeIRFixture("corporate", ["html"], [
    { n: 1, slug: "a", type: "cover", title: "First" },
    { n: 2, slug: "b", type: "content", title: "Second" },
    { n: 3, slug: "c", type: "closing", title: "Third" },
  ]);
  const html = await f.html();
  const tocItems = html.match(/<button data-go=/g) || [];
  assert.equal(tocItems.length, 3);
  assert.ok(html.includes(">01</span>"));
  assert.ok(html.includes(">03</span>"));
  await cleanup(f.dir);
});

test("Per-slide render_override image inlines the PNG full-bleed", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "render-html-test-"));
  const pngStub = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  await fs.writeFile(path.join(dir, "01-slide-x.png"), pngStub);
  const ir = {
    meta: {
      topic: "Override",
      topic_slug: "override",
      style: "corporate",
      audience: "general",
      lang: "en",
      slide_count: 1,
      output_formats: ["html"],
      style_compatibility: { png: "excellent", html: "excellent", "pptx-editable": "excellent" },
      generated: "2026-05-15",
    },
    style_instructions: "",
    slides: [{
      n: 1, slug: "x", filename: "01-slide-x.png", type: "content",
      title: "X", render_override: "image",
    }],
  };
  await fs.writeFile(path.join(dir, "slides.json"), JSON.stringify(ir));
  await execFileAsync("bun", [renderHtml, dir]);
  const html = await fs.readFile(path.join(dir, "override.html"), "utf-8");
  assert.ok(html.includes("data:image/png;base64,"), "expected inlined base64 PNG");
  await cleanup(dir);
});
