import { existsSync, readFileSync, renameSync, statSync } from "fs";
import { extname, join } from "path";

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
    console.error("Usage: bun render-html.ts <slide-deck-dir> [--output filename.html]");
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

function loadCss(name: string): string {
  const path = join(findSkillRoot(), "references", "html-styles", name);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function loadTokenCss(style: string | CustomDimensions): string {
  if (typeof style !== "string") {
    return loadCss("tokens/_default.css");
  }
  const path = join(findSkillRoot(), "references", "html-styles", "tokens", `${style}.css`);
  if (existsSync(path)) return readFileSync(path, "utf-8");
  return loadCss("tokens/_default.css");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}

function inlineImage(deckDir: string, filename: string): string | null {
  const path = join(deckDir, filename);
  if (!existsSync(path)) return null;
  const data = readFileSync(path);
  const ext = extname(filename).toLowerCase().slice(1);
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${data.toString("base64")}`;
}

function renderBackground(slide: Slide, deckDir: string): string {
  if (!slide.background_image) return "";
  const uri = inlineImage(deckDir, slide.background_image);
  if (!uri) return "";
  return `<div class="slide-bg" style="background-image: url('${uri}')"></div>`;
}

function renderCover(slide: Slide): string {
  const parts: string[] = [];
  parts.push(`<h1 class="slide-title">${escapeHtml(slide.title)}</h1>`);
  if (slide.subtitle) parts.push(`<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>`);
  return `<div class="slide-content">${parts.join("\n")}</div>`;
}

function renderContent(slide: Slide): string {
  const parts: string[] = [];
  parts.push(`<h2 class="slide-title">${escapeHtml(slide.title)}</h2>`);
  if (slide.subtitle) parts.push(`<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>`);
  if (slide.bullets && slide.bullets.length > 0) {
    const items = slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("\n");
    parts.push(`<ul class="slide-bullets">${items}</ul>`);
  }
  return `<div class="slide-content">${parts.join("\n")}</div>`;
}

function renderQuote(slide: Slide): string {
  if (!slide.quote) return renderContent(slide);
  const by = slide.quote.by ? `<span class="slide-quote-by">${escapeHtml(slide.quote.by)}</span>` : "";
  return `<div class="slide-content"><blockquote class="slide-quote">${escapeHtml(slide.quote.text)}${by}</blockquote></div>`;
}

function renderBarChart(data: SlideData): string {
  const rows = data.rows;
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const xKey = data.x_key || keys[0]!;
  const yKey = data.y_key || keys.find((k) => k !== xKey && typeof rows[0]![k] === "number") || keys[1]!;
  const values = rows.map((r) => Number(r[yKey]) || 0);
  const max = Math.max(...values, 1);
  const w = 800;
  const h = 360;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 60;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const barW = innerW / rows.length * 0.7;
  const gap = innerW / rows.length;
  const bars = rows.map((r, i) => {
    const v = Number(r[yKey]) || 0;
    const bh = (v / max) * innerH;
    const x = padL + i * gap + (gap - barW) / 2;
    const y = padT + innerH - bh;
    const label = escapeHtml(String(r[xKey]));
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="var(--accent-primary)" rx="2"/><text x="${(x + barW / 2).toFixed(1)}" y="${(padT + innerH + 20).toFixed(1)}" text-anchor="middle" fill="var(--text-secondary)" font-size="12">${label}</text><text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" fill="var(--text-heading)" font-size="13" font-weight="600">${v}</text></g>`;
  }).join("");
  const axis = `<line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="var(--border-color)" stroke-width="1"/>`;
  return `<div class="slide-data"><svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-label="Bar chart">${axis}${bars}</svg></div>`;
}

function renderTable(data: SlideData): string {
  const rows = data.rows;
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const head = keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("");
  const body = rows.map((r) => {
    const cells = keys.map((k) => `<td>${escapeHtml(String(r[k] ?? ""))}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<div class="slide-data"><table class="slide-data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderData(slide: Slide): string {
  const parts: string[] = [];
  parts.push(`<h2 class="slide-title">${escapeHtml(slide.title)}</h2>`);
  if (slide.subtitle) parts.push(`<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>`);
  if (slide.data) {
    if (slide.data.kind === "bar" || slide.data.kind === "line") {
      parts.push(renderBarChart(slide.data));
    } else {
      parts.push(renderTable(slide.data));
    }
  }
  return `<div class="slide-content">${parts.join("\n")}</div>`;
}

function renderDiagram(slide: Slide): string {
  const parts: string[] = [];
  parts.push(`<h2 class="slide-title">${escapeHtml(slide.title)}</h2>`);
  if (slide.subtitle) parts.push(`<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>`);
  if (slide.diagram_spec) {
    parts.push(`<pre class="slide-diagram">${escapeHtml(slide.diagram_spec)}</pre>`);
  }
  return `<div class="slide-content">${parts.join("\n")}</div>`;
}

function renderCode(slide: Slide): string {
  const parts: string[] = [];
  parts.push(`<h2 class="slide-title">${escapeHtml(slide.title)}</h2>`);
  if (slide.code) {
    const cls = slide.code.lang ? ` data-lang="${escapeAttr(slide.code.lang)}"` : "";
    parts.push(`<pre class="slide-code"${cls}><code>${escapeHtml(slide.code.source)}</code></pre>`);
  }
  return `<div class="slide-content">${parts.join("\n")}</div>`;
}

function renderImage(slide: Slide, deckDir: string): string {
  if (!slide.background_image) return renderContent(slide);
  const uri = inlineImage(deckDir, slide.background_image);
  if (!uri) return renderContent(slide);
  const alt = escapeAttr(slide.title || slide.image_prompt || "slide image");
  return `<div class="slide-image-wrap"><img src="${uri}" alt="${alt}"/></div>`;
}

function renderImageOverride(slide: Slide, deckDir: string): string | null {
  const candidate = slide.background_image || slide.filename;
  const uri = inlineImage(deckDir, candidate);
  if (!uri) return null;
  const alt = escapeAttr(slide.title || "slide");
  return `<div class="slide-image-wrap"><img src="${uri}" alt="${alt}"/></div>`;
}

function renderSlide(slide: Slide, idx: number, deckDir: string): string {
  if (slide.render_override === "image") {
    const overrideHtml = renderImageOverride(slide, deckDir);
    if (overrideHtml) {
      return `<section class="slide" data-index="${idx}" data-type="image" data-n="${slide.n}">${overrideHtml}</section>`;
    }
  }

  let body: string;
  switch (slide.type) {
    case "cover":
      body = renderCover(slide);
      break;
    case "closing":
      body = renderCover(slide);
      break;
    case "quote":
      body = renderQuote(slide);
      break;
    case "data":
      body = renderData(slide);
      break;
    case "diagram":
      body = renderDiagram(slide);
      break;
    case "code":
      body = renderCode(slide);
      break;
    case "image":
      body = renderImage(slide, deckDir);
      break;
    default:
      body = renderContent(slide);
  }

  const bg = renderBackground(slide, deckDir);
  const layoutAttr = slide.layout ? ` data-layout="${escapeAttr(slide.layout)}"` : "";
  return `<section class="slide" data-index="${idx}" data-type="${escapeAttr(slide.type)}" data-n="${slide.n}"${layoutAttr}>${bg}${body}</section>`;
}

function renderToc(slides: Slide[]): string {
  const items = slides.map((s, i) => {
    const num = String(s.n).padStart(2, "0");
    return `<li><button data-go="${i}"><span class="deck-toc-num">${num}</span>${escapeHtml(s.title)}</button></li>`;
  }).join("");
  return `<aside class="deck-toc" id="deck-toc"><h2>Contents</h2><ol>${items}</ol></aside>`;
}

function buildScript(): string {
  return `<script>
(function(){
  const slides = Array.from(document.querySelectorAll('.slide'));
  const toc = document.getElementById('deck-toc');
  const tocBtns = Array.from(toc.querySelectorAll('button[data-go]'));
  const counter = document.getElementById('deck-counter');
  let idx = 0;

  function show(i) {
    if (i < 0 || i >= slides.length) return;
    slides[idx].classList.remove('active');
    tocBtns[idx].classList.remove('current');
    idx = i;
    slides[idx].classList.add('active');
    tocBtns[idx].classList.add('current');
    counter.textContent = (idx + 1) + ' / ' + slides.length;
    if (window.location.hash !== '#' + (idx + 1)) {
      history.replaceState(null, '', '#' + (idx + 1));
    }
  }

  function next() { show(Math.min(idx + 1, slides.length - 1)); }
  function prev() { show(Math.max(idx - 1, 0)); }

  document.addEventListener('keydown', function(e) {
    if (e.target.matches('input, textarea')) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault(); next(); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); prev(); break;
      case 'Home':
        e.preventDefault(); show(0); break;
      case 'End':
        e.preventDefault(); show(slides.length - 1); break;
      case 'Escape':
        toc.classList.remove('open'); break;
      case 't':
      case 'T':
        toc.classList.toggle('open'); break;
    }
  });

  tocBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      show(parseInt(btn.dataset.go, 10));
      toc.classList.remove('open');
    });
  });

  document.getElementById('btn-prev').addEventListener('click', prev);
  document.getElementById('btn-next').addEventListener('click', next);
  document.getElementById('btn-toc').addEventListener('click', function() {
    toc.classList.toggle('open');
  });

  const hashMatch = window.location.hash.match(/^#(\\d+)$/);
  const start = hashMatch ? Math.min(Math.max(parseInt(hashMatch[1], 10) - 1, 0), slides.length - 1) : 0;
  show(start);

  window.addEventListener('hashchange', function() {
    const m = window.location.hash.match(/^#(\\d+)$/);
    if (m) show(Math.min(Math.max(parseInt(m[1], 10) - 1, 0), slides.length - 1));
  });

  let touchStartX = 0;
  document.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; });
  document.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
  });
})();
</script>`;
}

function buildHtml(ir: DeckIR, deckDir: string): string {
  const baseCss = loadCss("base.css");
  const tokenCss = loadTokenCss(ir.meta.style);
  const sections = ir.slides.map((s, i) => renderSlide(s, i, deckDir)).join("\n");
  const toc = renderToc(ir.slides);
  const styleLabel = typeof ir.meta.style === "string"
    ? ir.meta.style
    : `custom: ${ir.meta.style.texture}+${ir.meta.style.mood}+${ir.meta.style.typography}+${ir.meta.style.density}`;
  const title = escapeHtml(ir.meta.topic);
  const lang = escapeAttr(ir.meta.lang);
  const description = `Slide deck: ${ir.meta.topic} — ${ir.slides.length} slides, ${styleLabel} style`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeAttr(description)}">
<meta name="generator" content="baoyu-slide-deck">
<title>${title}</title>
<style>
${tokenCss}
${baseCss}
</style>
</head>
<body>
<main>
${sections}
</main>
${toc}
<div class="deck-chrome">
<button id="btn-toc" title="Contents (T)" aria-label="Toggle contents">☰</button>
<button id="btn-prev" title="Previous (←)" aria-label="Previous slide">‹</button>
<span class="deck-chrome-counter" id="deck-counter">1 / ${ir.slides.length}</span>
<button id="btn-next" title="Next (→ / Space)" aria-label="Next slide">›</button>
</div>
${buildScript()}
</body>
</html>`;
}

function validate(ir: DeckIR): void {
  if (!ir.meta.output_formats.includes("html")) {
    console.warn("⚠ meta.output_formats does not include 'html' — rendering anyway");
  }
  if (ir.meta.style_compatibility.html === "unsupported") {
    const styleLabel = typeof ir.meta.style === "string" ? ir.meta.style : "custom";
    console.error(`Style "${styleLabel}" is unsupported for html output. Aborting.`);
    process.exit(1);
  }
  if (ir.meta.style_compatibility.html === "degraded") {
    console.warn("⚠ Style is rated 'degraded' for html — signature look is approximated");
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

  const html = buildHtml(ir, dir);
  const outputPath = output || join(dir, `${ir.meta.topic_slug}.html`);
  backupIfExists(outputPath);
  await Bun.write(outputPath, html);

  const bytes = Buffer.byteLength(html, "utf-8");
  const kb = (bytes / 1024).toFixed(1);
  console.log(`Wrote: ${outputPath}`);
  console.log(`Slides: ${ir.slides.length}`);
  console.log(`Size: ${kb} KB`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
