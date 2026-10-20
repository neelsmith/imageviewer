// Catalog-chooser app (catalogs.html): no password; shows only cataloged images
// from the catalog chosen in data/catalog_of_catalogs.cex.
import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startCatalogApp } from "./ui/catalog-app";
import { loadDataUpdated } from "./ui/load";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
const cfg = configFromSearch(location.search, base);
loadDataUpdated(cfg);
startCatalogApp(document.getElementById("app")!, cfg);
