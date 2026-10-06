/**
 * app.js — the single entry point loaded by every page.
 *
 *  1. Loads the shared header/footer partials (HTMX, with a fetch fallback).
 *  2. Wires up navigation, theme toggle and the mini player.
 *  3. Runs the page module named in <body data-page="...">.
 */
import { SITE_CONFIG as C } from "./config.js";
import { githubUrl } from "./github.js";
import { $, refreshIcons, setMeta, storage, errorState, mount } from "./ui.js";
import { initMiniPlayer } from "./player.js";

/* --------------------------------------------------------------- chrome */

function enhanceHeader(header) {
  if (header.dataset.ready) return;
  header.dataset.ready = "true";

  header.querySelectorAll("[data-site-name]").forEach((n) => { n.textContent = C.siteName; });

  const current = document.body.dataset.nav;
  header.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === current) link.setAttribute("aria-current", "page");
  });

  const menuButton = $("[data-menu-button]", header);
  const menu = $("#mobile-nav", header);
  const setMenu = (open) => {
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    $('[data-state="a"]', menuButton).hidden = open;
    $('[data-state="b"]', menuButton).hidden = !open;
  };
  menuButton.addEventListener("click", () => setMenu(menu.hidden));
  header.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuButton.focus(); }
  });

  const themeButton = $("[data-theme-toggle]", header);
  const syncTheme = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    themeButton.setAttribute("aria-pressed", String(dark));
  };
  themeButton.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storage.set("theme", next);
    syncTheme();
  });
  syncTheme();
  refreshIcons();
}

function enhanceFooter(footer) {
  if (footer.dataset.ready) return;
  footer.dataset.ready = "true";
  footer.querySelectorAll("[data-site-name]").forEach((n) => { n.textContent = C.siteName; });
  footer.querySelectorAll("[data-year]").forEach((n) => { n.textContent = new Date().getFullYear(); });
  footer.querySelectorAll("[data-github]").forEach((a) => { a.href = githubUrl(); });
  refreshIcons();
}

function enhanceChrome() {
  const header = $("header[data-chrome]");
  const footer = $("footer[data-chrome]");
  if (header) enhanceHeader(header);
  if (footer) enhanceFooter(footer);
}

/** HTMX normally swaps the partials in. If HTMX is unavailable, do the same by hand. */
async function loadPartialsWithoutHtmx() {
  await Promise.all([...document.querySelectorAll("[hx-get]")].map(async (placeholder) => {
    try {
      const response = await fetch(placeholder.getAttribute("hx-get"));
      if (!response.ok) throw new Error(String(response.status));
      const template = document.createElement("template");
      template.innerHTML = await response.text(); // our own static partial, same origin
      placeholder.replaceWith(template.content);
    } catch (error) {
      console.error("Could not load partial:", error);
    }
  }));
  enhanceChrome();
}

/* ----------------------------------------------------------------- pages */

const pages = {
  async home() {
    const [blog, podcast] = await Promise.all([import("./blog.js"), import("./podcast.js")]);
    setMeta({});
    await Promise.all([blog.initHomePosts(), podcast.initHomeEpisodes()]);
  },
  async blog() { await (await import("./blog.js")).initBlogIndex(); },
  async post() { await (await import("./blog.js")).initPost(); },
  async about() { await (await import("./blog.js")).initAbout(); },
  async podcast() { await (await import("./podcast.js")).initPodcastIndex(); },
  async episode() { await (await import("./podcast.js")).initEpisode(); },
};

async function start() {
  document.addEventListener("htmx:afterSettle", enhanceChrome);
  if (window.htmx) enhanceChrome();
  else loadPartialsWithoutHtmx();

  const page = document.body.dataset.page;
  // The episode page has its own full player, so it doesn't show the mini player.
  initMiniPlayer({ visible: page !== "episode" });

  try {
    await pages[page]?.();
  } catch (error) {
    console.error(error);
    const main = $("main");
    if (main) mount(main, errorState("Content unavailable."));
  }

  if (page !== "episode") {
    const { restorePlayback } = await import("./podcast.js");
    restorePlayback();
  }
}

start();
