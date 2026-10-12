/// <reference types="vite/client" />

// Mode partagé (Supabase). Both absent → the app stays local-only (dev, tests).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Injected by vite.config.ts at build time (ISO date). */
declare const __BUILD_DATE__: string
