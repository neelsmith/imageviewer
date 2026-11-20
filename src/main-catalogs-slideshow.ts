// catalogs-slideshow.html: catalogs.html as a slide show (same menu, same catalogs).
import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startCatalogApp } from "./ui/catalog-app";
import { loadDataUpdated } from "./ui/load";
import { startSlideshow } from "./ui/slideshow";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
const cfg = configFromSearch(location.search, base);
loadDataUpdated(cfg);
startCatalogApp(document.getElementById("app")!, cfg, { view: startSlideshow, title: "Slide show" });
