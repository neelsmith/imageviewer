`imageviewer` web app

## Overview

A webapp with a UI similar to immich for browsing images. Images are served from a public folder hosted on pCloud. Some (not all) images are cataloged in a local delimited-text file. Users can choose to group images by date, location, or tag in catalog file.

## Functionality

The webapp should be entirely selfcontained so it can be run from a single html file either by opening from the local file server or by serving on a web server.

## Architecture & Directory Structure

- `quarto`, `docs`, `README.md` and `releases.md` are all user-readable content owned by me; Claude should not touch them
- `notes` is for documentation and notes that Claude writes, includes session summaries so I can reliably pick up working with Claude from different machines
- `src` is for source code



## Testing Guidelines

- Write unit tests for utility functions and integration/component tests for critical UI flows.
- Run relevant tests before proposing significant refactors.