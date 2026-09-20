# 📖 Learning Diary

A personal technical learning diary — record what you learn every day and find it later.

Built with plain HTML, CSS, and vanilla JavaScript. No framework, no backend, no build step.

---

## Features

- **Daily notes** — write what you learned, grouped by date
- **Categories** — organise by topic (.NET, Angular, MongoDB, Azure, etc.)
- **Images** — attach screenshots and diagrams to any note
- **Search** — find notes by content or category
- **Filters** — by month, year, and category
- **Pagination** — 10 notes per page
- **Dark / Light mode** — saved to browser preference
- **Backup & restore** — export all data to a JSON file, import it anywhere
- **IndexedDB storage** — all data stays in your browser, nothing is sent anywhere
- **Fully responsive** — works on desktop, tablet, and mobile

---

## Quick Start (local)

No build step needed. Just serve the files with any static web server.

**VS Code Live Server** (recommended):
1. Open the project folder in VS Code
2. Right-click `index.html` → **Open with Live Server**

**Python** (if installed):
```bash
cd learning-diary
python -m http.server 8080
```
Then open `http://localhost:8080`

> Opening `index.html` directly via `file://` works in most browsers but may block some features in strict security contexts. A local server is preferred.

---

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `learning-diary`)
2. Push all files to the `main` branch:
   ```
   index.html
   css/styles.css
   js/db.js
   js/ui.js
   js/images.js
   js/categories.js
   js/notes.js
   js/dashboard.js
   js/backup.js
   js/app.js
   ```
3. Go to **Settings → Pages**
4. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`
5. Save — your diary will be live at `https://yourusername.github.io/learning-diary/`

---

## Data Architecture

```
Application code  →  GitHub Pages (public)
User diary data   →  Browser IndexedDB (private, local)
Backup file       →  Exported JSON (you own it)
```

Your notes never leave your device unless you export them.

---

## Backup Advice

IndexedDB data lives in your browser profile. It can be cleared by:
- Clearing browser data / cookies
- Reinstalling the browser
- Browser storage pressure (Safari in particular)

**Export a backup regularly** from the Settings page. The exported `.json` file contains all your notes, categories, and images (images are base64-encoded inside the JSON).

To move data to another device or browser: export on the old one, import on the new one.

---

## File Structure

```
learning-diary/
├── index.html          Main HTML shell
├── css/
│   └── styles.css      Complete design system + component styles
├── js/
│   ├── db.js           IndexedDB abstraction layer
│   ├── ui.js           Modals, toasts, theme, date utilities
│   ├── images.js       Image upload, compression, preview
│   ├── categories.js   Category CRUD
│   ├── notes.js        Note CRUD and view modal
│   ├── dashboard.js    Diary page: filters, search, table, pagination
│   ├── backup.js       Export and import backup
│   └── app.js          Bootstrap — wires everything together
└── README.md
```

---

## Browser Support

Any modern browser: Chrome, Edge, Firefox, Safari 14+.

IndexedDB and the File API are required. Both are available in all modern browsers.

---

## Version

1.0 — Initial release
