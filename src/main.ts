import "./ui/styles.css";
import { configFromSearch, DEFAULTS } from "./lib/config";
import { startApp } from "./ui/app";

// In `npm run dev`, read data/ from the local repo (served by build/serve-data.ts);
// the built index.html reads it from GitHub. URL params override either default.
const base = import.meta.env.DEV ? { ...DEFAULTS, dataBase: `${location.origin}/data/` } : DEFAULTS;

startApp(document.getElementById("app")!, configFromSearch(location.search, base));
