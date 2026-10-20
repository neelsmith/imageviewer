// Password-protected app (private.html): all images, with a "Cataloged images only" toggle.
import "./ui/styles.css";
import authConfig from "./auth.json";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { forget, isAuthEnabled } from "./lib/auth";
import { passwordGate } from "./ui/gate";
import { startApp } from "./ui/app";
import { loadDataUpdated } from "./ui/load";

// In `npm run dev`, read data/ from the local repo (served by build/serve-data.ts);
// the built page reads it from GitHub. URL params override either default.
const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
const root = document.getElementById("app")!;
const cfg = configFromSearch(location.search, base);
loadDataUpdated(cfg);

passwordGate(root, authConfig).then(() =>
  startApp(root, cfg, {
    onLock: isAuthEnabled(authConfig) ? () => { forget(); location.reload(); } : undefined,
    catalogToggle: true,
    exportName: "catalog.cex",
  }),
);
