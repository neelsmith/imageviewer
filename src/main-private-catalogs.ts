// Private-catalogs app (private-catalogs.html): like catalogs.html, but the menu comes from
// data/catalog_of_private_catalogs.cex, whose catalogs can each have a password.
import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startCatalogApp } from "./ui/catalog-app";
import { loadDataUpdated } from "./ui/load";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
const cfg = configFromSearch(location.search, base);
loadDataUpdated(cfg);
startCatalogApp(document.getElementById("app")!, cfg, { listFile: "catalog_of_private_catalogs.cex" });
