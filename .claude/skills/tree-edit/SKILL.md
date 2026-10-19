---
name: tree-edit
description: Add, change or remove people and relationships in the family tree (data/family.json) from a plain description, e.g. "add my grandma Maria, born 1940, died 2015, married to Ion since 1960". Use whenever the user talks about family members, dates, marriages or relationships.
---

# Edit the family tree data

All data lives in `data/family.json`. Edit it directly, then validate and commit.

## Format

```json
{
  "version": 1,
  "title": "Our Family Tree",
  "root": "u0",
  "people": {
    "p0": { "name": "Ernest Popovici", "gender": "m", "birth": "1996-04-12" },
    "p7": { "name": "Maria Rusu", "birthName": "Ionescu", "gender": "f", "birth": "~1940", "death": "2015", "notes": "..." }
  },
  "unions": {
    "u0": { "partners": ["p0", "p1"], "children": [], "status": "partner", "start": "2019" }
  }
}
```

- **people**: `name` is the full name. Everything else is optional:
  - `birthName` is the maiden or birth surname, if different.
  - `gender` is `"m"` or `"f"`. It is used for words like "grandmother" vs "grandfather".
  - `birth` and `death` are dates (format below).
  - `deceased: true` marks someone who has died when the date of death is unknown. A `death` date already implies it.
  - `notes` is free text.
- **unions** are couples and their children:
  - `partners` holds 0–2 person ids.
  - `children` lists the children in birth order.
  - `status` is `"partner"` (together), `"married"`, `"separated"` (shown as "Not together anymore") or `"divorced"`. Missing means together.
  - `start` and `end` are optional years or dates. The user rarely knows them, so never ask for them.
  - A relationship ended by death needs no `end`: keep the status (e.g. `"married"`) and give the person a `death` date. The page shows "until X's death".
  - Every person is a child in at most one union.
  - Siblings whose parents are unknown share a union with `"partners": []`.
- **root** is the union shown in the centre (Ernest and his partner). Don't change it unless asked.
- **Dates** are `"YYYY"`, `"YYYY-MM"` or `"YYYY-MM-DD"`. Prefix with `~` for approximate (`"~1915"`). Only use the precision the user actually gave.
- **IDs** are `p` or `u` followed by a few lowercase letters or digits, unique within the file. Never reuse or renumber existing ids.

## How to add relatives

- **Parent** of X: if X's parent union exists and has fewer than 2 partners, add the new person to its `partners`. Otherwise create `{ "partners": [new], "children": [X] }`.
- **Partner** of X: create a new union `{ "partners": [X, new], "children": [], "status": "married" }`, or use whatever status the user said.
- **Child** of X and Y: append to the union where both are partners. If the other parent is unknown, use a union whose only partner is X.
- **Sibling** of X: add to X's parent union's `children`. If X has no parent union, create one with `"partners": []` and both children.
- **Half-sibling** of X through parent P: put them in a different union of P (with the other parent, or `"partners": [P]` if unknown). Half and step relationships come from the structure, so never store them as a label.
- **Someone with several partners** (remarriage, divorce, widowhood) gets one union per relationship, each with its own children.
- Keep `children` sorted by birth year when years are known.

## Steps

1. Read `data/family.json`.
2. Before adding anyone, search the file for people with similar names. Reuse an existing person instead of creating a duplicate.
3. Make the edit. Keep the JSON pretty-printed with 2 spaces and UTF-8 characters (no `\u` escapes), and end the file with a newline.
4. Ask only when it is truly ambiguous, for example which side of the family someone is on. For missing details, leave the fields out instead of guessing.
5. Run `python3 scripts/validate.py` and fix any errors.
6. Commit and push with the `commit` skill, naming the people in the message.
