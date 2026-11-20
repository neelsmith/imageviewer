// www-browse-slideshow.html: www-browse.html as a slide show. Put it next to www-browse.html
// (beside images.cex) on the web server.
import "./ui/styles.css";
import { startBrowseApp } from "./ui/browse-app";
import { HeicDecoder } from "./ui/local/heic";
import { startSlideshow } from "./ui/slideshow";

startBrowseApp(document.getElementById("app")!, { decoder: new HeicDecoder(), view: startSlideshow, title: "Slide show" });
