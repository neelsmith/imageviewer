// private-catalogs-slideshow.html: private-catalogs.html as a slide show (same menu and passwords).
import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startCatalogApp } from "./ui/catalog-app";
import { loadDataUpdated } from "./ui/load";
import { startSlideshow } from "./ui/slideshow";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
const cfg = configFromSearch(location.search, base);
loadDataUpdated(cfg);
startCatalogApp(document.getElementById("app")!, cfg,
  { listFile: "catalog_of_private_catalogs.cex", view: startSlideshow, title: "Slide show" });
