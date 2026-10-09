/**
 * markdown.js — frontmatter parsing, reading time and safe Markdown rendering.
 *
 * `marked` (parser) and `DOMPurify` (sanitizer) are loaded from jsDelivr only
 * when a page actually renders Markdown. `mermaid` is loaded only when the
 * Markdown contains a ```mermaid code block. Output is ALWAYS sanitized before it
 * touches the DOM; raw Markdown/HTML is never assigned to innerHTML.
 */
import { buildAssetUrl } from "./github.js";

const MARKED_URL = "https://cdn.jsdelivr.net/npm/marked@12.0.2/+esm";
const PURIFY_URL = "https://cdn.jsdelivr.net/npm/dompurify@3.1.7/+esm";
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";

let libraries;
function loadLibraries() {
  libraries ??= Promise.all([import(MARKED_URL), import(PURIFY_URL)])
    .then(([m, p]) => ({
      marked: m.marked ?? m.default?.marked ?? m.default,
      purify: p.default ?? p,
    }))
    .catch((error) => {
      libraries = undefined; // allow retry
      throw error;
    });
  return libraries;
}

/* ------------------------------------------------------------ frontmatter */

function scalar(raw) {
  const v = raw.trim();
  if (/^"(.*)"$/s.test(v)) return v.slice(1, -1).replace(/\\"/g, '"');
  if (/^'(.*)'$/s.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** Supports the YAML subset used by this site: scalars, "- item" lists and [a, b] lists. */
function parseYamlLite(source) {
  const data = {};
  let listKey = null;
  for (const line of source.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(scalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else {
      listKey = null;
      data[key] = value.startsWith("[")
        ? value.replace(/^\[|\]$/g, "").split(",").map(scalar).filter((x) => x !== "")
        : scalar(value);
    }
  }
  return data;
}

export function parseFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: parseYamlLite(match[1]), body: text.slice(match[0].length) };
}

export function readingTime(markdown) {
  const words = String(markdown).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/* -------------------------------------------------------------- rendering */

/** Turn a path found in Markdown into a repository path, relative to the Markdown file. */
function resolveRepoPath(baseFile, src) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return null; // absolute / data: / anchor
  const root = "http://repo.invalid/";
  const resolved = new URL(src, new URL(baseFile, root));
  return decodeURIComponent(resolved.pathname.slice(1)) + resolved.search;
}

function postProcess(fragment, { baseFile, title }) {
  const first = fragment.firstElementChild;
  if (first?.tagName === "H1" && title && first.textContent.trim() === String(title).trim()) first.remove();

  fragment.querySelectorAll("h1").forEach((h1) => {
    const h2 = document.createElement("h2");
    h2.append(...h1.childNodes);
    h1.replaceWith(h2);
  });

  fragment.querySelectorAll("a[href]").forEach((a) => {
    try {
      const url = new URL(a.getAttribute("href"), location.href);
      if (url.origin !== location.origin) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    } catch { /* leave as is */ }
  });

  fragment.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const path = baseFile ? resolveRepoPath(baseFile, src) : null;
    if (path) img.setAttribute("src", buildAssetUrl(path));
    img.loading = "lazy";
    img.decoding = "async";
    if (!img.hasAttribute("alt")) img.alt = "";
  });

  fragment.querySelectorAll("table").forEach((table) => {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.tabIndex = 0;
    table.replaceWith(wrap);
    wrap.append(table);
  });

  fragment.querySelectorAll("pre").forEach((pre) => { pre.tabIndex = 0; });
  return fragment;
}

/* ---------------------------------------------------------------- mermaid */

let mermaidPromise;
function loadMermaid() {
  mermaidPromise ??= import(MERMAID_URL)
    .then((m) => m.default ?? m)
    .catch((error) => {
      mermaidPromise = undefined; // allow retry
      throw error;
    });
  return mermaidPromise;
}

/** Monochrome diagram theme built from the site's CSS variables (light/dark aware). */
function mermaidConfig() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const bg = v("--bg", "#fff");
  const fg = v("--fg", "#000");
  const soft = v("--soft", "#f0f0f0");
  return {
    startOnLoad: false,
    securityLevel: "strict", // mermaid sanitizes labels and disables click handlers
    theme: "base",
    htmlLabels: false, // plain SVG <text> labels: nothing HTML-in-SVG for the sanitizer to strip
    flowchart: { htmlLabels: false },
    fontFamily: v("--font-sans", "Arial, sans-serif"),
    themeVariables: {
      background: bg, primaryColor: bg, primaryTextColor: fg, primaryBorderColor: fg,
      secondaryColor: soft, tertiaryColor: soft, lineColor: fg, textColor: fg,
      mainBkg: bg, nodeBorder: fg, clusterBkg: soft, clusterBorder: fg,
      edgeLabelBackground: bg, noteBkgColor: soft, noteTextColor: fg, noteBorderColor: fg,
    },
  };
}

let diagramCounter = 0;

/** Render one diagram into `host`. The SVG is sanitized again before insertion. */
async function drawDiagram(host, mermaid, purify) {
  const source = host.dataset.mermaidSource;
  try {
    mermaid.initialize(mermaidConfig());
    const { svg } = await mermaid.render(`mermaid-${diagramCounter++}`, source);
    const clean = purify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
      // mermaid ships its (id-scoped) stylesheet inside the SVG, so <style> must survive here
      ADD_TAGS: ["style"],
      FORBID_TAGS: ["script"],
      FORBID_ATTR: ["onclick", "onload", "onerror"],
    });
    const template = document.createElement("template");
    template.innerHTML = clean; // sanitized above
    host.replaceChildren(template.content);
    host.classList.remove("is-error");
  } catch (error) {
    console.warn("Mermaid diagram could not be rendered:", error);
    host.classList.add("is-error");
    const note = document.createElement("p");
    note.className = "meta";
    note.textContent = "Diagram could not be rendered.";
    const pre = document.createElement("pre");
    pre.tabIndex = 0;
    pre.textContent = source;
    host.replaceChildren(note, pre);
  }
}

/** Re-draw diagrams when the visitor switches between light and dark theme. */
let themeObserver;
function watchTheme(mermaid, purify) {
  if (themeObserver) return;
  themeObserver = new MutationObserver(() => {
    document.querySelectorAll("[data-mermaid-source]").forEach((host) => drawDiagram(host, mermaid, purify));
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

/** Replace ```mermaid code blocks with diagram containers (no-op when there are none). */
async function renderDiagrams(fragment, purify) {
  const blocks = [...fragment.querySelectorAll("pre > code.language-mermaid")];
  if (!blocks.length) return;

  const hosts = blocks.map((code) => {
    const host = document.createElement("div");
    host.className = "mermaid-diagram";
    host.tabIndex = 0;
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Diagram");
    host.dataset.mermaidSource = code.textContent;
    host.textContent = "Loading diagram...";
    code.parentElement.replaceWith(host);
    return host;
  });

  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    // Library unavailable: show each diagram's source instead of failing the page.
    hosts.forEach((host) => {
      host.classList.add("is-error");
      const pre = document.createElement("pre");
      pre.textContent = host.dataset.mermaidSource;
      host.replaceChildren(pre);
    });
    return;
  }
  for (const host of hosts) await drawDiagram(host, mermaid, purify);
  watchTheme(mermaid, purify);
}

/**
 * @param {string} markdown  Markdown body (frontmatter already removed)
 * @param {{baseFile?: string, title?: string}} options
 * @returns {Promise<DocumentFragment>} sanitized DOM, ready to append
 */
export async function renderMarkdown(markdown, options = {}) {
  const { marked, purify } = await loadLibraries();
  const html = marked.parse(markdown, { gfm: true, async: false });
  const clean = purify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });
  const template = document.createElement("template");
  template.innerHTML = clean; // sanitized above
  const fragment = postProcess(template.content, options);
  await renderDiagrams(fragment, purify);
  return fragment;
}