import { reloadAppOnce } from "@/lib/reload-guard";

/**
 * Registro guardado do Service Worker.
 * Nunca registra em dev, iframe ou previews da Lovable — apenas no app publicado.
 */
const APP_SW_PATHS = ["/sw.js", "/service-worker.js"];

const BLOCKED_HOST_SUFFIXES = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "beta.lovable.dev",
];

function isBlockedHost(host: string) {
  return BLOCKED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => {
        const scripts = [r.active?.scriptURL, r.installing?.scriptURL, r.waiting?.scriptURL].filter(Boolean);
        return scripts.some((scriptURL) => APP_SW_PATHS.some((path) => scriptURL?.includes(path)));
      })
      .map((r) => r.unregister()),
  );
}

async function registerAppSw() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    let hasController = Boolean(navigator.serviceWorker.controller);
    let updateInFlight: Promise<void> | null = null;
    let reloadWhenIdle = false;

    const applyUpdate = () => {
      if (window.location.pathname === "/ponto" && document.visibilityState === "visible") {
        reloadWhenIdle = true;
        return;
      }
      reloadAppOnce();
    };

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hasController) {
        hasController = true;
        return;
      }
      applyUpdate();
    });

    const activateWaitingWorker = () => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    };
    const checkForUpdate = () => {
      if (navigator.onLine === false) return;
      if (updateInFlight) return updateInFlight;
      updateInFlight = registration
        .update()
        .then(activateWaitingWorker)
        .catch(() => undefined)
        .finally(() => {
          updateInFlight = null;
        });
      return updateInFlight;
    };

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          activateWaitingWorker();
        }
      });
    });

    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && reloadWhenIdle) {
        reloadWhenIdle = false;
        reloadAppOnce();
      } else if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    });
    window.setInterval(checkForUpdate, 5 * 60 * 1000);
    await checkForUpdate();
  } catch {
    // Mantém o app navegável mesmo quando o navegador recusar SW.
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    isBlockedHost(host) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (refused) {
    void unregisterAppSw();
    return;
  }

  if (document.readyState === "complete") {
    void registerAppSw();
    return;
  }

  window.addEventListener("load", () => void registerAppSw(), { once: true });
}
