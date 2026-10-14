// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

const buildRevision = process.env["CF_PAGES_COMMIT_SHA"] ??
  process.env["VERCEL_GIT_COMMIT_SHA"] ??
  process.env["LOVABLE_BUILD_ID"] ??
  new Date().toISOString();

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        outDir: "dist/client",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: {
          name: "BS TOOLS — Controle de Ferramentas",
          short_name: "BS TOOLS",
          description: "Controle de ferramentas, materiais e obras.",
          id: "/",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0b1220",
          theme_color: "#0b1220",
          icons: [
            { src: "/app-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,json,woff,woff2}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // App shell + ícones: abre localmente sem cair na tela nativa "offline" do navegador.
          additionalManifestEntries: [
            { url: "/", revision: `app-shell-${buildRevision}` },
            { url: "/login", revision: `login-shell-${buildRevision}` },
            { url: "/ponto", revision: `ponto-shell-${buildRevision}` },
          ],
          // o token individual (?u=...) não invalida o shell de ponto no cache
          ignoreURLParametersMatching: [/^u$/, /^utm_/, /^source$/],
          navigateFallback: "/",
          navigateFallbackAllowlist: [/^(?!\/(api|~oauth)).*/],
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],


          runtimeCaching: [
            // Navegações são resolvidas pelo precache via navigateFallback ("/"),
            // garantindo abertura offline instantânea sem a tela de erro do navegador.
            {
              // Imagens, fontes e manifesto são estáveis. Scripts e estilos versionados
              // ficam somente no precache para nunca reutilizar módulos de outro build.
              urlPattern: ({ url, request }: any) =>
                url.origin === self.location.origin &&
                ["image", "font", "manifest"].includes(
                  request.destination,
                ),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Fontes externas (Google Fonts) também offline
              urlPattern: ({ url }: any) =>
                url.origin === "https://fonts.googleapis.com" ||
                url.origin === "https://fonts.gstatic.com",
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Leituras do backend: usa rede quando há sinal, cache quando não há
              urlPattern: ({ url, request }: any) =>
                request.method === "GET" && /supabase\.co$/.test(url.hostname),
              handler: "NetworkFirst",
              options: {
                cacheName: "api-reads",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },

      }),
    ],
  },
});
