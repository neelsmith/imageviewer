// local-slideshow.html: local-image-viewer.html as a slide show (folders on this computer; open from disk).
import "./ui/styles.css";
import { startLocalApp } from "./ui/local-app";
import { startSlideshow } from "./ui/slideshow";

startLocalApp(document.getElementById("app")!, { view: startSlideshow, title: "Slide show" });
