# Badge Pickup — Double My Sales Bootcamp (CA)

Self-serve badge lookup for Insurance Sales Lab events.

- **Attendee page:** `https://rob261.github.io/badge-pickup/` — scan the QR code, enter your email, get your booth and the agency owner your badge is filed under.
- **Staff page:** `https://rob261.github.io/badge-pickup/staff.html` — PIN-protected list of groups; mark a packet handed out, or undo.

## How it fits together

| Piece | Where it lives | What it does |
|---|---|---|
| `index.html`, `staff.html`, `styles.css`, `config.js` | This repo (GitHub Pages) | The pages people see. No data and no secrets in here. |
| `apps-script/Code.gs` | The badge Google Sheet → Extensions → Apps Script | Reads the booth tabs, writes the **Pickups** tab, checks the staff PIN. |
| `Config` (in Apps Script only) | Same Apps Script project | Event name, booth tabs, and the real staff PIN. Start from `apps-script/Config.example.gs`. |

The sheet is read live, so edits to names or emails take effect immediately.

## Updating

- **Pages:** edit the files here; GitHub Pages republishes in about a minute.
- **Backend:** paste the new `Code.gs` into Apps Script, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Never make a *New deployment*: it changes the URL in `config.js` and the printed QR codes.

## Security notes

- The staff PIN only exists in the Apps Script `Config` file. Don't commit it here — this repo is public.
- 5 wrong PINs locks new staff sign-ins for 10 minutes. Staff already signed in keep working.
- Name search needs a first and last name and returns at most 3 people, so the list can't be browsed.
- The script is limited to the one sheet it's attached to (`@OnlyCurrentDoc`).
