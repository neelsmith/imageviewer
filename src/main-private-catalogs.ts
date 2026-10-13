// Private-catalogs app (private-catalogs.html): like index.html, but the menu comes from
// data/catalog_of_private_catalogs.cex, whose catalogs can each have a password.
import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startCatalogApp } from "./ui/catalog-app";

const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;
startCatalogApp(document.getElementById("app")!, configFromSearch(location.search, base),
  { listFile: "catalog_of_private_catalogs.cex" });
