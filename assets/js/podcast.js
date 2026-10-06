/**
 * podcast.js — episodes metadata, episode cards, podcast index and the
 * episode detail page (player + show notes).
 */
import { SITE_CONFIG as C } from "./config.js";
import { fetchJSON, fetchText, memoize, buildAssetUrl, ContentError } from "./github.js";
import { parseFrontmatter, renderMarkdown } from "./markdown.js";
import {
  $, el, mount, formatDate, normalize, tagList, syncUrl, setMeta,
  loadingState, emptyState, errorState, contentErrorMessage, createFilters,
} from "./ui.js";
import {
  createPlayButton, createAudioPlayer, episodeLabel,
  registerEpisodes, loadEpisode, restoreLastPlayed, savedPosition, syncPlayButtons,
} from "./player.js";

/* ------------------------------------------------------------------ data */

function normalizeEpisode(raw) {
  if (!raw || !raw.id || !raw.title) {
    console.warn("Skipping invalid entry in episodes.json:", raw);
    return null;
  }
  return {
    id: String(raw.id),
    episode: Number(raw.episode) || 0,
    title: String(raw.title),
    description: String(raw.description ?? ""),
    date: String(raw.date ?? ""),
    duration: String(raw.duration ?? ""),
    audio: raw.audio ? String(raw.audio) : "",
    cover: raw.cover ? String(raw.cover) : "",
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    showNotes: raw.showNotes ? String(raw.showNotes) : "",
    // optional, kept for a future RSS feed
    author: raw.author ? String(raw.author) : "",
    explicit: raw.explicit === true,
    season: raw.season ?? null,
    episodeType: raw.episodeType ?? "full",
    published: raw.published !== false,
  };
}

/** Published episodes, newest first. Also registers them with the player. */
export function getEpisodes() {
  return memoize("episodes", async () => {
    const manifest = await fetchJSON(C.paths.episodes);
    if (!Array.isArray(manifest)) throw new ContentError("parse");
    const episodes = manifest.map(normalizeEpisode).filter((e) => e && e.published)
      .sort((a, b) => b.date.localeCompare(a.date) || b.episode - a.episode);
    registerEpisodes(episodes);
    return episodes;
  });
}

const episodeUrl = (ep) => `episode.html?id=${encodeURIComponent(ep.id)}`;

/** Used by every page except the episode page to bring back the last played episode. */
export async function restorePlayback() {
  try { restoreLastPlayed(await getEpisodes()); } catch { /* not critical */ }
}

/* ------------------------------------------------------------ components */

export function episodeCard(ep) {
  return el("li", { class: "row", dataset: { episodeRow: "" } },
    el("article", { class: "row-inner grid gap-4 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:gap-8 md:items-start" },
      el("p", { class: "index" }, episodeLabel(ep)),
      el("div", { class: "grid gap-3" },
        el("h3", { class: "title-lg" }, el("a", { class: "card-link", href: episodeUrl(ep) }, ep.title)),
        ep.description && el("p", { class: "excerpt" }, ep.description),
        el("p", { class: "meta meta-row" },
          el("time", { datetime: ep.date }, formatDate(ep.date, "dot")),
          ep.duration && el("span", {}, ep.duration))),
      el("div", {}, ep.audio ? createPlayButton(ep) : el("span", { class: "meta" }, "Audio unavailable."))));
}

/* ------------------------------------------------------------------ home */

export async function initHomeEpisodes() {
  const root = $("#latest-episodes");
  const load = async () => {
    mount(root, loadingState());
    try {
      const episodes = (await getEpisodes()).slice(0, C.homeCount);
      if (!episodes.length) return mount(root, emptyState("No episodes yet."));
      mount(root, el("ol", { class: "list" }, episodes.map(episodeCard)));
      syncPlayButtons();
    } catch (error) {
      mount(root, errorState(contentErrorMessage(error), load));
    }
  };
  await load();
}

/* --------------------------------------------------------- podcast index */

export async function initPodcastIndex() {
  const root = $("#podcast-root");
  setMeta({ title: "Podcast", description: "Stories, conversations, ideas and field recordings." });

  const load = async () => {
    mount(root, loadingState());
    let episodes;
    try {
      episodes = await getEpisodes();
    } catch (error) {
      return mount(root, errorState(contentErrorMessage(error), load));
    }
    if (!episodes.length) return mount(root, emptyState("No episodes yet."));

    const params = new URLSearchParams(location.search);
    const tags = [...new Set(episodes.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b));
    const view = { q: params.get("q") ?? "", tag: params.get("tag") ?? "", visible: C.pageSize };
    const list = el("ol", { class: "list" });
    const more = el("div", { class: "mt-8" });
    const filters = createFilters({
      tags, initial: view, label: "Search episodes", placeholder: "Search title and description",
      onChange: ({ q, tag }) => { Object.assign(view, { q, tag, visible: C.pageSize }); syncUrl({ q, tag }); render(); },
    });

    const matches = (ep) => {
      if (view.tag && !ep.tags.some((t) => normalize(t) === normalize(view.tag))) return false;
      const words = normalize(view.q).split(/\s+/).filter(Boolean);
      const haystack = normalize([ep.title, ep.description, ep.tags.join(" ")].join("\n"));
      return words.every((word) => haystack.includes(word));
    };

    function render() {
      const found = episodes.filter(matches);
      const shown = found.slice(0, view.visible);
      filters.setCount(`${found.length} ${found.length === 1 ? "EPISODE" : "EPISODES"}`);
      if (!found.length) {
        list.replaceChildren();
        more.replaceChildren(emptyState("No episodes match your search.",
          el("button", { type: "button", class: "btn btn-sm mt-4", onclick: () => filters.reset() }, "Clear filters")));
        return;
      }
      mount(list, shown.map(episodeCard));
      const remaining = found.length - shown.length;
      more.replaceChildren(remaining > 0
        ? el("button", { type: "button", class: "btn", onclick: () => { view.visible += C.pageSize; render(); } },
            `Load more (${remaining} remaining)`)
        : "");
      syncPlayButtons();
    }

    mount(root, filters.element, list, more);
    render();
  };
  await load();
}

/* -------------------------------------------------------- episode detail */

export async function initEpisode() {
  const root = $("#episode-root");
  const id = new URLSearchParams(location.search).get("id");

  const load = async () => {
    mount(root, loadingState());
    try {
      const episodes = await getEpisodes();
      const ep = id && episodes.find((e) => e.id === id);
      if (!ep) {
        setMeta({ title: "Episode not found" });
        return mount(root, emptyState("Episode not found.", el("a", { class: "btn btn-sm mt-4", href: "podcast.html" }, "All episodes")));
      }
      const coverUrl = ep.cover ? buildAssetUrl(ep.cover) : "";
      setMeta({ title: `${episodeLabel(ep)} ${ep.title}`, description: ep.description, type: "music.song", image: coverUrl });

      const cover = coverUrl && el("img", {
        class: "cover", src: coverUrl, width: 480, height: 480, loading: "lazy", decoding: "async",
        alt: `Cover art for ${episodeLabel(ep)}: ${ep.title}`,
        onerror: (e) => e.target.remove(),
      });

      const notes = el("div", { class: "prose" });
      mount(root,
        el("article", {},
          el("p", { class: "meta mb-8" }, el("a", { class: "link", href: "podcast.html" }, "PODCAST")),
          el("div", { class: cover ? "grid gap-10 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start" : "" },
            el("header", { class: "grid gap-6" },
              el("p", { class: "index" }, episodeLabel(ep)),
              el("h1", { class: "title-xl" }, ep.title),
              ep.description && el("p", { class: "lede" }, ep.description),
              el("p", { class: "meta meta-row" },
                el("time", { datetime: ep.date }, formatDate(ep.date, "long")),
                ep.duration && el("span", {}, ep.duration),
                ep.season && el("span", {}, `SEASON ${ep.season}`),
                ep.explicit && el("span", {}, "EXPLICIT")),
              tagList(ep.tags)),
            cover),
          el("div", { class: "my-12" }, createAudioPlayer(ep)),
          ep.showNotes && el("section", { "aria-labelledby": "notes-title" },
            el("h2", { id: "notes-title", class: "h-section mb-6" }, "Show notes"),
            notes)));

      loadEpisode(ep, savedPosition(ep.id));
      if (ep.showNotes) {
        try {
          const { body } = parseFrontmatter(await fetchText(ep.showNotes));
          notes.replaceChildren(await renderMarkdown(body, { baseFile: ep.showNotes, title: ep.title }));
        } catch {
          notes.replaceChildren(el("p", { class: "meta" }, "Show notes unavailable."));
        }
      }
    } catch (error) {
      if (!error?.kind) console.error(error);
      mount(root, errorState(contentErrorMessage(error, "Episode not found."), load));
    }
  };
  await load();
}
