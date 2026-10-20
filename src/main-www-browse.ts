// www-browse.html: browse the photos in the folder below this page on a web server
// (see ui/browse-app.ts). Carries the HEIC decoder for browsers that can't show HEIC.
import "./ui/styles.css";
import { startBrowseApp } from "./ui/browse-app";
import { HeicDecoder } from "./ui/local/heic";

startBrowseApp(document.getElementById("app")!, { decoder: new HeicDecoder() });
