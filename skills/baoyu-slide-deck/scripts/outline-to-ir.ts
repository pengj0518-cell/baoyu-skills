import { existsSync, readFileSync, renameSync, statSync } from "fs";
import { join } from "path";

type Rating = "excellent" | "good" | "degraded" | "unsupported";
type OutputFormat = "png" | "html" | "pptx-editable";

interface CustomDimensions {
  texture: string;
  mood: string;
  typography: string;
  density: string;
}

interface Meta {
  topic: string;
  topic_slug: string;
  style: string | CustomDimensions;
  audience: string;
  lang: string;
  slide_count: number;
  output_formats: OutputFormat[];
  style_compatibility: Record<OutputFormat, Rating>;
  generated: string;
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
}

interface DeckIR {
  meta: Meta;
  style_instructions: string;
  slides: Slide[];
}

function parseArgs(): { dir: string; outputFormats: OutputFormat[] } {
  const args = process.argv.slice(2);
  let dir = "";
  const outputFormats: OutputFormat[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--format" || args[i] === "-f") {
      const value = args[++i];
      if (value === "png" || value === "html" || value === "pptx-editable") {
        outputFormats.push(value);
      }
    } else if (!args[i].startsWith("-")) {
      dir = args[i];
    }
  }

  if (!dir) {
    console.error("Usage: bun outline-to-ir.ts <slide-deck-dir> [--format png|html|pptx-editable ...]");
    process.exit(1);
  }

  if (outputFormats.length === 0) outputFormats.push("png");

  return { dir, outputFormats };
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

function parseStyle(value: string): string | CustomDimensions {
  return value.trim();
}

function parseDimensions(value: string): CustomDimensions | null {
  const parts = value.split("+").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 4) return null;
  return {
    texture: parts[0]!,
    mood: parts[1]!,
    typography: parts[2]!,
    density: parts[3]!,
  };
}

function extractField(text: string, label: string): string | undefined {
  const re = new RegExp(`^\\*\\*${label}\\*\\*\\s*:\\s*(.+)$`, "mi");
  const m = text.match(re);
  return m ? m[1]!.trim() : undefined;
}

function extractStyleInstructions(text: string): string {
  const start = text.indexOf("<STYLE_INSTRUCTIONS>");
  const end = text.indexOf("</STYLE_INSTRUCTIONS>");
  if (start < 0 || end < 0) return "";
  return text.slice(start, end + "</STYLE_INSTRUCTIONS>".length);
}

function extractSlideSections(text: string): string[] {
  const lines = text.split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  let inSlide = false;

  for (const line of lines) {
    if (/^##\s+Slide\s+\d+/i.test(line)) {
      if (inSlide && current.length > 0) sections.push(current.join("\n"));
      current = [line];
      inSlide = true;
    } else if (inSlide) {
      current.push(line);
    }
  }
  if (inSlide && current.length > 0) sections.push(current.join("\n"));
  return sections;
}

function parseSlideNumber(section: string): number {
  const m = section.match(/^##\s+Slide\s+(\d+)/i);
  return m ? parseInt(m[1]!, 10) : 0;
}

function normaliseType(raw: string | undefined): string {
  if (!raw) return "content";
  const v = raw.toLowerCase().trim();
  if (v.includes("cover") && v.includes("back")) return "closing";
  if (v === "back cover") return "closing";
  if (v === "cover") return "cover";
  return "content";
}

function extractFilename(section: string): string {
  const m = section.match(/^\*\*Filename\*\*\s*:\s*(.+)$/mi);
  return m ? m[1]!.trim() : "";
}

function deriveSlug(filename: string, n: number): string {
  const m = filename.match(/^\d+-slide-(.+?)\.(png|jpg|jpeg)$/i);
  if (m) return m[1]!;
  return `slide-${String(n).padStart(2, "0")}`;
}

function extractBlock(section: string, marker: string): string | undefined {
  const idx = section.indexOf(`// ${marker}`);
  if (idx < 0) return undefined;
  const rest = section.slice(idx + `// ${marker}`.length);
  const next = rest.search(/\n\/\/\s+[A-Z]/);
  const block = next < 0 ? rest : rest.slice(0, next);
  return block.trim() || undefined;
}

function parseKeyContent(block: string | undefined): {
  title: string;
  subtitle?: string;
  bullets?: string[];
} {
  if (!block) return { title: "" };
  const titleMatch = block.match(/^Headline\s*:\s*(.+)$/mi);
  const subMatch = block.match(/^Sub-?headline\s*:\s*(.+)$/mi);
  const bodyIdx = block.search(/^Body\s*:/mi);
  let bullets: string[] | undefined;
  if (bodyIdx >= 0) {
    const body = block.slice(bodyIdx).split("\n").slice(1);
    bullets = body
      .filter((l) => /^\s*[-*]\s+/.test(l))
      .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
      .filter((l) => l.length > 0);
  }
  return {
    title: titleMatch ? titleMatch[1]!.trim() : "",
    subtitle: subMatch ? subMatch[1]!.trim() : undefined,
    bullets: bullets && bullets.length > 0 ? bullets : undefined,
  };
}

function parseLayout(block: string | undefined): string | undefined {
  if (!block) return undefined;
  const m = block.match(/^Layout\s*:\s*(.+)$/mi);
  return m ? m[1]!.trim() : undefined;
}

function loadStyleCompatibility(skillRoot: string, style: string | CustomDimensions): Record<OutputFormat, Rating> {
  if (typeof style !== "string") {
    return { png: "excellent", html: "good", "pptx-editable": "good" };
  }
  const path = join(skillRoot, "references", "styles", `${style}.md`);
  if (!existsSync(path)) {
    return { png: "excellent", html: "good", "pptx-editable": "good" };
  }
  const text = readFileSync(path, "utf-8");
  const section = text.match(/##\s+Compatible Outputs([\s\S]*?)(?=\n##\s|\n#\s|$)/);
  if (!section) return { png: "excellent", html: "good", "pptx-editable": "good" };
  const result: Record<OutputFormat, Rating> = { png: "excellent", html: "good", "pptx-editable": "good" };
  const rows = section[1]!.matchAll(/^\|\s*(png|html|pptx-editable)\s*\|\s*(excellent|good|degraded|unsupported)\s*\|/gmi);
  for (const r of rows) {
    result[r[1] as OutputFormat] = r[2] as Rating;
  }
  return result;
}

function parseOutline(text: string, skillRoot: string, outputFormats: OutputFormat[]): DeckIR {
  const topic = extractField(text, "Topic") || "Untitled";
  const styleRaw = extractField(text, "Style") || "blueprint";
  const dims = extractField(text, "Dimensions");
  const audience = extractField(text, "Audience") || "general";
  const lang = extractField(text, "Language") || "en";
  const slideCountRaw = extractField(text, "Slide Count") || "0";
  const generated = extractField(text, "Generated") || new Date().toISOString();

  let style: string | CustomDimensions = parseStyle(styleRaw);
  if (typeof style === "string" && style.toLowerCase() === "custom" && dims) {
    const parsed = parseDimensions(dims);
    if (parsed) style = parsed;
  }

  const topicSlugRaw = topic.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const topicSlug = topicSlugRaw || "deck";

  const styleInstructions = extractStyleInstructions(text);
  const sections = extractSlideSections(text);

  const slides: Slide[] = sections.map((section) => {
    const n = parseSlideNumber(section);
    const typeRaw = (section.match(/^\*\*Type\*\*\s*:\s*(.+)$/mi) || [])[1];
    const filename = extractFilename(section);
    const slug = deriveSlug(filename, n);
    const keyBlock = extractBlock(section, "KEY CONTENT");
    const visual = extractBlock(section, "VISUAL");
    const layoutBlock = extractBlock(section, "LAYOUT");
    const narrative = extractBlock(section, "NARRATIVE GOAL");
    const kc = parseKeyContent(keyBlock);

    return {
      n,
      slug,
      filename: filename || `${String(n).padStart(2, "0")}-slide-${slug}.png`,
      type: normaliseType(typeRaw),
      layout: parseLayout(layoutBlock),
      narrative_goal: narrative,
      title: kc.title,
      subtitle: kc.subtitle,
      bullets: kc.bullets,
      image_prompt: visual,
    };
  }).sort((a, b) => a.n - b.n);

  const slideCount = parseInt(slideCountRaw, 10) || slides.length;
  const compatibility = loadStyleCompatibility(skillRoot, style);

  return {
    meta: {
      topic,
      topic_slug: topicSlug,
      style,
      audience,
      lang,
      slide_count: slideCount,
      output_formats: outputFormats,
      style_compatibility: compatibility,
      generated,
    },
    style_instructions: styleInstructions,
    slides,
  };
}

function validate(ir: DeckIR): string[] {
  const errors: string[] = [];
  if (ir.meta.slide_count !== ir.slides.length) {
    errors.push(`meta.slide_count (${ir.meta.slide_count}) !== slides.length (${ir.slides.length})`);
  }
  const seen = new Set<number>();
  for (const s of ir.slides) {
    if (seen.has(s.n)) errors.push(`Duplicate slide number n=${s.n}`);
    seen.add(s.n);
    const prefix = String(s.n).padStart(2, "0");
    if (!s.filename.startsWith(`${prefix}-`)) {
      errors.push(`Slide n=${s.n} filename "${s.filename}" does not start with "${prefix}-"`);
    }
    if (!s.title) errors.push(`Slide n=${s.n} (${s.slug}) has empty title`);
  }
  for (const fmt of ir.meta.output_formats) {
    if (ir.meta.style_compatibility[fmt] === "unsupported") {
      errors.push(`output_format "${fmt}" is unsupported by style "${typeof ir.meta.style === "string" ? ir.meta.style : "custom"}"`);
    }
  }
  return errors;
}

function findSkillRoot(): string {
  return join(import.meta.dir, "..");
}

async function main() {
  const { dir, outputFormats } = parseArgs();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const outlinePath = join(dir, "outline.md");
  if (!existsSync(outlinePath)) {
    console.error(`outline.md not found in: ${dir}`);
    process.exit(1);
  }

  const text = readFileSync(outlinePath, "utf-8");
  const ir = parseOutline(text, findSkillRoot(), outputFormats);
  const errors = validate(ir);

  if (errors.length > 0) {
    console.error("IR validation errors:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const irPath = join(dir, "slides.json");
  backupIfExists(irPath);
  await Bun.write(irPath, JSON.stringify(ir, null, 2));

  console.log(`Wrote: ${irPath}`);
  console.log(`Slides: ${ir.slides.length}`);
  console.log(`Style: ${typeof ir.meta.style === "string" ? ir.meta.style : "custom"}`);
  console.log(`Output formats: ${ir.meta.output_formats.join(", ")}`);
  for (const fmt of ir.meta.output_formats) {
    const rating = ir.meta.style_compatibility[fmt];
    if (rating === "degraded") {
      console.log(`  ⚠ ${fmt}: degraded (signature look will be approximated)`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
