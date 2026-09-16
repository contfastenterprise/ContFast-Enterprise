import type { NextConfig } from "next";
// `@sentry/nextjs/config`, no `@sentry/nextjs`: desde el raiz esta obsoleto y
// deja de funcionar en la v11 (aviso del propio SDK en el build del lote 153).
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  //  `typescript: { ignoreBuildErrors: true }` vivia aqui, y con el
  //  `pnpm build` NO comprobaba tipos: pasaba con 40 errores dentro, 31 de
  //  ellos introducidos por el propio trabajo de tipado de P1-24 y ninguno
  //  visible durante doce lotes. Con el repo en 0 errores
  //  (`pnpm exec tsc --noEmit`), la bandera sobra: el build vuelve a ser una
  //  puerta de verdad y un tipo que miente ya no llega a produccion.
  transpilePackages: ["@contfast/ai-core"],
  serverExternalPackages: ["pdfkit", "puppeteer", "puppeteer-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://*.supabase.co http://127.0.0.1:54321; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://mpveesrcspollujmgzgy.supabase.co;",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

// Lote 153: Sentry (solo errores; ver src/lib/observabilidad/opcionesSentry.ts).
//
// Nada secreto aqui: organizacion, proyecto y token salen del entorno de Vercel
// (SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN). El token NUNCA se escribe en
// el repositorio.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Que el plugin no mande a Sentry datos de NUESTRO build.
  telemetry: false,
  // Los eventos del navegador salen por una ruta de la propia app. Dos razones:
  // la Content-Security-Policy de arriba solo permite `connect-src 'self'` (y
  // Supabase), y los bloqueadores de anuncios cortan el dominio de Sentry.
  // `/monitoring` no esta en el `matcher` de src/proxy.ts: no pide sesion.
  tunnelRoute: "/monitoring",
  // Sin token no hay subida de source maps, y el build local sigue funcionando.
  // Tras subirlos se borran del build: no se publican los fuentes.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  // Sin trazas no hace falta el mapa de rutas, y asi no se publica en el
  // navegador la lista de pantallas de la app.
  routeManifestInjection: false,
  // El aviso pide `onRouterTransitionStart`, que solo sirve para trazas.
  suppressOnRouterTransitionStartWarning: true,
  // Un fallo al subir source maps (Sentry caido, token vencido) avisa pero no
  // tumba el despliegue.
  errorHandler: (err) => {
    console.warn("[sentry] No se pudieron subir los source maps:", err.message);
  },
});
