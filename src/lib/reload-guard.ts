const RELOAD_KEY = "bs-app-reload";
const RELOAD_WINDOW_MS = 60_000;

export function claimAppReload() {
  if (typeof window === "undefined") return false;
  const previous = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - previous < RELOAD_WINDOW_MS) return false;
  window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  return true;
}

export function reloadAppOnce() {
  if (!claimAppReload()) return false;
  window.location.reload();
  return true;
}