# Claude Transfer

Move your chats and projects to a new Claude account. Claude Transfer turns a Claude data export into one folder per project, holding the project's instructions, its documents, and word-for-word transcripts of its chats, split to fit project size limits.

It runs entirely in your browser. Your conversations are never uploaded anywhere. This is an independent tool, not made by or affiliated with Anthropic.

## What you need
1. A data export from your original account (Settings > Privacy > Export data). From it you want `conversations.json` and the projects file (`projects.json`, or a zip of project files).
2. Nothing else. No install, no sign-in.

## Using it
1. **Load your export.** Pick `conversations.json`, then the projects file. Both pickers also accept `.zip` files. Empty, unnamed placeholder projects are hidden automatically.
2. **Get your chat lists.** The export doesn't say which chats belong to which project, so you ask your original Claude. Choose a project, tap **Copy prompt**, open that project in your original account (**Open project in Claude** helps), start a new chat inside it, paste the prompt, and copy the code block Claude replies with. Paste it into the box in the app. Repeat for each project. Titles that aren't found turn red and the closest match is offered.
3. **Options.** Artifacts and attachment text are included by default. Tool calls and Claude's thinking are optional and off by default because they are long.
4. **Build transcripts**, then **Save all as one zip** (or save one project at a time).

On iPhone, tap the saved zip in Files and it unzips into a folder with the same name. Each project gets its own folder: `instructions.md`, `description.md`, `knowledge/` (its documents) and `transcripts/`. Instructions go in the new project's instructions box; documents and transcripts are uploaded as project knowledge.

Projects with no instructions or documents are normal and produce no empty files.

## The ledger
The ledger remembers which chats you have already saved, so a later export only pulls new or changed chats. A chat is recorded when you save its file, not when you build it, so closing the page never marks something done that you don't have. Save `ledger.json` and load it next time. Older `ledger.csv` files still load.

## Google Sheet sync (optional)
Paste `ledger-sync-apps-script.gs` into your own Sheet (Extensions > Apps Script), set a long `SECRET`, deploy it as a web app, then paste its URL and the secret into the app. Only ledger rows are sent: project, chat title, chat ID, dates and file name. The secret travels in the request body, never in the web address. Sending twice is safe because duplicates are skipped. If you used an earlier version of the script, replace it and deploy a new version.

## Publish on GitHub Pages
1. Create a repository (any name). Public is fine: the page runs locally on whatever file you pick, so your chats are never in the repository.
2. Upload everything in this folder to the repository root, keeping the `tests` folder if you want the tests.
3. Settings > Pages > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. After a minute the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. When you publish a change, bump `CACHE` in `sw.js` (for example `claude-transfer-v2`) so installed copies pick it up.

## Add to your home screen
- iPhone: open the site in Safari, tap Share, then **Add to Home Screen**. It appears as "Transfer".
- Android: open the site in Chrome, tap the menu, then **Install app**.

Once installed it also works offline, because the app and its zip library are stored on the device.

## Privacy and security
- No analytics, no server, no accounts. The only network call is the optional Sheet sync, and the page's Content Security Policy only allows connections to `script.google.com`.
- The zip library (`jszip.min.js`) is served from this repository with an integrity hash, not from a third-party CDN.
- The Sheet URL and key are stored in this browser's local storage on your device. Use **Forget saved Sheet details** to remove them.
- Protect your GitHub account with two-factor authentication. Anyone who can change the repository can change the code everyone runs.

## Tests
`node tests/core.test.js` checks matching (including accents), message fidelity, splitting, the ledger and the prompt. Run it before publishing a change.

## Files
`index.html`, `style.css`, `app.js` (the page), `core.js` (the logic, shared with the tests), `splash.js` (the opening animation), `sw.js` (offline), `jszip.min.js` (zip library), `manifest.webmanifest` and the icon files. `icon-maskable-512.png` is padded for Android's adaptive icons. The icon is an original burst-to-arrow design and is not the official Claude logo.

JSZip is used under the MIT license (see the header of `jszip.min.js`).
