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
const renderPptx = path.join(scriptDir, "render-pptx-editable.ts");

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
  layout?: string;
}

async function makeFixture(style: string, slides: SlideSpec[], lang = "en"): Promise<{ dir: string; pptxPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "render-pptx-test-"));
  const compat = (style === "fantasy-animation" || style === "pixel-art")
    ? { png: "excellent", html: "unsupported", "pptx-editable": "unsupported" }
    : { png: "excellent", html: "excellent", "pptx-editable": "excellent" };
  const ir = {
    meta: {
      topic: "Test",
      topic_slug: "test",
      style,
      audience: "general",
      lang,
      slide_count: slides.length,
      output_formats: ["pptx-editable"],
      style_compatibility: compat,
      generated: "2026-05-15",
    },
    style_instructions: "",
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
      ...(s.layout ? { layout: s.layout } : {}),
    })),
  };
  await fs.writeFile(path.join(dir, "slides.json"), JSON.stringify(ir));
  await execFileAsync("bun", [renderPptx, dir]);
  return { dir, pptxPath: path.join(dir, "test-editable.pptx") };
}

async function unzipEntry(zipPath: string, entry: string): Promise<string> {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entry]);
  return stdout;
}

async function unzipList(zipPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("unzip", ["-l", zipPath]);
  return stdout.split("\n").map((l) => l.trim());
}

async function cleanup(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

function texts(xml: string): string[] {
  return Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]!);
}

test("produces a valid PPTX zip with one slide per IR entry", async () => {
  const f = await makeFixture("corporate", [
    { n: 1, slug: "a", type: "cover", title: "First" },
    { n: 2, slug: "b", type: "content", title: "Second", bullets: ["x", "y"] },
    { n: 3, slug: "c", type: "closing", title: "Third" },
  ]);
  const list = await unzipList(f.pptxPath);
  const slideXmls = list.filter((l) => /ppt\/slides\/slide\d+\.xml$/.test(l));
  assert.equal(slideXmls.length, 3);
  await cleanup(f.dir);
});

test("text content lands as real <a:t> elements (not embedded image)", async () => {
  const f = await makeFixture("corporate", [
    { n: 1, slug: "x", type: "content", title: "Headline X", bullets: ["alpha bullet", "beta bullet"] },
  ]);
  const xml = await unzipEntry(f.pptxPath, "ppt/slides/slide1.xml");
  const ts = texts(xml);
  assert.ok(ts.includes("Headline X"));
  assert.ok(ts.includes("alpha bullet"));
  assert.ok(ts.includes("beta bullet"));
  await cleanup(f.dir);
});

test("data slide emits a native chart, not text", async () => {
  const f = await makeFixture("corporate", [
    { n: 1, slug: "d", type: "data", title: "Latency",
      data: { kind: "bar", rows: [{ mode: "Cloud", p95: 240 }, { mode: "Edge", p95: 28 }] } },
  ]);
  const list = await unzipList(f.pptxPath);
  const chartEntries = list.filter((l) => l.includes("ppt/charts/chart") && l.endsWith(".xml"));
  assert.ok(chartEntries.length >= 1, "expected at least one chart XML");
  const xml = await unzipEntry(f.pptxPath, "ppt/slides/slide1.xml");
  assert.ok(xml.includes("<c:chart") || xml.includes("graphicFrame"), "slide should reference a chart");
  await cleanup(f.dir);
});

test("code slide renders monospace text, no chart", async () => {
  const f = await makeFixture("corporate", [
    { n: 1, slug: "c", type: "code", title: "Snippet", code: { lang: "python", source: "def f():\n    return 42" } },
  ]);
  const xml = await unzipEntry(f.pptxPath, "ppt/slides/slide1.xml");
  const ts = texts(xml);
  assert.ok(ts.some((t) => t.includes("def f():")));
  assert.ok(ts.some((t) => t.includes("return 42")));
  await cleanup(f.dir);
});

test("quote slide includes quote text and attribution as text", async () => {
  const f = await makeFixture("corporate", [
    { n: 1, slug: "q", type: "quote", title: "", quote: { text: "Be water.", by: "Bruce Lee" } },
  ]);
  const xml = await unzipEntry(f.pptxPath, "ppt/slides/slide1.xml");
  const ts = texts(xml);
  assert.ok(ts.some((t) => t.includes("Be water.")));
  assert.ok(ts.some((t) => t.includes("Bruce Lee")));
  await cleanup(f.dir);
});

test("zh language switches to Chinese font fallback", async () => {
  const f = await makeFixture("corporate", [
    { n: 1, slug: "x", type: "cover", title: "你好" },
  ], "zh");
  const xml = await unzipEntry(f.pptxPath, "ppt/slides/slide1.xml");
  assert.ok(xml.includes("Microsoft YaHei"), "zh deck should use Microsoft YaHei font");
  await cleanup(f.dir);
});

test("aborts when style is unsupported for pptx-editable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "render-pptx-test-"));
  const ir = {
    meta: { topic: "X", topic_slug: "x", style: "fantasy-animation", audience: "general", lang: "en",
      slide_count: 1, output_formats: ["pptx-editable"],
      style_compatibility: { png: "excellent", html: "unsupported", "pptx-editable": "unsupported" },
      generated: "2026-05-15" },
    style_instructions: "",
    slides: [{ n: 1, slug: "x", filename: "01-slide-x.png", type: "cover", title: "X" }],
  };
  await fs.writeFile(path.join(dir, "slides.json"), JSON.stringify(ir));
  let exitErr: any = null;
  try {
    await execFileAsync("bun", [renderPptx, dir]);
  } catch (e: any) {
    exitErr = e;
  }
  await cleanup(dir);
  assert.ok(exitErr, "expected non-zero exit");
});

test("custom dimensions style falls back to default theme without error", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "render-pptx-test-"));
  const ir = {
    meta: { topic: "X", topic_slug: "x",
      style: { texture: "clean", mood: "warm", typography: "geometric", density: "balanced" },
      audience: "general", lang: "en", slide_count: 1, output_formats: ["pptx-editable"],
      style_compatibility: { png: "excellent", html: "good", "pptx-editable": "good" },
      generated: "2026-05-15" },
    style_instructions: "",
    slides: [{ n: 1, slug: "x", filename: "01-slide-x.png", type: "cover", title: "Hello" }],
  };
  await fs.writeFile(path.join(dir, "slides.json"), JSON.stringify(ir));
  await execFileAsync("bun", [renderPptx, dir]);
  const xml = await unzipEntry(path.join(dir, "x-editable.pptx"), "ppt/slides/slide1.xml");
  assert.ok(texts(xml).includes("Hello"));
  await cleanup(dir);
});
