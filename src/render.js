import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const DEFAULT_TITLE = "Local Plan";

export async function readPlan(rootDir, slug) {
  const safeSlug = slug && slug !== "latest" ? slug : await latestSlug(rootDir);
  if (!safeSlug) {
    return { slug: null, title: DEFAULT_TITLE, html: "<p>No plans found.</p>", sourcePath: "." };
  }
  const planDir = path.join(rootDir, safeSlug);
  const planPath = path.join(planDir, "plan.mdx");
  const mdx = await fs.readFile(planPath, "utf8");
  const title = findTitle(mdx) || `Plan ${safeSlug}`;
  return {
    slug: safeSlug,
    title,
    sourcePath: path.relative(rootDir, planPath) || "plan.mdx",
    html: renderMdx(mdx),
    updatedAt: (await fs.stat(planPath)).mtime.toISOString(),
  };
}

export async function listPlans(rootDir) {
  let entries = [];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plans = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const planPath = path.join(rootDir, entry.name, "plan.mdx");
    try {
      const [mdx, stat] = await Promise.all([fs.readFile(planPath, "utf8"), fs.stat(planPath)]);
      plans.push({
        slug: entry.name,
        title: findTitle(mdx) || entry.name,
        sourcePath: path.relative(rootDir, planPath) || path.join(entry.name, "plan.mdx"),
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Ignore folders that are not plan folders.
    }
  }
  return plans.sort((a, b) => b.slug.localeCompare(a.slug));
}

async function latestSlug(rootDir) {
  const plans = await listPlans(rootDir);
  return plans[0]?.slug || null;
}

function findTitle(mdx) {
  return mdx.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

export function renderMdx(mdx) {
  const blocks = splitBlocks(mdx);
  return blocks.map(renderBlock).join("\n");
}

function splitBlocks(mdx) {
  const lines = mdx.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let buffer = [];
  let component = null;

  const flush = () => {
    if (buffer.length) {
      blocks.push({ type: "markdown", text: buffer.join("\n").trim() });
      buffer = [];
    }
  };

  for (const line of lines) {
    const open = line.match(/^<(Diagram|Table|Checklist)\b/);
    if (component || open) {
      if (!component) {
        flush();
        component = { tag: open[1], lines: [] };
      }
      component.lines.push(line);
      if (/\/>\s*$/.test(line)) {
        blocks.push({ type: component.tag.toLowerCase(), source: component.lines.join("\n") });
        component = null;
      }
      continue;
    }
    if (!line.trim()) {
      flush();
    } else {
      buffer.push(line);
    }
  }
  if (component) blocks.push({ type: "unknown", source: component.lines.join("\n") });
  flush();
  return blocks.filter((block) => block.text || block.source);
}

function renderBlock(block) {
  try {
    if (block.type === "diagram") return renderDiagram(block.source);
    if (block.type === "table") return renderTable(block.source);
    if (block.type === "checklist") return renderChecklist(block.source);
    if (block.type === "unknown") return renderWarning("Unclosed block", block.source);
    return renderMarkdown(block.text);
  } catch (error) {
    return renderWarning(error.message, block.source || block.text || "");
  }
}

function renderDiagram(source) {
  const id = attr(source, "id") || "diagram";
  const caption = attr(source, "caption");
  const html = templateAttr(source, "html") || templateAttr(source, "data.html");
  const css = templateAttr(source, "css") || templateAttr(source, "data.css") || "";
  if (!html) return renderWarning(`Diagram ${id} has no html`, source);
  return `<figure class="plan-diagram" id="${escapeAttr(id)}">
    ${caption ? `<figcaption>${inline(caption)}</figcaption>` : ""}
    <style>${scopedCss(css)}</style>
    <div class="diagram-stage">${sanitizeHtml(html)}</div>
  </figure>`;
}

function renderTable(source) {
  const id = attr(source, "id") || "table";
  const columns = literalAttr(source, "columns");
  const rows = literalAttr(source, "rows");
  if (!Array.isArray(columns) || !Array.isArray(rows)) return renderWarning(`Table ${id} could not parse rows`, source);
  return `<div class="table-wrap" id="${escapeAttr(id)}"><table>
    <thead><tr>${columns.map((column) => `<th>${inline(String(column))}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((_, i) => `<td>${inline(String(row?.[i] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function renderChecklist(source) {
  const id = attr(source, "id") || "checklist";
  const items = literalAttr(source, "items");
  if (!Array.isArray(items)) return renderWarning(`Checklist ${id} could not parse items`, source);
  return `<ul class="checklist" id="${escapeAttr(id)}">${items.map((item) => {
    const label = typeof item === "string" ? item : item.label || item.note || item.id || "";
    return `<li><span aria-hidden="true">✓</span><p>${inline(String(label))}</p></li>`;
  }).join("")}</ul>`;
}

function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  if (/^#{1,6}\s/.test(lines[0])) {
    return lines.map((line) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return `<p>${inline(line)}</p>`;
      const level = Math.min(match[1].length, 4);
      return `<h${level}>${inline(match[2])}</h${level}>`;
    }).join("\n");
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
  }
  if (lines.every((line) => /^-\s+/.test(line))) {
    return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^-\s+/, ""))}</li>`).join("")}</ul>`;
  }
  return `<p>${inline(text.replace(/\n+/g, " "))}</p>`;
}

function attr(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}="([^"]*)"`, "m"))?.[1] || null;
}

function templateAttr(source, name) {
  const marker = `${name}={\``;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const from = start + marker.length;
  const end = source.indexOf("`}", from);
  return end === -1 ? null : source.slice(from, end);
}

function literalAttr(source, name) {
  const idx = source.indexOf(`${name}={`);
  if (idx === -1) return null;
  const start = idx + name.length + 2;
  let depth = 0;
  let quote = null;
  let out = "";
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];
    if (quote) {
      out += char;
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") depth += 1;
    if (char === "}" || char === "]" || char === ")") {
      if (depth === 0 && char === "}") break;
      depth -= 1;
    }
    if (char === "}" && depth < 0) break;
    out += char;
  }
  return parseLiteral(out.trim());
}

function parseLiteral(literal) {
  if (!literal) return null;
  try {
    return vm.runInNewContext(`(${literal})`, Object.freeze({}), { timeout: 50 });
  } catch {
    return null;
  }
}

function inline(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => `<a href="${escapeAttr(href)}">${label}</a>`);
  text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return text;
}

function sanitizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

function scopedCss(css) {
  return css.replace(/--wf-border/g, "--line")
    .replace(/--wf-line/g, "--line")
    .replace(/--wf-surface/g, "--panel")
    .replace(/--wf-card/g, "--panel")
    .replace(/--wf-paper/g, "--paper")
    .replace(/--wf-muted/g, "--soft")
    .replace(/--wf-warning-subtle/g, "--warn")
    .replace(/--wf-success-subtle/g, "--ok")
    .replace(/--wf-info-subtle/g, "--info")
    .replace(/--wf-ink/g, "--ink");
}

function renderWarning(message, source) {
  return `<aside class="render-warning"><strong>${inline(message)}</strong><details><summary>Source</summary><pre>${escapeHtml(source)}</pre></details></aside>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
