---
name: commit
description: Commit and push work in this repo with a clear, human-written commit message. Use automatically after every change to the app or the family data, and whenever asked to commit, save, push, publish or put something online.
---

# Commit and push

Every change in this repo is committed and pushed straight away. There is no need to ask first.
Pushing to `main` is what publishes the site: GitHub Pages picks it up within a minute or two.

## Steps

1. If `data/family.json` changed, run `python3 scripts/validate.py`. Fix any errors before committing (warnings are fine, mention them).
2. Look at `git status` and `git diff`. Stage only files that belong to the change, by name. Never stage `.DS_Store`, `*.tmp`, scratch or test files.
3. Write the message (rules below).
4. Commit on `main`. Pass the subject and body as separate `-m` flags, or use a heredoc:
   `git commit -m "Subject" -m "- detail one" -m "- detail two"`
5. Run `git push`. If the push is rejected, run `git pull --rebase` and push again. Never force-push and never rewrite published history.
6. Tell the user the subject line, and that the online version updates in about a minute.

## How to write the message

- **Subject:** imperative mood, starts with a capital letter, no trailing period, at most about 60 characters.
  Describe the result as someone reading the history later would want to see it, not the mechanics.
  - Good: `Add Elena's parents and her sister Lucia`
  - Good: `Make deceased relatives easier to spot`
  - Bad: `update json`, `fix stuff`, `Changes to app.js`
- **Body** (only when it adds something): a blank line, then short `- ` bullets with the details or the reason.
- For family data, name the people and give their years when known: `Add Maria Rusu (1945–2020) as Elena's mother`.
- Group related edits into one commit. Unrelated changes go in separate commits.

## Never

- Never mention AI, assistants, Claude, language models, "generated" or any tooling, in the subject or the body.
- Never add `Co-Authored-By` or any other trailer, signature, emoji or link.
- The same goes for everything else in the repo: code comments, README, UI text.
