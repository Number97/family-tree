# Family tree

Our family tree, as a simple web page.

- **Online (view only):** https://number97.github.io/family-tree/
- **On this Mac (view and edit):** double-click `start.command`

## Editing

1. Double-click **`start.command`**. A browser tab opens with the tree. Leave the small terminal window open while you work.
2. Hover over anyone and click the **+** next to their card to add a parent, partner, child or sibling.
3. Click a person to change their name, dates or notes in the side panel.
   - Dates can be just a year (`1952`), an approximate year (`c. 1950`) or a full date (`14.03.1952`).
   - Tick **Passed away** if someone has died and the date is unknown.
4. **Couples:** every couple has a small dot in the middle of their line. Click it to choose **Together**, **Married** or **Not together anymore**. Couples who aren't together anymore get a pale dotted line. Dates are optional: "add years" in a person's window if you know them. A marriage ended by death needs nothing extra.
   - Half-siblings: use **Add → Half-sibling**. For someone already in the tree, change **Child of …** in their window to the right couple, or to one parent only.
   - Adding a partner never makes them a parent of existing children. To add someone's other parent, use **Add → Parent** on the child.
5. Everything saves automatically to `data/family.json`. Undo with ⌘Z.
6. Press **Publish** when you're happy. This saves a version to GitHub, and the online page updates about a minute later.

To stop, close the terminal window (or press Ctrl+C in it).

## Getting around

- **Move:** drag, or scroll with two fingers.
- **Zoom:** pinch, ⌘ + scroll, or the +/− buttons.
- **Fold a branch:** hover over a couple and click the small arrow under them to fold their children away, or the arrow above a person to fold away their parents. A folded branch shows a **+N** bubble; click it to unfold.
- **Search:** type a name in the search box, or press `/`.
- **Focus on someone:** click a person, then **Centre the tree here**. Use the button at the top to come back.
- **Birthdays:** the cake button shows upcoming birthdays and anniversaries.
- **Downloads:** the ⋯ menu saves the tree as an image, as GEDCOM (for other genealogy apps), or as raw data.

The avatar colour shows whether someone is a man (blue) or a woman (pink); grey means not set. People who have passed away have a soft grey card and paler colours, and their years read like 1940 – 2019.

## Data

Everything is in `data/family.json`. People are listed once. Couples and their children are grouped as "unions". Run `python3 scripts/validate.py` to check the file for mistakes.
