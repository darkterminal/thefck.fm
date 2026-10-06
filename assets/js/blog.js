/**
 * blog.js — posts manifest, post cards, blog index (search / tag filter /
 * load more), post detail page and the About page.
 */
import { SITE_CONFIG as C } from "./config.js";
import { fetchJSON, fetchText, memoize, ContentError } from "./github.js";
import { parseFrontmatter, renderMarkdown, readingTime } from "./markdown.js";
import {
  $, el, mount, formatDate, pad, normalize, tagList, syncUrl, setMeta,
  loadingState, emptyState, errorState, contentErrorMessage, createFilters,
} from "./ui.js";

/* ------------------------------------------------------------------ data */

function normalizePost(raw) {
  if (!raw || !raw.slug || !raw.title) {
    console.warn("Skipping invalid entry in posts.json:", raw);
    return null;
  }
  return {
    slug: String(raw.slug),
    title: String(raw.title),
    description: String(raw.description ?? ""),
    date: String(raw.date ?? ""),
    author: raw.author ? String(raw.author) : "",
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    file: raw.file || `content/posts/${raw.slug}.md`,
    readingTime: Number(raw.readingTime) || 0,
    published: raw.published !== false,
  };
}

/** Published posts, newest first. */
export function getPosts() {
  return memoize("posts", async () => {
    const manifest = await fetchJSON(C.paths.posts);
    if (!Array.isArray(manifest)) throw new ContentError("parse");
    return manifest.map(normalizePost).filter((p) => p && p.published)
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}

/** Parsed Markdown file of a post: { data, body }. */
export function getPostFile(post) {
  return memoize(`post-file:${post.slug}`, async () => parseFrontmatter(await fetchText(post.file)));
}

/** Fill in "N MIN READ" for posts whose manifest entry has no readingTime. */
async function hydrateReadingTimes(posts, root) {
  await Promise.all(posts.map(async (post) => {
    if (!post.readingTime) {
      try { post.readingTime = readingTime((await getPostFile(post)).body); } catch { return; }
    }
    root.querySelectorAll(`[data-readtime="${CSS.escape(post.slug)}"]`)
      .forEach((node) => { node.textContent = `${post.readingTime} MIN READ`; });
  }));
}

const postUrl = (post) => `post.html?slug=${encodeURIComponent(post.slug)}`;

/* ------------------------------------------------------------ components */

export function postCard(post, index) {
  return el("li", { class: "row" },
    el("article", { class: "row-inner grid gap-3 md:grid-cols-[4.5rem_minmax(0,1fr)_11rem] md:gap-8" },
      el("span", { class: "index", "aria-hidden": "true" }, pad(index + 1)),
      el("div", { class: "grid gap-3" },
        el("h3", { class: "title-lg" }, el("a", { class: "card-link", href: postUrl(post) }, post.title)),
        post.description && el("p", { class: "excerpt" }, post.description),
        tagList(post.tags)),
      el("p", { class: "meta md:text-right grid gap-1" },
        el("time", { datetime: post.date }, formatDate(post.date, "dot")),
        el("span", { dataset: { readtime: post.slug } }, post.readingTime ? `${post.readingTime} MIN READ` : ""))));
}

function postList(posts, startAt = 0) {
  return posts.map((post, i) => postCard(post, startAt + i));
}

/* ------------------------------------------------------------------ home */

export async function initHomePosts() {
  const root = $("#latest-posts");
  const load = async () => {
    mount(root, loadingState());
    try {
      const posts = (await getPosts()).slice(0, C.homeCount);
      if (!posts.length) return mount(root, emptyState("No posts yet."));
      mount(root, el("ol", { class: "list" }, postList(posts)));
      hydrateReadingTimes(posts, root);
    } catch (error) {
      mount(root, errorState(contentErrorMessage(error), load));
    }
  };
  await load();
}

/* ------------------------------------------------------------ blog index */

export async function initBlogIndex() {
  const root = $("#blog-root");
  setMeta({ title: "Blog", description: "Essays, notes and field reports." });

  const load = async () => {
    mount(root, loadingState());
    let posts;
    try {
      posts = await getPosts();
    } catch (error) {
      return mount(root, errorState(contentErrorMessage(error), load));
    }
    if (!posts.length) return mount(root, emptyState("No posts yet."));

    const params = new URLSearchParams(location.search);
    const tags = [...new Set(posts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));
    const view = { q: params.get("q") ?? "", tag: params.get("tag") ?? "", visible: C.pageSize, rendered: 0 };

    const list = el("ol", { class: "list" });
    const more = el("div", { class: "mt-8" });
    const filters = createFilters({
      tags, initial: view, label: "Search posts",
      placeholder: "Search title, description and content",
      onChange: ({ q, tag }) => { Object.assign(view, { q, tag, visible: C.pageSize }); syncUrl({ q, tag }); render(); },
      onSearchStart: loadAllBodies,
    });

    let bodiesLoaded = false;
    async function loadAllBodies() {
      if (bodiesLoaded) return;
      bodiesLoaded = true;
      await Promise.all(posts.map(async (post) => {
        try { post.text = normalize((await getPostFile(post)).body); } catch { post.text = ""; }
      }));
      render();
    }

    const matches = (post) => {
      if (view.tag && !post.tags.some((t) => normalize(t) === normalize(view.tag))) return false;
      const words = normalize(view.q).split(/\s+/).filter(Boolean);
      if (!words.length) return true;
      const haystack = normalize([post.title, post.description, post.tags.join(" "), post.text ?? ""].join("\n"));
      return words.every((word) => haystack.includes(word));
    };

    function render() {
      const found = posts.filter(matches);
      const shown = found.slice(0, view.visible);
      filters.setCount(`${found.length} ${found.length === 1 ? "POST" : "POSTS"}`);

      if (!found.length) {
        list.replaceChildren();
        more.replaceChildren(emptyState("No posts match your search.",
          el("button", { type: "button", class: "btn btn-sm mt-4", onclick: () => filters.reset() }, "Clear filters")));
        return;
      }
      list.replaceChildren(...postList(shown));
      const remaining = found.length - shown.length;
      more.replaceChildren(remaining > 0
        ? el("button", {
            type: "button", class: "btn",
            onclick: () => { view.visible += C.pageSize; render(); list.children[shown.length]?.querySelector("a")?.focus(); },
          }, `Load more (${remaining} remaining)`)
        : "");
      hydrateReadingTimes(shown, list);
    }

    mount(root, filters.element, list, more);
    render();
    if (view.q) loadAllBodies();
  };
  await load();
}

/* ------------------------------------------------------------ post detail */

export async function initPost() {
  const root = $("#post-root");
  const slug = new URLSearchParams(location.search).get("slug");
  const load = async () => {
    mount(root, loadingState());
    try {
      const posts = await getPosts();
      const post = slug && posts.find((p) => p.slug === slug);
      if (!post) {
        setMeta({ title: "Post not found" });
        return mount(root, notFound("Post not found.", "blog.html", "All posts"));
      }
      const { data, body } = await getPostFile(post);
      const title = post.title || data.title;
      const description = post.description || data.description || "";
      const author = post.author || data.author;
      const minutes = post.readingTime || readingTime(body);
      const content = await renderMarkdown(body, { baseFile: post.file, title });

      setMeta({ title, description, type: "article" });
      document.head.querySelectorAll('meta[property="article:published_time"]').forEach((n) => n.remove());
      document.head.append(el("meta", { property: "article:published_time", content: post.date }));

      mount(root,
        el("article", {},
          el("header", { class: "grid gap-6 mb-12" },
            el("p", { class: "meta" }, el("a", { class: "link", href: "blog.html" }, "BLOG")),
            el("h1", { class: "title-xl" }, title),
            description && el("p", { class: "lede" }, description),
            el("p", { class: "meta meta-row" },
              el("time", { datetime: post.date }, formatDate(post.date, "long")),
              el("span", {}, `${minutes} MIN READ`),
              author && el("span", {}, author)),
            tagList(post.tags)),
          el("div", { class: "prose" }, content),
          el("footer", { class: "mt-16 pt-6 border-t-2 border-fg" },
            el("a", { class: "btn", href: "blog.html" }, "All posts"))));
    } catch (error) {
      const message = error?.kind === "not-found" ? "Post not found." : error?.kind ? "Unable to load content from GitHub." : "Content unavailable.";
      if (!error?.kind) console.error(error);
      mount(root, errorState(message, load));
    }
  };
  await load();
}

function notFound(message, href, label) {
  return emptyState(message, el("a", { class: "btn btn-sm mt-4", href }, label));
}

/* ------------------------------------------------------------------ about */

export async function initAbout() {
  const root = $("#about-root");
  const load = async () => {
    mount(root, loadingState());
    try {
      const { data, body } = parseFrontmatter(await fetchText(C.paths.about));
      const content = await renderMarkdown(body, { baseFile: C.paths.about, title: data.title });
      setMeta({ title: data.title || "About", description: data.description });
      mount(root,
        el("h1", { class: "h-page mb-12" }, data.title || "About"),
        el("div", { class: "prose" }, content));
    } catch (error) {
      if (!error?.kind) console.error(error);
      mount(root, errorState(contentErrorMessage(error), load));
    }
  };
  await load();
}
