# Graph View

The graph view visualises all notes in the vault as nodes, with edges representing wikilinks between them.

Open it with the **⬡** button in the top bar. Click any node to navigate to that note.

---

## Controls

| Action | How |
|---|---|
| Pan | Click + drag background |
| Zoom | Scroll wheel |
| Pin node | Click + drag a node (releases on mouse-up) |
| Navigate to note | Click a node |

---

## Settings panel

Click **Settings** (top-right of the graph) to open the side panel. It has three sections:

### Forces

Controls the physics simulation:

- **Center force** — gravity pulling nodes toward the centre
- **Repel force** — how strongly nodes push each other apart
- **Link force** — spring strength along edges
- **Link distance** — rest length of edges in pixels
- **Collision** — extra radius to prevent node overlap

### Display

- **Node size** — multiplier for all node radii (larger = more backlinks)
- **Label fade zoom** — labels are hidden below this zoom level (0 = always show)
- **Show labels / arrows / orphans** — toggles

### Filters

Add rules to **colour** or **hide** nodes based on name/path, tag, or modification date.

---

## Filter rules

### Types

| Type | Matches against |
|---|---|
| **Name / path** | The note's display name **and** its full vault path |
| **Tag** | YAML frontmatter tags (`tags: [foo, bar]`) |
| **Date modified** | File modification time (from/to date range) |

### Actions

- **Color** — paint matching nodes with the chosen colour
- **Hide** — remove matching nodes (and their edges) from the graph

---

## Name / path filter — regex syntax

The pattern field accepts a **regular expression** (not a glob). It is fully anchored: `^(?:<pattern>)$`.

### Common patterns

| Goal | Pattern |
|---|---|
| All files under a folder | `TEST/.*` |
| Files anywhere containing a word | `.*journal.*` |
| Exact note name | `inbox` |
| Multiple names (OR) | `todo\|inbox\|journal` |
| Any note | `.*` |

### Folder filtering

To colour/hide all notes under `TEST/`:

1. Open Settings → Filters → **+ Add**
2. Type: **Name / path**, Action: **Color** (or Hide)
3. Pattern: `TEST/.*`

This works because `node.id` is the full vault-relative path (e.g. `TEST/note.md`, `TEST/sub/other.md`), and `.*` means "any characters" in regex.

> **Tip:** Glob-style `*` does **not** work. In regex `*` means "zero or more of the preceding character". Use `.*` for "match anything".

---

## Tag filter

Tags are read from YAML frontmatter:

```yaml
---
tags: [work, project]
---
```

The pattern is also a regex anchored to each tag individually. Examples:

- `work` — exact tag
- `work|project` — either tag
- `proj.*` — tags starting with "proj"
