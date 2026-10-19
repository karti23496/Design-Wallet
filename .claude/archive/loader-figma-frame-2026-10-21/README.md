# Entry loader, "Figma frame" version (archived 2026-10-21)

The homepage loader built from Figma node 825:138 over 2026-10-18 to 2026-10-21: a four-point box that turns
90° each second, the Design Wallet mark with a line of light running along its border, a soft background
glow, and a 0 → 100 counter bottom right (2s count, 1s hold on 100, 0.6s fade).

It was never committed. It was replaced by the preloader modelled on the reference video in
`public/reference/`. To restore: copy `loader.css`, `loader.js`, `loader-box.svg` and `loader-mark.svg` back to the
repo root and put the head lines and body markup from `index-snippets.html` back into `index.html`.
