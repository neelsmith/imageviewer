// Catalog-chooser app (index.html): no password; shows only cataloged images
// from the catalog chosen in data/catalog_of_catalogs.cex.
import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startCatalogApp } from "./ui/catalog-app";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
startCatalogApp(document.getElementById("app")!, configFromSearch(location.search, base));
