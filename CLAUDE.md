# Family tree

A small, dependency-free family tree website. It can be viewed online through GitHub Pages and edited locally.

## How it fits together

- `index.html` with `assets/style.css` is the page.
- `assets/model.js` holds the data model, dates, relationship names and GEDCOM export.
- `assets/layout.js` positions the cards: one row per generation, couples side by side. It also handles the focus radius, card sizes by distance, hidden branches and crossing reduction.
- `assets/app.js` handles rendering (straight rows or the circle), focus navigation, animation, zoom-dependent detail, hover highlighting, settings, the edit window, editing, search and downloads.
- `data/family.json` is the only data store. Its format is described in `.claude/skills/tree-edit/SKILL.md`.
- `serve.py` is the local server, using only the Python standard library. It serves the site, turns on editing, writes edits to `data/family.json`, and runs `git commit` and `git push` when the Publish button is pressed.
- `start.command` is the double-click launcher for `serve.py` on macOS.
- `scripts/validate.py` checks the data. `serve.py` uses it too.
- Online (GitHub Pages) the same page is read-only. Editing turns on only when `/api/status` answers on localhost.

## Working rules

- **Do the work end to end without asking:** make the change, check it, then commit and push to `main` using the `commit` skill. Pushing is what deploys.
- **Commit only as `Ernest Popovici <ernest.popovici@yahoo.com>`**, set in this repo's local git config. The global config on this machine holds a work email that must never appear here.
- **Never mention AI anywhere:** not in commit messages, code comments, the README or UI text. No `Co-Authored-By` trailers.
- To add or change family members, use the `tree-edit` skill. To check the data, use `tree-validate`.
- **Keep it simple:**
  - No build step, no npm packages, no external CDNs. Plain JS and CSS only.
  - The UI should stay calm and uncluttered. It gets shown to relatives, so it needs few buttons and readable cards.
  - Controls appear on hover, and details live in the side panel.
- Match the existing code style: an IIFE per file, everything exported on `window.FT`, 2-space indent, short comments only where they help.
- After changing the layout or UI, run `python3 serve.py` and look at the result before committing.
