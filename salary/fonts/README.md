# Inter, subset for the salary PDF report

`/salary/`'s **Export PDF** embeds these two faces so the report is set in Design
Wallet's own typeface rather than a PDF base-14 font. A PDF cannot reference a
web font — the file has to carry the outlines.

| File | What it is |
|---|---|
| `inter-regular.ttf`, `inter-light.ttf` | Subsets of Inter, static instances of the variable font at wght 400 (opsz 14) and wght 300 (opsz 28) |
| `inter-metrics.js` | **Generated.** Advance widths + font descriptor values, read by `pdf-writer.js` so the browser never has to parse a TTF |
| `OFL.txt` | The SIL Open Font License these files ship under |

## Regenerating

The subsets and `inter-metrics.js` are produced **together** by one script. If
the fonts are ever re-cut, the metrics file must be rebuilt in the same pass, or
text will be measured against widths that no longer match the embedded outlines
— wrapping and right-alignment drift with no error anywhere.

Source: `https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf`
(the variable font; instanced at wght 400/opsz 14 and wght 300/opsz 28 with `fontTools.varLib.instancer`,
then subset with `fontTools.subset` keeping `glyph_names`).

Do **not** fetch Inter from `fonts.googleapis.com` for this: with an old user
agent that endpoint serves **EOT**, not TTF, and fontTools rejects it.

## Character set

ASCII 32–126, plus `· × ° – — ' ' " " • …` and `₹`. The rupee sign occupies
CP1252 slot `0x80` (normally the euro) via an `/Encoding /Differences` entry —
the report never prints a euro. Anything outside this set renders as `?`.

## Licence

Inter is licensed under the SIL Open Font License 1.1 (see `OFL.txt`), which
permits embedding in a document. Copyright 2016 The Inter Project Authors.
