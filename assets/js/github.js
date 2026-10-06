/**
 * github.js — all URL building and all network access for content.
 *
 * - Text and JSON (Markdown, manifests)  -> GitHub Raw
 * - Binary assets (audio, images)        -> jsDelivr CDN
 *
 * While owner/repository are still the USERNAME / REPOSITORY placeholders
 * (source: "auto"), everything resolves to files next to the site instead, so
 * the project runs immediately with its sample content.
 */
import { SITE_CONFIG as C } from "./config.js";

const SITE_ROOT = new URL("../../", import.meta.url);
const PLACEHOLDERS = ["USERNAME", "REPOSITORY"];
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

/* ------------------------------------------------------------------ URLs */

export function isRemote() {
  if (C.source === "github") return true;
  if (C.source === "local") return false;
  return !PLACEHOLDERS.includes(C.owner) && !PLACEHOLDERS.includes(C.repository);
}

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

function repoPath(path) {
  return String(path ?? "")
    .trim()
    .replace(/^\.?\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

/** Text/JSON: https://raw.githubusercontent.com/OWNER/REPO/BRANCH/path */
export function buildRawUrl(path) {
  if (isAbsoluteUrl(path)) return path;
  const p = repoPath(path);
  return isRemote()
    ? `https://raw.githubusercontent.com/${C.owner}/${C.repository}/${C.branch}/${p}`
    : new URL(p, SITE_ROOT).href;
}

/** Binary assets: https://cdn.jsdelivr.net/gh/OWNER/REPO@BRANCH/path */
export function buildCdnUrl(path) {
  if (isAbsoluteUrl(path)) return path;
  const p = repoPath(path);
  return isRemote()
    ? `https://cdn.jsdelivr.net/gh/${C.owner}/${C.repository}@${C.branch}/${p}`
    : new URL(p, SITE_ROOT).href;
}

/** audio/episode-001.mp3 -> jsDelivr URL. An absolute https:// URL is returned unchanged. */
export function buildAudioUrl(path) {
  return buildCdnUrl(path);
}

/** Covers and Markdown images. */
export const buildAssetUrl = buildCdnUrl;

export function githubUrl() {
  return C.github || `https://github.com/${C.owner}/${C.repository}`;
}

/* --------------------------------------------------------------- fetching */

export class ContentError extends Error {
  /** @param {"not-found"|"http"|"network"|"parse"} kind */
  constructor(kind, status = 0, cause) {
    super(status ? `${kind} (${status})` : kind);
    this.kind = kind;
    this.status = status;
    this.cause = cause;
  }
}

const memory = new Map();

/** Run `loader` once per key; failed loads are forgotten so a retry works. */
export function memoize(key, loader) {
  if (!memory.has(key)) {
    memory.set(
      key,
      Promise.resolve()
        .then(loader)
        .catch((error) => {
          memory.delete(key);
          throw error;
        })
    );
  }
  return memory.get(key);
}

async function request(url, parse) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new ContentError(response.status === 404 ? "not-found" : "http", response.status);
    return await response[parse]();
  } catch (error) {
    if (error instanceof ContentError) throw error;
    if (error instanceof SyntaxError) throw new ContentError("parse", 0, error);
    throw new ContentError("network", 0, error);
  } finally {
    clearTimeout(timer);
  }
}

function readSession(key) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(key));
    if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
  } catch { /* storage unavailable or corrupt: ignore */ }
  return undefined;
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch { /* quota or privacy mode: ignore */ }
}

/** JSON is cached in memory and, for remote content, in sessionStorage for 5 minutes. */
export function fetchJSON(path) {
  const url = buildRawUrl(path);
  return memoize(`json:${url}`, async () => {
    const storageKey = `site-cache:${url}`;
    if (isRemote()) {
      const cached = readSession(storageKey);
      if (cached !== undefined) return cached;
    }
    const data = await request(url, "json");
    if (isRemote()) writeSession(storageKey, data);
    return data;
  });
}

/** Markdown and other text: cached in memory for the lifetime of the page. */
export function fetchText(path) {
  const url = buildRawUrl(path);
  return memoize(`text:${url}`, () => request(url, "text"));
}
