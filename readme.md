<p align="center">
  <img src="assets/taco-logo.svg" alt="taco" width="320">
</p>

<h3 align="center">A <em>soft shell</em> around Jira.</h3>

<p align="center">
  <code>// everything you already use,</code><br>
  <em>just easier to hold.</em>
</p>

---

## Why taco

| | |
|---|---|
| **AI FROM DAY ZERO** — *we used AI, so you don't have to.* | Before you ever opened taco, the AI was already done. You just get the shell. Not baked in — baked with AI. |
| **3X** — *making you a 3× developer.* | Creating a ticket in taco saves up to 20 clicks. Three times more productive, letting you waste your time where it really matters. |
| **MILD** — *same dull flavor.* | taco doesn't make Jira hot; it just makes it easier to swallow. |

## What it does

`//` mounts into Jira Cloud (`*.atlassian.net`) and adds a *Taco* button to the sidebar.

- **Overview table** — GitHub Projects–style grouping by status / epic / assignee, with live editing inline.
- **Detail sidebar** — status, assignee, parent (navigable), sprint, domain, components, children, comments — all editable without leaving the page.
- **Create dialog** — favorite-driven pickers for users, domains, statuses, components; sprint quick-buttons plus a full dropdown.
- **Smart filters** — text search bypasses the other filters so you can always find a ticket.
- **JQL pre-filter** — when product-domain favorites are set, the JQL is augmented server-side so you only fetch what you care about.
- **Config import/export** — JSON copy-paste so a coworker can hand off their setup in 10 seconds.

## Install

`//` taco is a userscript. Pick a manager, then add taco.

**Step 1 — A userscript manager**

| Browser | Manager |
|---|---|
| Chrome / Edge | [Violentmonkey](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) |
| Firefox | [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) |
| Safari | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) |

**Step 2 — Add taco**

Click the latest release: **[taco.user.js](https://github.com/OWNER/REPO/releases/latest/download/taco.user.js)**

Your manager will prompt to install. Done.

## First run

1. Open any `*.atlassian.net` page.
2. Click the **Taco** button in the sidebar (or `Cmd/Ctrl + Shift + J`).
3. Open settings (⚙ in the toolbar) and set your **project key** (e.g. `ABC`).
4. Optionally favorite people, product domains, and statuses for tighter pickers.

## Configuration

All config lives in browser `localStorage` under `taco.config`. From the **Settings** dialog you can:

- Pick **favorites** — people, product domains, statuses — and taco uses them everywhere a picker appears.
- Choose a **sprint source** (which Agile board's sprints drive the *Current sprint* filter).
- Star a **default status** for new tickets.
- **Show JSON** in the header to copy your whole config to the clipboard, or paste someone else's in.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # one-shot production build → dist/taco.user.js
```

Drag `dist/taco.user.js` into your userscript manager to test changes locally.

### Stack

`//` React 18 · TypeScript · Vite · TanStack Query · TanStack Table · shadow DOM for style isolation.

### Releases

Pushing to `master` runs `.github/workflows/release.yml`:

- Reads the latest release tag, bumps the patch.
- Builds `dist/taco.user.js` with the new version baked into the userscript header.
- Creates a GitHub Release with the userscript attached.

Bump `package.json` manually for a major / minor release; the workflow takes the higher of the two as the next version.

## License

`//` MIT. See [LICENSE](LICENSE).

---

<p align="center">
  Made with the same love as a Santa Maria burrito spice mix
  &nbsp;·&nbsp;
  🔴 🟡 🟢
</p>
# taco
