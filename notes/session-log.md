# Session log

## 2026-10-13 — planning session (Cowork)

- Read `CLAUDE.md`; repo is a fresh clone (one commit; `src/`, `notes/`, `touch/` empty).
- Neel decided: pCloud Public Folder hosting; catalog fetched from pCloud; Vite build
  bundled to one HTML; output to `src/dist/` only (not `docs/`).
- Wrote `notes/plan.md` (phased plan + open questions).
- No code written, nothing committed. Next step: Phase 0 spike once Neel supplies the
  Public Folder URL and a sample catalog.

- Neel supplied the Public Folder URL and catalog header/sample row (pipe-delimited:
  path|caption|credits|license|tags). Recorded in plan.md. Catalog has no date/location.
- Tried to fetch catalog.cex to test CORS: blocked by the network allowlist in both the
  cloud sandbox and the local VM. CORS still untested; Neel to test in his browser.

- GitHub console test inconclusive (blocked by github.com's own CSP, not pCloud).
  Added src/spike/cors-test.html to test from file:// and from a local server.

- CORS test: file:// OK in Safari, localhost blocked → pCloud sends no CORS header.
- Decisions: catalog lives in repo (data/catalog.cex), fetched via raw.githubusercontent.com
  (ACAO * verified); dates/locations from EXIF via local tool writing data/images.cex;
  tags comma-separated. plan.md updated with revised data flow + new open questions 6–8.
