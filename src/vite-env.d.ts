/// <reference types="vite/client" />

/** From package.json at build time; "<version>-dev" under `npm run dev`. */
declare const __APP_VERSION__: string;

/** imageBase, dataBase, repoUrl from site.config.json, baked in at build time. */
declare const __SITE_CONFIG__: { imageBase: string; dataBase: string; repoUrl?: string };
