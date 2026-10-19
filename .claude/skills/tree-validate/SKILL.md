---
name: tree-validate
description: Check the family data for mistakes such as broken links, impossible dates, duplicates or people not connected to the tree. Use before committing data changes, or when asked to check, clean up or review the tree.
---

# Validate the family data

Run:

```bash
python3 scripts/validate.py            # checks data/family.json
python3 scripts/validate.py other.json # checks another file
```

The script exits with status 1 when there are errors.

**Errors must be fixed before committing:**
- links to people that don't exist
- bad date formats
- death before birth
- a child who is not younger than their parent
- someone listed as a child in two families
- more than two partners in one union

**Warnings are fine to commit, but tell the user about them:**
- possible duplicates
- people with no name
- a parent only a few years older than their child
- people not connected to the centre couple

When fixing a warning:
- Only change data when the fix is obvious, such as a typo in an id.
- Otherwise, ask the user which version is right instead of guessing. Dates and names come from family memory.

To check that the page itself still works after code changes, run `python3 serve.py` and open the printed URL.
