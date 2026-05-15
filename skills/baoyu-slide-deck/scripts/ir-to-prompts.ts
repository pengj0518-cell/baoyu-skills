import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "fs";
import { join } from "path";

type Rating = "excellent" | "good" | "degraded" | "unsupported";
type OutputFormat = "png" | "html" | "pptx-editable";

interface CustomDimensions {
  texture: string;
  mood: string;
  typography: string;
  density: string;
}

interface Slide {
  n: number;
  slug: string;
  filename: string;
  type: string;
  layout?: string;
  narrative_goal?: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  image_prompt?: string;
  background_image?: string;
  text_safe_zone?: { x: number; y: number; w: number; h: number };
  render_override?: string | null;
}

interface DeckIR {
  meta: {
    topic: string;
    topic_slug: string;
    style: string | CustomDimensions;
    audience: string;
    lang: string;
    slide_count: number;
    output_formats: OutputFormat[];
    style_compatibility: Record<OutputFormat, Rating>;
    generated: string;
  };
  style_instructions: string;
  slides: Slide[];
}

function parseArgs(): { dir: string; only?: number[] } {
  const args = process.argv.slice(2);
  let dir = "";
  let only: number[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--only") {
      const value = args[++i];
      only = value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
    } else if (!args[i]!.startsWith("-")) {
      dir = args[i]!;
    }
  }

  if (!dir) {
    console.error("Usage: bun ir-to-prompts.ts <slide-deck-dir> [--only 1,3,5]");
    process.exit(1);
  }

  return { dir, only };
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupIfExists(path: string): void {
  if (!existsSync(path)) return;
  const dot = path.lastIndexOf(".");
  const base = dot >= 0 ? path.slice(0, dot) : path;
  const ext = dot >= 0 ? path.slice(dot) : "";
  renameSync(path, `${base}-backup-${timestamp()}${ext}`);
}

function findSkillRoot(): string {
  return join(import.meta.dir, "..");
}

function loadBasePrompt(): string {
  const path = join(findSkillRoot(), "references", "base-prompt.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function loadLayoutHint(layout: string | undefined): string {
  if (!layout) return "";
  const path = join(findSkillRoot(), "references", "layouts.md");
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf-8");
  const re = new RegExp(`\\|\\s*\`${layout}\`\\s*\\|\\s*([^|]+)\\|\\s*([^|]+)\\|`);
  const m = text.match(re);
  if (!m) return "";
  return `Layout: ${layout}\n${m[1]!.trim()} — best for ${m[2]!.trim()}`;
}

function formatBody(slide: Slide): string {
  const lines: string[] = [];
  lines.push(`Headline: ${slide.title}`);
  if (slide.subtitle) lines.push(`Sub-headline: ${slide.subtitle}`);
  if (slide.bullets && slide.bullets.length > 0) {
    lines.push("Body:");
    for (const b of slide.bullets) lines.push(`- ${b}`);
  }
  return lines.join("\n");
}

function buildPrompt(slide: Slide, ir: DeckIR, basePrompt: string): string {
  const styleLabel = typeof ir.meta.style === "string"
    ? ir.meta.style
    : `custom: ${ir.meta.style.texture}+${ir.meta.style.mood}+${ir.meta.style.typography}+${ir.meta.style.density}`;

  const parts: string[] = [];
  parts.push(basePrompt.trim());
  parts.push("\n---\n");
  parts.push(ir.style_instructions || "<STYLE_INSTRUCTIONS>\n[missing — re-run outline-to-ir.ts]\n</STYLE_INSTRUCTIONS>");
  parts.push("\n---\n");
  parts.push("## SLIDE CONTENT\n");
  parts.push(`Slide: ${slide.n} of ${ir.meta.slide_count}`);
  parts.push(`Filename: ${slide.filename}`);
  parts.push(`Type: ${slide.type}`);
  parts.push(`Style: ${styleLabel}`);
  parts.push(`Language: ${ir.meta.lang}`);
  parts.push(`Audience: ${ir.meta.audience}`);
  if (slide.narrative_goal) {
    parts.push("\n// NARRATIVE GOAL");
    parts.push(slide.narrative_goal);
  }
  parts.push("\n// KEY CONTENT");
  parts.push(formatBody(slide));
  if (slide.image_prompt) {
    parts.push("\n// VISUAL");
    parts.push(slide.image_prompt);
  }
  const layoutHint = loadLayoutHint(slide.layout);
  if (layoutHint) {
    parts.push("\n// LAYOUT");
    parts.push(layoutHint);
  }
  if (slide.text_safe_zone) {
    const z = slide.text_safe_zone;
    parts.push("\n// TEXT-SAFE ZONE (PPTX hybrid mode)");
    parts.push(`Leave region empty for overlaid text — x=${z.x}, y=${z.y}, w=${z.w}, h=${z.h} (normalised 0–1).`);
  }
  return parts.join("\n");
}

function buildFrontmatter(slide: Slide, ir: DeckIR): string {
  const lines: string[] = ["---"];
  lines.push(`n: ${slide.n}`);
  lines.push(`slug: ${slide.slug}`);
  lines.push(`type: ${slide.type}`);
  if (slide.layout) lines.push(`layout: ${slide.layout}`);
  lines.push(`filename: ${slide.filename}`);
  lines.push(`output_formats: [${ir.meta.output_formats.join(", ")}]`);
  if (slide.render_override) lines.push(`render_override: ${slide.render_override}`);
  lines.push("---\n");
  return lines.join("\n");
}

async function main() {
  const { dir, only } = parseArgs();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const irPath = join(dir, "slides.json");
  if (!existsSync(irPath)) {
    console.error(`slides.json not found in: ${dir}`);
    console.error("Run outline-to-ir.ts first.");
    process.exit(1);
  }

  const ir = JSON.parse(readFileSync(irPath, "utf-8")) as DeckIR;
  const basePrompt = loadBasePrompt();
  const promptsDir = join(dir, "prompts");
  if (!existsSync(promptsDir)) mkdirSync(promptsDir, { recursive: true });

  const target = only ? ir.slides.filter((s) => only.includes(s.n)) : ir.slides;
  if (only && target.length !== only.length) {
    const found = new Set(target.map((s) => s.n));
    const missing = only.filter((n) => !found.has(n));
    console.error(`Slides not found in IR: ${missing.join(", ")}`);
    process.exit(1);
  }

  let written = 0;
  for (const slide of target) {
    const filename = slide.filename.replace(/\.(png|jpg|jpeg)$/i, ".md");
    const outPath = join(promptsDir, filename);
    backupIfExists(outPath);
    const body = buildFrontmatter(slide, ir) + buildPrompt(slide, ir, basePrompt);
    await Bun.write(outPath, body);
    console.log(`Wrote: prompts/${filename}`);
    written++;
  }

  console.log(`\nTotal prompts written: ${written}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
