// private-slideshow.html: private.html as a slide show (same password, same data).
import "./ui/styles.css";
import authConfig from "./auth.json";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { forget, isAuthEnabled } from "./lib/auth";
import { passwordGate } from "./ui/gate";
import { loadDataUpdated } from "./ui/load";
import { startSlideshow } from "./ui/slideshow";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
const root = document.getElementById("app")!;
const cfg = configFromSearch(location.search, base);
loadDataUpdated(cfg);

passwordGate(root, authConfig, { title: "Slide show" }).then(() =>
  startSlideshow(root, cfg, {
    onLock: isAuthEnabled(authConfig) ? () => { forget(); location.reload(); } : undefined,
    catalogToggle: true,
  }),
);
