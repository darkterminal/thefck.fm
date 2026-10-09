/**
 * config.js — the ONLY file you need to edit to point the site at your repository.
 *
 * Every GitHub Raw URL and every jsDelivr URL in the site is built from these
 * values (see github.js). Nothing else hardcodes a repository address.
 */
export const SITE_CONFIG = Object.freeze({
  // --- Repository ---------------------------------------------------------
  owner: "darkterminal",
  repository: "thefck.fm",
  branch: "main",

  /**
   * Where content is read from:
   *   "auto"   -> GitHub Raw + jsDelivr once owner/repository are changed from
   *               the USERNAME / REPOSITORY placeholders; otherwise the files
   *               next to the site (so the sample content works out of the box).
   *   "github" -> always GitHub Raw + jsDelivr.
   *   "local"  -> always files served next to the site (local development).
   */
  source: "auto",

  // --- Site ---------------------------------------------------------------
  siteName: ".DARKTERMINAL",
  siteDescription: "Personal blog and audio journal.",

  /**
   * Public URL of the site, used for canonical and og:url tags.
   * Include the trailing slash and any sub-path, e.g. "https://username.github.io/repository/".
   * Leave empty to use the address the page is currently opened from.
   */
  siteUrl: "",

  /** Leave empty to derive https://github.com/OWNER/REPOSITORY. */
  github: "",

  // --- Content locations (relative to the repository root) -----------------
  paths: Object.freeze({
    posts: "content/posts.json",
    episodes: "podcast/episodes.json",
    about: "content/pages/about.md",
  }),

  // --- Lists ----------------------------------------------------------------
  pageSize: 6,
  homeCount: 3,
});
