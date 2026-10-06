/**
 * ui.js — small shared helpers and reusable rendering functions:
 * el(), icons, dates, storage, SEO meta, Loading/Empty/Error states,
 * Tag and filter bar. No framework; every function returns plain DOM nodes.
 */
import { SITE_CONFIG as C } from "./config.js";

/* ------------------------------------------------------------------- DOM */

/** Build a DOM node safely. Strings become text nodes, never HTML. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);

export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.flat().filter(Boolean));
  refreshIcons();
}

/* ----------------------------------------------------------------- icons */

const ICON_FALLBACK = {
  play: "▶", pause: "❚❚", x: "×", menu: "☰", moon: "☾", sun: "☀",
  github: "GH", "volume-2": "VOL", "arrow-right": "→", "arrow-left": "←",
};

/** Lucide icon placeholder. If Lucide fails to load, a text fallback stays visible. */
export function icon(name, className = "") {
  return el("i", { "data-lucide": name, class: className, "aria-hidden": "true" }, ICON_FALLBACK[name] ?? "");
}

let iconFrame = 0;
export function refreshIcons() {
  if (iconFrame || !window.lucide) return;
  iconFrame = requestAnimationFrame(() => {
    iconFrame = 0;
    window.lucide?.createIcons();
  });
}

/** Two icons in one button; toggle with setIconState() instead of re-creating icons. */
export function iconPair(first, second) {
  return el("span", { class: "icon-pair" },
    el("span", { "data-state": "a" }, icon(first)),
    el("span", { "data-state": "b", hidden: true }, icon(second)));
}

export function setIconState(root, showSecond) {
  const a = root.querySelector('[data-state="a"]');
  const b = root.querySelector('[data-state="b"]');
  if (a) a.hidden = showSecond;
  if (b) b.hidden = !showSecond;
}

/* ----------------------------------------------------------------- dates */

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function dateParts(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return m ? { y: m[1], m: Number(m[2]), d: m[3] } : null;
}

/** style: "dot" 2026.10.05 | "short" 05 OCT 2026 | "long" 05 OCTOBER 2026 */
export function formatDate(value, style = "dot") {
  const p = dateParts(value);
  if (!p || p.m < 1 || p.m > 12) return "";
  if (style === "dot") return `${p.y}.${String(p.m).padStart(2, "0")}.${p.d}`;
  const month = MONTHS[p.m - 1];
  return `${p.d} ${style === "short" ? month.slice(0, 3) : month} ${p.y}`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "32:15" or "1:02:03" -> seconds (0 when unknown). */
export function parseDuration(text) {
  const parts = String(text ?? "").split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export const pad = (n, size = 2) => String(n).padStart(size, "0");

/* --------------------------------------------------------------- storage */

/** localStorage that never throws; the site works fine without it. */
export const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* unavailable */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* unavailable */ }
  },
};

/* ------------------------------------------------------------------- SEO */

function setMetaTag(attr, name, content) {
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = el("meta", { [attr]: name });
    document.head.append(tag);
  }
  tag.setAttribute("content", content);
}

export function canonicalUrl() {
  const file = location.pathname.split("/").pop() || "index.html";
  if (C.siteUrl) {
    const base = C.siteUrl.endsWith("/") ? C.siteUrl : `${C.siteUrl}/`;
    return new URL(file + location.search, base).href;
  }
  return location.origin + location.pathname + location.search;
}

export function setMeta({ title, description, type = "website", image } = {}) {
  const fullTitle = title ? `${title} — ${C.siteName}` : `${C.siteName} — ${C.siteDescription}`;
  const desc = description || C.siteDescription;
  const url = canonicalUrl();
  document.title = fullTitle;
  setMetaTag("name", "description", desc);
  setMetaTag("property", "og:title", fullTitle);
  setMetaTag("property", "og:description", desc);
  setMetaTag("property", "og:type", type);
  setMetaTag("property", "og:url", url);
  setMetaTag("property", "og:site_name", C.siteName);
  if (image) setMetaTag("property", "og:image", image);
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = el("link", { rel: "canonical" });
    document.head.append(link);
  }
  link.setAttribute("href", url);
}

/* --------------------------------------------------------- state components */

export function loadingState(message = "Loading...") {
  return el("p", { class: "state", role: "status" }, message);
}

export function emptyState(message, action) {
  return el("div", { class: "state" }, el("p", {}, message), action);
}

export function errorState(message, onRetry) {
  return el("div", { class: "state state-error", role: "alert" },
    el("p", {}, message),
    onRetry && el("button", { type: "button", class: "btn btn-sm mt-4", onclick: onRetry }, "Try again"));
}

/** Map a thrown error to the user-facing message. */
export function contentErrorMessage(error, notFoundMessage = "Content unavailable.") {
  if (error?.kind === "not-found") return notFoundMessage;
  return "Unable to load content from GitHub.";
}

/* ----------------------------------------------------------- tag + filters */

export function tagList(tags = []) {
  if (!tags.length) return null;
  return el("ul", { class: "flex flex-wrap gap-2", "aria-label": "Tags" },
    tags.map((tag) => el("li", {}, el("span", { class: "tag tag-static" }, tag))));
}

export const normalize = (value) => String(value ?? "").trim().toLowerCase();

/** Update ?q= & ?tag= without adding history entries. */
export function syncUrl(params) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, "", url);
}

/**
 * Search box + tag buttons. Calls onChange({ q, tag }) on every change.
 * Returns { element, setCount, reset }.
 */
export function createFilters({ tags, initial = {}, label, placeholder, onChange, onSearchStart }) {
  const state = { q: initial.q ?? "", tag: initial.tag ?? "" };
  let timer = 0;

  const input = el("input", {
    type: "search", class: "field", id: "search-input", name: "q", value: state.q,
    placeholder, autocomplete: "off", "aria-label": label,
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = input.value.trim();
      if (state.q) onSearchStart?.();
      onChange({ ...state });
    }, 150);
  });

  const tagGroup = el("div", { class: "flex flex-wrap gap-2", role: "group", "aria-label": "Filter by tag" });
  const count = el("p", { class: "meta", role: "status", "aria-live": "polite" });

  function tagButton(text, value) {
    const active = normalize(state.tag) === normalize(value);
    return el("button", {
      type: "button", class: "tag", "aria-pressed": String(active),
      onclick: () => { state.tag = value; renderTags(); onChange({ ...state }); },
    }, text);
  }
  function renderTags() {
    tagGroup.replaceChildren(tagButton("All", ""), ...tags.map((tag) => tagButton(tag, tag)));
  }
  renderTags();

  const element = el("div", { class: "grid gap-4 mb-8" }, input, tags.length ? tagGroup : null, count);
  return {
    element,
    setCount: (text) => { count.textContent = text; },
    reset() { state.q = ""; state.tag = ""; input.value = ""; renderTags(); onChange({ ...state }); },
  };
}
