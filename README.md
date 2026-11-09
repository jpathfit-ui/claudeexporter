# Claude Chat Exporter

Turns a Claude `conversations.json` export into per-project transcript files (Markdown, split into parts). It runs entirely in your browser. Your conversations are never uploaded anywhere.

## Publish on GitHub Pages
1. Create a new repository on GitHub (for example `chat-exporter`). Public is fine. Because the page runs locally on whatever file you pick, your chats are never in the repository.
2. Upload everything in this folder to the repository root: `index.html`, the icon files, `manifest.webmanifest`, `.nojekyll` and the `icons` folder.
3. Go to Settings > Pages. Under "Build and deployment", set Source to "Deploy from a branch", choose the `main` branch and the `/ (root)` folder, then Save.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/chat-exporter/`.

## Add to your phone's home screen
- iPhone: open the site in Safari, tap Share, then "Add to Home Screen".
- Android: open the site in Chrome, tap the menu, then "Install app" or "Add to Home screen".

## Using it
1. Load your `conversations.json`.
2. Paste project lists: a `#` heading per project, then one chat title per line.
3. Tick the chats you want, then tap Build transcripts.
4. Save each project's file. Keep `ledger.csv` so the next export can skip chats you already have.

## Google Sheet ledger (optional)
Deploy the `ledger-sync-apps-script.gs` file as an Apps Script web app on your own Sheet, then paste its URL and your secret key into the tool. Only ledger rows (project, chat title, chat ID, dates, file name) are sent. Never put the URL or key in the repository.

## Icon
The icon files are `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png` and `icon-512.png`. The master artwork is in `icons/` as SVG (rounded and full-bleed) and a 1024px PNG. To change it, replace those five files. The full-bleed version is used for `apple-touch-icon.png` so iOS can round the corners itself.

## Notes
- The page loads JSZip from cdnjs, so it needs a connection the first time.
- The icon is an original burst-to-arrow design and is not the official Claude logo.
