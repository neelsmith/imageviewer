// local-image-viewer.html: browse photos in a folder on this computer (opened from disk; not for a web server).
import "./ui/styles.css";
import { startLocalApp } from "./ui/local-app";

startLocalApp(document.getElementById("app")!);
