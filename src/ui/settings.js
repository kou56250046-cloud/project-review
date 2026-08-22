/* =========================================================================
   表示設定（テーマ・文字サイズなど）
   選んだ内容はブラウザに残るので、次に開いたときも同じ見た目になる。
   ========================================================================= */
import { S, emit } from "../core/state.js";
import { $, $$ } from "../core/util.js";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../core/persist.js";
import { setShowRoles, renderTree } from "./tree.js";

export let settings = loadSettings();

export function applySettings() {
  const r = document.documentElement;
  if (settings.theme === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", settings.theme);

  r.style.setProperty("--fs-ui", settings.uiScale + "px");
  r.style.setProperty("--fs-code", settings.codeScale + "px");
  r.style.setProperty("--fs-prose", settings.proseScale + "px");
  r.style.setProperty("--lh-code", settings.lineHeight + "px");
  r.style.setProperty("--prose-w", settings.proseWidth + "px");

  S.ignoreHeavy = settings.ignoreHeavy;
  setShowRoles(settings.showRoles);
  saveSettings(settings);
  emit("settings-changed", settings);
}

export function setTheme(theme) {
  settings.theme = theme;
  applySettings();
  syncUI();
}

/** ライト ⇄ ダークを切り替える（system のときは今の見え方の逆にする） */
export function cycleTheme() {
  const now = settings.theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : settings.theme;
  setTheme(now === "dark" ? "light" : "dark");
  return settings.theme;
}

export function zoom(delta) {
  settings.uiScale = clamp(settings.uiScale + delta, 11, 20);
  settings.codeScale = clamp(settings.codeScale + delta, 10, 22);
  settings.proseScale = clamp(settings.proseScale + delta, 12, 24);
  settings.lineHeight = Math.round(settings.codeScale * 1.55);
  applySettings();
  syncUI();
  emit("zoom-changed", settings);
}

export function resetZoom() {
  settings.uiScale = DEFAULT_SETTINGS.uiScale;
  settings.codeScale = DEFAULT_SETTINGS.codeScale;
  settings.proseScale = DEFAULT_SETTINGS.proseScale;
  settings.lineHeight = DEFAULT_SETTINGS.lineHeight;
  applySettings();
  syncUI();
  emit("zoom-changed", settings);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initSettings() {
  $$("#setTheme button").forEach(b => {
    b.onclick = () => setTheme(b.dataset.theme);
  });
  bindRange("setUi", "uiScale");
  bindRange("setCode", "codeScale");
  bindRange("setProse", "proseScale");
  bindRange("setLh", "lineHeight");
  bindRange("setWidth", "proseWidth");
  bindCheck("setRoles", "showRoles", () => renderTree());
  bindCheck("setIgnore", "ignoreHeavy");
  bindCheck("setRestore", "restoreLast");
  $("#setReset").onclick = () => {
    settings = { ...DEFAULT_SETTINGS };
    applySettings();
    syncUI();
    renderTree();
  };
  syncUI();
}

function bindRange(id, key) {
  const el = $("#" + id);
  if (!el) return;
  el.addEventListener("input", () => {
    settings[key] = +el.value;
    applySettings();
    syncUI();
  });
}

function bindCheck(id, key, after) {
  const el = $("#" + id);
  if (!el) return;
  el.addEventListener("change", () => {
    settings[key] = el.checked;
    applySettings();
    if (after) after();
  });
}

export function syncUI() {
  $$("#setTheme button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.theme === settings.theme)));
  const set = (id, key, unit) => {
    const el = $("#" + id);
    if (!el) return;
    el.value = settings[key];
    const out = $("#" + id + "Val");
    if (out) out.textContent = settings[key] + (unit || "");
  };
  set("setUi", "uiScale", "px");
  set("setCode", "codeScale", "px");
  set("setProse", "proseScale", "px");
  set("setLh", "lineHeight", "px");
  set("setWidth", "proseWidth", "px");
  const c = (id, key) => { const el = $("#" + id); if (el) el.checked = !!settings[key]; };
  c("setRoles", "showRoles");
  c("setIgnore", "ignoreHeavy");
  c("setRestore", "restoreLast");
}
