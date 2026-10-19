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

- **Focus mode:** the tree shows the family around one person, about two steps. Click any card to move the focus there; the tree glides into place. Click the person in focus (or the small ✎/ⓘ on any card, or double-click) to open their window. "Back to …" at the top returns to the two of you. A "+N" bubble at the edge means more family that way; click it to move there.
- **Move:** drag, or scroll with two fingers.
- **Zoom:** pinch, ⌘ + scroll, or the +/− buttons. Zoomed out, cards show big names, then just initials.
- **Hover** over someone to light up their closest family.
- **Hide a branch:** hover a card and click the **−** on its left to hide everyone who is only connected through that person (others stay). A **+N** bubble under the card brings them back.
- **Search:** type a name in the search box, or press `/`.
- **Birthdays:** the cake button shows upcoming birthdays and anniversaries.
- **Downloads:** the ⋯ menu saves the tree as an image, as GEDCOM (for other genealogy apps), or as raw data.

**⚙ Settings** (saved per browser) switch each of these on or off:

| Setting | What it does |
| --- | --- |
| Focus mode (1, 2 or 3 steps) | Show the family around one person instead of everyone |
| Smaller further away | Cards shrink the more distant the relative |
| Less detail when zoomed out | Big names, then initials, as you zoom out |
| Highlight on hover | Light up someone's closest family |
| Colour each family | Each family's lines get their own colour |
| Hide-branch buttons (−) | The smart hide described above |
| Fewer crossing lines | Rearranges families to reduce crossings |
| Circle layout | The tree as rings (oldest in the middle); scroll to turn it |

The avatar colour shows whether someone is a man (blue) or a woman (pink); grey means not set. People who have passed away have a soft grey card and paler colours, and their years read like 1940 – 2019.

## Data

Everything is in `data/family.json`. People are listed once. Couples and their children are grouped as "unions". Run `python3 scripts/validate.py` to check the file for mistakes.
