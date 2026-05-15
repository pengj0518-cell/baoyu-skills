import { existsSync, readFileSync, renameSync, statSync } from "fs";
import { join } from "path";
import PptxGenJS from "pptxgenjs";

type Rating = "excellent" | "good" | "degraded" | "unsupported";
type OutputFormat = "png" | "html" | "pptx-editable";

interface CustomDimensions {
  texture: string;
  mood: string;
  typography: string;
  density: string;
}

interface SlideData {
  kind: "bar" | "line" | "pie" | "table";
  rows: Record<string, unknown>[];
  x_key?: string;
  y_key?: string;
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
  quote?: { text: string; by?: string };
  data?: SlideData;
  diagram_spec?: string;
  code?: { lang: string; source: string };
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

interface Theme {
  fonts: {
    heading: string;
    body: string;
    mono: string;
    headingZh?: string;
    bodyZh?: string;
  };
  colors: {
    bg: string;
    textPrimary: string;
    textHeading: string;
    textSecondary: string;
    accent: string;
    accentOn: string;
    border: string;
    grid?: string;
  };
  sizes: {
    titleCover: number;
    titleContent: number;
    titleKeyStat: number;
    subtitle: number;
    body: number;
    quote: number;
    code: number;
    bulletGap: number;
  };
  options: {
    titleBold?: boolean;
    titleUnderline?: boolean;
    bulletShape?: string;
    drawGrid?: boolean;
    extraPadding?: boolean;
  };
}

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

function parseArgs(): { dir: string; output?: string } {
  const args = process.argv.slice(2);
  let dir = "";
  let output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" || args[i] === "-o") {
      output = args[++i];
    } else if (!args[i]!.startsWith("-")) {
      dir = args[i]!;
    }
  }
  if (!dir) {
    console.error("Usage: bun render-pptx-editable.ts <slide-deck-dir> [--output filename.pptx]");
    process.exit(1);
  }
  return { dir, output };
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

function loadTheme(style: string | CustomDimensions): Theme {
  const themesDir = join(findSkillRoot(), "references", "pptx-themes");
  const defaultTheme = JSON.parse(readFileSync(join(themesDir, "_default.json"), "utf-8")) as Theme;
  if (typeof style !== "string") return defaultTheme;
  const path = join(themesDir, `${style}.json`);
  if (!existsSync(path)) return defaultTheme;
  const preset = JSON.parse(readFileSync(path, "utf-8")) as Theme;
  return {
    fonts: { ...defaultTheme.fonts, ...preset.fonts },
    colors: { ...defaultTheme.colors, ...preset.colors },
    sizes: { ...defaultTheme.sizes, ...preset.sizes },
    options: { ...defaultTheme.options, ...preset.options },
  };
}

function resolveFonts(theme: Theme, lang: string): { heading: string; body: string; mono: string } {
  const isZh = /^zh/i.test(lang);
  return {
    heading: isZh && theme.fonts.headingZh ? theme.fonts.headingZh : theme.fonts.heading,
    body: isZh && theme.fonts.bodyZh ? theme.fonts.bodyZh : theme.fonts.body,
    mono: theme.fonts.mono,
  };
}

function dataImagePath(deckDir: string, filename: string): string | null {
  const path = join(deckDir, filename);
  if (!existsSync(path)) return null;
  const data = readFileSync(path);
  const ext = filename.toLowerCase().split(".").pop();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${data.toString("base64")}`;
}

function drawBackground(slide: PptxGenJS.Slide, theme: Theme, deckDir: string, ir: Slide): void {
  slide.background = { color: theme.colors.bg };
  if (ir.background_image) {
    const uri = dataImagePath(deckDir, ir.background_image);
    if (uri) {
      slide.addImage({ data: uri, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, sizing: { type: "cover", w: SLIDE_W, h: SLIDE_H } });
      return;
    }
  }
  if (theme.options.drawGrid && theme.colors.grid) {
    const step = 0.6;
    for (let x = step; x < SLIDE_W; x += step) {
      slide.addShape("line", {
        x, y: 0, w: 0, h: SLIDE_H,
        line: { color: theme.colors.grid, width: 0.5 },
      });
    }
    for (let y = step; y < SLIDE_H; y += step) {
      slide.addShape("line", {
        x: 0, y, w: SLIDE_W, h: 0,
        line: { color: theme.colors.grid, width: 0.5 },
      });
    }
  }
}

function bulletShapeProps(shape: string | undefined, color: string): { type: "number" | "bullet"; characterCode?: string; code?: string; indent?: number } {
  if (shape === "dash") return { type: "bullet", characterCode: "2013" };
  if (shape === "square") return { type: "bullet", characterCode: "25AA" };
  return { type: "bullet", characterCode: "2022" };
}

function renderCoverOrClosing(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): void {
  const padding = theme.options.extraPadding ? 1.2 : 0.8;
  const titleY = ir.subtitle ? 2.6 : 3.0;
  slide.addText(ir.title, {
    x: padding,
    y: titleY,
    w: SLIDE_W - padding * 2,
    h: 2.2,
    fontFace: fonts.heading,
    fontSize: theme.sizes.titleCover,
    color: theme.colors.textHeading,
    bold: theme.options.titleBold !== false,
    align: "center",
    valign: "middle",
    fit: "shrink",
  });
  if (ir.subtitle) {
    slide.addText(ir.subtitle, {
      x: padding,
      y: 5.0,
      w: SLIDE_W - padding * 2,
      h: 1.0,
      fontFace: fonts.body,
      fontSize: theme.sizes.subtitle,
      color: theme.colors.textSecondary,
      align: "center",
      valign: "top",
      fit: "shrink",
    });
  }
}

function renderKeyStat(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): void {
  const padding = 0.8;
  slide.addText(ir.title, {
    x: padding,
    y: 1.5,
    w: SLIDE_W - padding * 2,
    h: 4.5,
    fontFace: fonts.heading,
    fontSize: theme.sizes.titleKeyStat,
    color: theme.colors.textHeading,
    bold: true,
    align: "center",
    valign: "middle",
    fit: "shrink",
  });
  if (ir.subtitle) {
    slide.addText(ir.subtitle, {
      x: padding,
      y: 6.0,
      w: SLIDE_W - padding * 2,
      h: 1.0,
      fontFace: fonts.body,
      fontSize: theme.sizes.subtitle,
      color: theme.colors.textSecondary,
      align: "center",
      fit: "shrink",
    });
  }
}

function renderTitleBlock(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): number {
  const padding = theme.options.extraPadding ? 1.0 : 0.7;
  slide.addText(ir.title, {
    x: padding,
    y: 0.5,
    w: SLIDE_W - padding * 2,
    h: 0.9,
    fontFace: fonts.heading,
    fontSize: theme.sizes.titleContent,
    color: theme.colors.textHeading,
    bold: theme.options.titleBold !== false,
    align: "left",
    valign: "top",
    fit: "shrink",
    underline: theme.options.titleUnderline ? { style: "sng", color: theme.colors.accent } : undefined,
  });
  let nextY = 1.5;
  if (ir.subtitle) {
    slide.addText(ir.subtitle, {
      x: padding,
      y: nextY,
      w: SLIDE_W - padding * 2,
      h: 0.6,
      fontFace: fonts.body,
      fontSize: theme.sizes.subtitle,
      color: theme.colors.textSecondary,
      align: "left",
      fit: "shrink",
    });
    nextY += 0.7;
  }
  return nextY;
}

function renderBulletList(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): void {
  const padding = theme.options.extraPadding ? 1.0 : 0.7;
  const topY = renderTitleBlock(slide, ir, theme, fonts);
  if (!ir.bullets || ir.bullets.length === 0) return;
  const bulletProps = bulletShapeProps(theme.options.bulletShape, theme.colors.accent);
  slide.addText(
    ir.bullets.map((b) => ({ text: b, options: { bullet: bulletProps, paraSpaceAfter: theme.sizes.bulletGap } })),
    {
      x: padding,
      y: topY + 0.1,
      w: SLIDE_W - padding * 2,
      h: SLIDE_H - topY - 0.6,
      fontFace: fonts.body,
      fontSize: theme.sizes.body,
      color: theme.colors.textPrimary,
      valign: "top",
      fit: "shrink",
    },
  );
}

function renderColumns(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }, cols: number): void {
  const padding = theme.options.extraPadding ? 1.0 : 0.7;
  const topY = renderTitleBlock(slide, ir, theme, fonts);
  if (!ir.bullets || ir.bullets.length === 0) return;
  const gap = 0.5;
  const colW = (SLIDE_W - padding * 2 - gap * (cols - 1)) / cols;
  const perCol = Math.ceil(ir.bullets.length / cols);
  for (let c = 0; c < cols; c++) {
    const slice = ir.bullets.slice(c * perCol, (c + 1) * perCol);
    if (slice.length === 0) continue;
    const bulletProps = bulletShapeProps(theme.options.bulletShape, theme.colors.accent);
    slide.addText(
      slice.map((b) => ({ text: b, options: { bullet: bulletProps, paraSpaceAfter: theme.sizes.bulletGap } })),
      {
        x: padding + c * (colW + gap),
        y: topY + 0.1,
        w: colW,
        h: SLIDE_H - topY - 0.6,
        fontFace: fonts.body,
        fontSize: theme.sizes.body,
        color: theme.colors.textPrimary,
        valign: "top",
        fit: "shrink",
      },
    );
  }
}

function renderQuote(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): void {
  const padding = 1.2;
  if (!ir.quote) {
    renderBulletList(slide, ir, theme, fonts);
    return;
  }
  slide.addShape("rect", {
    x: padding - 0.15,
    y: 2.0,
    w: 0.08,
    h: 3.5,
    fill: { color: theme.colors.accent },
    line: { color: theme.colors.accent, width: 0 },
  });
  slide.addText(`"${ir.quote.text}"`, {
    x: padding,
    y: 2.0,
    w: SLIDE_W - padding * 2,
    h: 3.0,
    fontFace: fonts.heading,
    fontSize: theme.sizes.quote,
    color: theme.colors.textHeading,
    italic: true,
    align: "left",
    valign: "middle",
    fit: "shrink",
  });
  if (ir.quote.by) {
    slide.addText(`— ${ir.quote.by}`, {
      x: padding,
      y: 5.2,
      w: SLIDE_W - padding * 2,
      h: 0.5,
      fontFace: fonts.body,
      fontSize: theme.sizes.subtitle,
      color: theme.colors.textSecondary,
      align: "left",
      fit: "shrink",
    });
  }
}

function renderCode(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): void {
  const padding = theme.options.extraPadding ? 1.0 : 0.7;
  const topY = renderTitleBlock(slide, ir, theme, fonts);
  if (!ir.code) return;
  slide.addShape("rect", {
    x: padding,
    y: topY + 0.1,
    w: SLIDE_W - padding * 2,
    h: SLIDE_H - topY - 0.6,
    fill: { color: theme.colors.border, transparency: 70 },
    line: { color: theme.colors.border, width: 0 },
  });
  slide.addText(ir.code.source, {
    x: padding + 0.2,
    y: topY + 0.25,
    w: SLIDE_W - padding * 2 - 0.4,
    h: SLIDE_H - topY - 0.85,
    fontFace: fonts.mono,
    fontSize: theme.sizes.code,
    color: theme.colors.textPrimary,
    align: "left",
    valign: "top",
    fit: "shrink",
  });
}

function renderDiagram(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }): void {
  const padding = theme.options.extraPadding ? 1.0 : 0.7;
  const topY = renderTitleBlock(slide, ir, theme, fonts);
  if (!ir.diagram_spec) return;
  slide.addShape("rect", {
    x: padding,
    y: topY + 0.1,
    w: SLIDE_W - padding * 2,
    h: SLIDE_H - topY - 0.6,
    fill: { color: theme.colors.border, transparency: 80 },
    line: { color: theme.colors.border, width: 0 },
  });
  slide.addText(ir.diagram_spec, {
    x: padding + 0.2,
    y: topY + 0.25,
    w: SLIDE_W - padding * 2 - 0.4,
    h: SLIDE_H - topY - 0.85,
    fontFace: fonts.mono,
    fontSize: theme.sizes.code,
    color: theme.colors.textSecondary,
    align: "left",
    valign: "top",
    fit: "shrink",
  });
}

function renderData(slide: PptxGenJS.Slide, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }, pptx: PptxGenJS): void {
  const padding = theme.options.extraPadding ? 1.0 : 0.7;
  const topY = renderTitleBlock(slide, ir, theme, fonts);
  if (!ir.data) return;
  const rows = ir.data.rows;
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]!);
  const xKey = ir.data.x_key || keys[0]!;
  const yKey = ir.data.y_key || keys.find((k) => k !== xKey && typeof rows[0]![k] === "number") || keys[1]!;

  if (ir.data.kind === "bar" || ir.data.kind === "line") {
    const chartType = ir.data.kind === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
    const labels = rows.map((r) => String(r[xKey]));
    const values = rows.map((r) => Number(r[yKey]) || 0);
    slide.addChart(chartType, [{ name: yKey, labels, values }], {
      x: padding,
      y: topY + 0.1,
      w: SLIDE_W - padding * 2,
      h: SLIDE_H - topY - 0.6,
      chartColors: [theme.colors.accent],
      catAxisLabelColor: theme.colors.textSecondary,
      catAxisLabelFontFace: fonts.body,
      catAxisLabelFontSize: 10,
      valAxisLabelColor: theme.colors.textSecondary,
      valAxisLabelFontFace: fonts.body,
      valAxisLabelFontSize: 10,
      showValue: ir.data.kind === "bar",
      dataLabelFontFace: fonts.body,
      dataLabelFontSize: 9,
      dataLabelColor: theme.colors.textHeading,
      showLegend: false,
      barDir: "col",
    });
    return;
  }

  if (ir.data.kind === "pie") {
    const labels = rows.map((r) => String(r[xKey]));
    const values = rows.map((r) => Number(r[yKey]) || 0);
    slide.addChart(pptx.ChartType.pie, [{ name: yKey, labels, values }], {
      x: padding,
      y: topY + 0.1,
      w: SLIDE_W - padding * 2,
      h: SLIDE_H - topY - 0.6,
      chartColorsOpacity: 90,
      showLegend: true,
      legendFontFace: fonts.body,
      legendFontSize: 12,
    });
    return;
  }

  const head = keys.map((k) => ({ text: k, options: { bold: true, color: theme.colors.textHeading } }));
  const body = rows.map((r) => keys.map((k) => ({ text: String(r[k] ?? ""), options: { color: theme.colors.textPrimary } })));
  slide.addTable([head, ...body], {
    x: padding,
    y: topY + 0.1,
    w: SLIDE_W - padding * 2,
    fontFace: fonts.body,
    fontSize: theme.sizes.body - 4,
    border: { type: "solid", color: theme.colors.border, pt: 0.5 },
  });
}

function renderImageFull(slide: PptxGenJS.Slide, ir: Slide, deckDir: string): boolean {
  const candidate = ir.background_image || ir.filename;
  const uri = dataImagePath(deckDir, candidate);
  if (!uri) return false;
  slide.addImage({ data: uri, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, sizing: { type: "contain", w: SLIDE_W, h: SLIDE_H } });
  return true;
}

function renderSlide(pptx: PptxGenJS, ir: Slide, theme: Theme, fonts: { heading: string; body: string; mono: string }, deckDir: string): void {
  const slide = pptx.addSlide();

  if (ir.render_override === "image") {
    if (renderImageFull(slide, ir, deckDir)) return;
  }

  drawBackground(slide, theme, deckDir, ir);

  if (ir.type === "image") {
    renderImageFull(slide, ir, deckDir);
    return;
  }

  if (ir.layout === "key-stat") {
    renderKeyStat(slide, ir, theme, fonts);
    return;
  }

  if (ir.type === "cover" || ir.type === "closing") {
    renderCoverOrClosing(slide, ir, theme, fonts);
    return;
  }

  if (ir.type === "quote") {
    renderQuote(slide, ir, theme, fonts);
    return;
  }

  if (ir.type === "code") {
    renderCode(slide, ir, theme, fonts);
    return;
  }

  if (ir.type === "diagram") {
    renderDiagram(slide, ir, theme, fonts);
    return;
  }

  if (ir.type === "data") {
    renderData(slide, ir, theme, fonts, pptx);
    return;
  }

  if (ir.layout === "two-columns" || ir.layout === "split-screen") {
    renderColumns(slide, ir, theme, fonts, 2);
    return;
  }

  if (ir.layout === "three-columns") {
    renderColumns(slide, ir, theme, fonts, 3);
    return;
  }

  renderBulletList(slide, ir, theme, fonts);
}

function validate(ir: DeckIR): void {
  if (!ir.meta.output_formats.includes("pptx-editable")) {
    console.warn("⚠ meta.output_formats does not include 'pptx-editable' — rendering anyway");
  }
  if (ir.meta.style_compatibility["pptx-editable"] === "unsupported") {
    const styleLabel = typeof ir.meta.style === "string" ? ir.meta.style : "custom";
    console.error(`Style "${styleLabel}" is unsupported for pptx-editable output. Aborting.`);
    process.exit(1);
  }
  if (ir.meta.style_compatibility["pptx-editable"] === "degraded") {
    console.warn("⚠ Style is rated 'degraded' for pptx-editable — signature look is approximated");
  }
}

async function main() {
  const { dir, output } = parseArgs();
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
  validate(ir);

  const theme = loadTheme(ir.meta.style);
  const fonts = resolveFonts(theme, ir.meta.lang);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "baoyu-slide-deck";
  pptx.subject = `Editable: ${ir.meta.topic}`;
  pptx.title = ir.meta.topic;

  for (const slide of ir.slides) {
    renderSlide(pptx, slide, theme, fonts, dir);
  }

  const outputPath = output || join(dir, `${ir.meta.topic_slug}-editable.pptx`);
  backupIfExists(outputPath);
  await pptx.writeFile({ fileName: outputPath });

  console.log(`Wrote: ${outputPath}`);
  console.log(`Slides: ${ir.slides.length}`);
  console.log(`Theme: ${typeof ir.meta.style === "string" ? ir.meta.style : "custom (default theme)"}`);
  console.log(`Fonts: ${fonts.heading} / ${fonts.body} / ${fonts.mono}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
