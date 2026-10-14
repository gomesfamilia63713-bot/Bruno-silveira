import { reloadAppOnce } from "@/lib/reload-guard";

const MODULE_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\d]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === "string" ? error : "";
}

export function isModuleLoadError(error: unknown) {
  const text = errorText(error);
  return MODULE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/** Recarrega uma única vez quando uma publicação substituiu módulos antigos. */
export async function recoverFromModuleLoadError(error: unknown) {
  if (typeof window === "undefined" || !isModuleLoadError(error)) return false;

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    await registration?.update().catch(() => undefined);
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }

  return reloadAppOnce();
}

export function installModuleRecovery() {
  if (typeof window === "undefined") return () => {};

  const onPreloadError = (event: Event) => {
    event.preventDefault();
    const payload = (event as Event & { payload?: unknown }).payload;
    void recoverFromModuleLoadError(payload ?? "Failed to fetch dynamically imported module");
  };
  const onError = (event: ErrorEvent) => {
    void recoverFromModuleLoadError(event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    void recoverFromModuleLoadError(event.reason);
  };

  window.addEventListener("vite:preloadError", onPreloadError);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("vite:preloadError", onPreloadError);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}