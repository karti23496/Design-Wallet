# Design Wallet Website

Design Wallet is a static landing page that now pulls its catalog listings directly from Google Sheets.

## Project Files

- `index.html`: Main landing page markup
- `style.css`: Visual styling and responsive layout
- `script.js`: Navigation, Google Sheets loading, rendering, and filtering
- `admin/index.html`: Lightweight admin helper page that links to the Google Sheet
- `public/`: Local assets such as images, icons, illustrations, and fonts

## Listing Source

The catalog is powered by this Google Sheet:

`https://docs.google.com/spreadsheets/d/1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8/edit?gid=0#gid=0`

Supported columns include:

- `Image`
- `Title`
- `Subtitle`
- `Description`
- `Categories`
- `Pricing`
- `Link`
- `Thumbnails`
- `Slug`

Notes:

- `Categories` can contain multiple values separated by commas.
- `Pricing` values such as `FREE`, `FREEMIUM`, and `PAID` are normalized automatically.
- The site reads from `gid=0`, so renaming the tab will not break the integration.

## Local Preview

Serve the project with a local server instead of opening the file directly:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Admin Flow

Open `/admin/` to jump to the Google Sheet and manage listings there.
