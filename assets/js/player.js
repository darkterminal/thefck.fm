/**
 * player.js — one shared HTML5 Audio element, three views of it:
 *   - createAudioPlayer(episode)  full player (episode page)
 *   - initMiniPlayer()            sticky bottom player
 *   - createPlayButton(episode)   PLAY / PAUSE button used in episode lists
 *
 * Only one episode can be active: loading another pauses the old one.
 * Preferences (volume, last played episode + position) live in localStorage
 * and are optional.
 */
import { SITE_CONFIG as C } from "./config.js";
import { buildAudioUrl, buildAssetUrl } from "./github.js";
import { el, icon, iconPair, setIconState, refreshIcons, formatTime, parseDuration, pad, storage } from "./ui.js";

const audio = new Audio();
audio.preload = "none";

const state = { episode: null, playing: false, loading: false, current: 0, duration: 0, volume: 1, error: false };
const listeners = new Set();
const known = new Map(); // id -> episode, filled by registerEpisodes()

const SAVED_VOLUME = parseFloat(storage.get("volume"));
if (Number.isFinite(SAVED_VOLUME)) state.volume = Math.min(1, Math.max(0, SAVED_VOLUME));
audio.volume = state.volume;

const emit = () => listeners.forEach((fn) => fn(state));
export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
export const getState = () => state;
export const isActive = (episode) => state.episode?.id === episode?.id;

export const episodeLabel = (episode) => `EP. ${pad(episode.episode, 3)}`;

export function registerEpisodes(episodes) {
  episodes.forEach((ep) => known.set(ep.id, ep));
}

/* ------------------------------------------------------------ audio events */

let lastSaved = 0;
function saveProgress(force = false) {
  if (!state.episode) return;
  const now = Date.now();
  if (!force && now - lastSaved < 5000) return;
  lastSaved = now;
  storage.set("lastPlayed", JSON.stringify({ id: state.episode.id, time: Math.floor(audio.currentTime || 0) }));
}

audio.addEventListener("play", () => { state.playing = true; emit(); });
audio.addEventListener("pause", () => { state.playing = false; saveProgress(true); emit(); });
audio.addEventListener("ended", () => { state.playing = false; state.current = 0; storage.remove("lastPlayed"); emit(); });
audio.addEventListener("waiting", () => { state.loading = true; emit(); });
audio.addEventListener("playing", () => { state.loading = false; state.error = false; emit(); });
audio.addEventListener("canplay", () => { state.loading = false; emit(); });
audio.addEventListener("durationchange", () => { state.duration = Number.isFinite(audio.duration) ? audio.duration : 0; emit(); });
audio.addEventListener("timeupdate", () => { state.current = audio.currentTime; saveProgress(); emit(); });
audio.addEventListener("error", () => {
  if (!audio.getAttribute("src")) return;
  state.error = true; state.playing = false; state.loading = false; emit();
});

/* --------------------------------------------------------------- controls */

/** Make `episode` the active one without playing it. */
export function loadEpisode(episode, startAt = 0) {
  if (isActive(episode)) return;
  audio.pause(); // the previous episode stops here
  state.episode = episode;
  state.error = !episode.audio;
  state.playing = false;
  state.current = startAt;
  state.duration = 0;
  if (episode.audio) {
    audio.src = buildAudioUrl(episode.audio);
    audio.preload = "metadata";
    if (startAt > 0) audio.addEventListener("loadedmetadata", () => { audio.currentTime = startAt; }, { once: true });
  }
  updateMediaSession(episode);
  emit();
}

export async function playEpisode(episode) {
  loadEpisode(episode);
  if (state.error) return;
  try {
    await audio.play();
  } catch (error) {
    if (error.name === "NotSupportedError") { state.error = true; emit(); }
    // AbortError (interrupted by another load) and NotAllowedError need no message
  }
}

export function togglePlayback(episode = state.episode) {
  if (!episode) return;
  if (isActive(episode) && !audio.paused) audio.pause();
  else playEpisode(episode);
}

export function seekTo(episode, seconds) {
  if (!isActive(episode)) loadEpisode(episode, seconds);
  else if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(Math.max(0, seconds), audio.duration);
  state.current = seconds;
  emit();
}

export function setVolume(value) {
  state.volume = Math.min(1, Math.max(0, value));
  audio.volume = state.volume;
  storage.set("volume", String(state.volume));
  emit();
}

export function stop() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  state.episode = null; state.playing = false; state.current = 0; state.duration = 0; state.error = false;
  storage.remove("lastPlayed");
  emit();
}

/** Restore the last played episode (paused, at its saved position). */
export function restoreLastPlayed(episodes) {
  if (state.episode) return;
  try {
    const saved = JSON.parse(storage.get("lastPlayed"));
    const episode = episodes.find((ep) => ep.id === saved?.id);
    if (episode?.audio) loadEpisode(episode, Number(saved.time) || 0);
  } catch { /* nothing saved */ }
}

export function savedPosition(episodeId) {
  try {
    const saved = JSON.parse(storage.get("lastPlayed"));
    return saved?.id === episodeId ? Number(saved.time) || 0 : 0;
  } catch { return 0; }
}

function updateMediaSession(episode) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: episode.title,
    artist: episode.author || C.siteName,
    album: C.siteName,
    artwork: episode.cover ? [{ src: buildAssetUrl(episode.cover) }] : [],
  });
  navigator.mediaSession.setActionHandler("play", () => playEpisode(state.episode));
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
}

/* ------------------------------------------------------------ range slider */

function createRange({ label, max = 100, step = 1, onInput }) {
  const fill = el("span", { class: "range-fill", "aria-hidden": "true" });
  const input = el("input", { type: "range", min: 0, max, step, value: 0, "aria-label": label });
  const root = el("div", { class: "range" }, fill, input);
  let dragging = false;

  input.addEventListener("pointerdown", () => { dragging = true; });
  ["pointerup", "pointercancel", "change", "blur"].forEach((evt) => input.addEventListener(evt, () => { dragging = false; }));
  input.addEventListener("input", () => {
    fill.style.width = `${(Number(input.value) / (Number(input.max) || 1)) * 100}%`;
    onInput(Number(input.value));
  });

  return {
    root,
    update({ value, max: newMax, disabled, text }) {
      input.max = String(newMax);
      input.disabled = disabled;
      root.toggleAttribute("data-disabled", disabled);
      if (!dragging) {
        input.value = String(value);
        fill.style.width = `${newMax ? (value / newMax) * 100 : 0}%`;
      }
      if (text) input.setAttribute("aria-valuetext", text);
    },
  };
}

/** Current view of the shared state from one episode's point of view. */
function viewOf(episode) {
  const active = isActive(episode);
  const metaDuration = parseDuration(episode.duration);
  const duration = active && state.duration ? state.duration : metaDuration;
  const current = active ? state.current : 0;
  return { active, duration, current, playing: active && state.playing, error: active && state.error };
}

function playToggle(getEpisode, className) {
  const icons = iconPair("play", "pause");
  const button = el("button", { type: "button", class: className, onclick: () => togglePlayback(getEpisode()) }, icons);
  return {
    button,
    update(playing) {
      const episode = getEpisode();
      if (!episode) return;
      setIconState(icons, playing);
      button.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${episodeLabel(episode)}: ${episode.title}`);
    },
  };
}

/* ------------------------------------------------------------ full player */

export function createAudioPlayer(episode) {
  const toggle = playToggle(() => episode, "icon-btn icon-btn-lg");
  const seek = createRange({ label: "Seek", step: 1, onInput: (value) => seekTo(episode, value) });
  const time = el("span", { class: "meta time" });
  const volume = createRange({ label: "Volume", max: 1, step: 0.05, onInput: setVolume });
  const status = el("p", { class: "player-status", role: "status" });

  const root = el("section", { class: "player", "aria-label": `Audio player: ${episode.title}` },
    el("div", { class: "player-head" },
      el("span", { class: "font-bold" }, episodeLabel(episode)),
      el("span", { class: "truncate" }, episode.title)),
    el("div", { class: "player-body" },
      toggle.button,
      el("div", { class: "player-seek" }, seek.root),
      time,
      el("div", { class: "player-volume" }, icon("volume-2"), volume.root)),
    status);

  subscribe(() => {
    const v = viewOf(episode);
    toggle.update(v.playing);
    seek.update({ value: v.current, max: v.duration, disabled: v.error || !v.duration,
      text: `${formatTime(v.current)} of ${formatTime(v.duration)}` });
    volume.update({ value: state.volume, max: 1, disabled: false, text: `${Math.round(state.volume * 100)}%` });
    time.textContent = `${formatTime(v.current)} / ${formatTime(v.duration)}`;
    status.textContent = v.error || !episode.audio ? "Audio unavailable." : (v.active && state.loading ? "Loading..." : "");
    status.hidden = !status.textContent;
  });
  refreshIcons();
  return root;
}

/* ------------------------------------------------------------ list button */

export function createPlayButton(episode) {
  const label = el("span", { dataset: { label: "" } }, "Play");
  return el("button", {
    type: "button", class: "btn btn-sm above", dataset: { playEpisode: episode.id },
    "aria-label": `Play ${episodeLabel(episode)}: ${episode.title}`,
  }, iconPair("play", "pause"), label);
}

/** Bring every PLAY / PAUSE button on the page in line with the shared state. */
export function syncPlayButtons() {
  document.querySelectorAll("[data-play-episode]").forEach((button) => {
    const episode = known.get(button.dataset.playEpisode);
    if (!episode) return;
    const playing = isActive(episode) && state.playing;
    setIconState(button.querySelector(".icon-pair"), playing);
    button.querySelector("[data-label]").textContent = state.error && isActive(episode) ? "Unavailable" : playing ? "Pause" : "Play";
    button.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${episodeLabel(episode)}: ${episode.title}`);
    button.closest("[data-episode-row]")?.classList.toggle("is-playing", playing);
  });
}

/** One document-level click handler + one subscriber keep every list button working. */
function initPlayButtons() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-play-episode]");
    const episode = button && known.get(button.dataset.playEpisode);
    if (episode) togglePlayback(episode);
  });

  let lastKey = "";
  subscribe(() => {
    const key = `${state.episode?.id}|${state.playing}|${state.error}`;
    if (key === lastKey) return;
    lastKey = key;
    syncPlayButtons();
  });
}

/* ------------------------------------------------------------ mini player */

export function initMiniPlayer({ visible = true } = {}) {
  initPlayButtons();
  if (!visible) return;

  const toggle = playToggle(() => state.episode, "icon-btn");
  const title = el("a", { class: "mini-title truncate", href: "episode.html" });
  const seek = createRange({ label: "Seek", onInput: (value) => state.episode && seekTo(state.episode, value) });
  const time = el("span", { class: "meta mini-time" });
  const close = el("button", { type: "button", class: "icon-btn icon-btn-ghost", "aria-label": "Close player", onclick: stop }, icon("x"));

  const root = el("div", { class: "mini-player", role: "region", "aria-label": "Mini player", hidden: true },
    el("div", { class: "wrap mini-inner" },
      el("div", { class: "mini-toggle" }, toggle.button),
      title,
      el("div", { class: "mini-seek" }, seek.root),
      time,
      el("div", { class: "mini-close" }, close)));
  document.body.append(root);

  subscribe(() => {
    const episode = state.episode;
    root.hidden = !episode;
    document.body.classList.toggle("has-mini-player", !!episode);
    if (!episode) return;
    const v = viewOf(episode);
    title.href = `episode.html?id=${encodeURIComponent(episode.id)}`;
    title.textContent = `${episodeLabel(episode)} — ${episode.title}`;
    toggle.update(v.playing);
    seek.update({ value: v.current, max: v.duration, disabled: v.error || !v.duration,
      text: `${formatTime(v.current)} of ${formatTime(v.duration)}` });
    time.textContent = v.error ? "Audio unavailable." : formatTime(v.current);
  });
  refreshIcons();
}
