# Image viewers


> [*Notes on released versions*](https://github.com/neelsmith/imageviewer/blob/main/releases.md)

Apps for light-table and zoomable/pannable display of individual images, implemented in self-contained HTML files that can be run locally or served on the web. Supports cataloging of images in simple delimited-text files, and filtering of light-table display by cataloged data, or by date and location encoded in the images.

- an example installation is hosted on [the project's github pages](https://neelsmith.github.io/imageviewer/catalogs.html)
- `local-image-viewer.html` is a stand-alone app you can use to browse and catalog images in your local file system
- documentation is available at [https://neelsmith.github.io/imageviewer/](https://neelsmith.github.io/imageviewer/)



## Available apps

In the `src` directory, `npm run build` builds the following apps:

- `local.html`: browse and catalog images in your local file system
- `private.html`: password-protected image browser
- `catalogs.html`: browse images from catalogs
- `private-catalogs.html`: browse images from catalogs, optionally password-protected by catalog
- `www.browse.html`: browse images on a web server
