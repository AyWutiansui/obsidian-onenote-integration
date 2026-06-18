# OneNote Integration for Obsidian

Embed and edit OneNote notes directly inside Obsidian through a local COM interface with the OneNote desktop application. No cloud services, no Azure configuration required.

> **Windows only** — this plugin relies on the Win32 OneNote desktop COM API and native window embedding. macOS support is limited to basic sidebar browsing via AppleScript.

## Features

- **Live window embedding** — embeds the actual OneNote desktop window into your note, not a screenshot or iframe
- **Sidebar browser** — navigate notebooks, sections, and pages in a hierarchical tree view
- **Interactive page selector** — cascading dropdowns (notebook → section → page) in empty code blocks for quick page selection
- **Detach / reattach** — toggle any embedded OneNote window between inline and standalone
- **Ink content support** — detects handwritten pages and extracts InkDrawing / InkPicture preview images
- **Rich content parsing** — converts OneNote XML to HTML, including text, tables, images, and ink strokes
- **Smart occlusion detection** — automatically hides the OneNote window when Obsidian modals, the command palette, or hover previews cover the embed area
- **HiDPI aware** — full coordinate tracking on high-DPI and multi-monitor setups
- **Hierarchy caching** — 5-minute TTL cache to minimise COM round-trips

## Requirements

- **Windows** with OneNote desktop (Microsoft 365 or Office 2016+)
- **Obsidian** v1.0.0 or later
- OneNote desktop app must be running before using the plugin

## Installation

### From Obsidian Community Plugins (once published)

Search for **OneNote Integration** in the Community Plugins browser inside Obsidian and click Install.

### Manual installation

1. Build the plugin (see [Development](#development) below)
2. Copy `main.js`, `manifest.json`, `styles.css`, `onenote-repos.exe`, and `win-embed-overlay.exe` into `<vault>/.obsidian/plugins/obsidian-onenote-integration/`
3. Enable **OneNote Integration** in Obsidian → Settings → Community plugins

## Usage

### Browse OneNote content

Click the book icon in the left ribbon, or run **Open OneNote view** from the command palette.

### Embed a OneNote page

Place your cursor where you want the embed and run **Insert OneNote embed block**, or create a code block manually:

````markdown
```onenote
```
````

An interactive selector appears — choose a notebook, section, and page, then click **Load Page**. The live OneNote window will be embedded into your note.

### Specify a page directly

If you already know the page ID:

````markdown
```onenote
{12345678-ABCD-1234-ABCD-1234567890AB}
My Page Title
```
````

You can also paste a OneNote URL (the plugin extracts the `id` or `page-id` parameter):

````markdown
```onenote
https://onedrive.live.com/...?id={page-id}
```
````

## Commands

| Command | Description |
|---------|-------------|
| Open OneNote view | Open the sidebar panel to browse notebooks |
| Insert OneNote embed block | Insert an `onenote` code block at the cursor |
| Detach OneNote window | Detach the current embed into a standalone window |
| Quit OneNote | Close the OneNote desktop application |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Default Notebook | *(empty)* | Notebook name to open by default |
| Embed Aspect Ratio | 0.67 | Height-to-width ratio of the embed area (0.3 – 2.0). Reopen the note after changing. |

## How it works

### Local COM mode

The plugin communicates with the OneNote desktop application through the Windows COM interface. Core operations (navigation, page content retrieval, hierarchy queries) are executed via PowerShell scripts and native C helper programs. macOS provides basic support through AppleScript.

### Live window embedding

Rather than using iframes or screenshots, the plugin repositions the actual OneNote window onto the code block using a native C overlay:

1. **`win-embed-overlay.exe`** creates a borderless `WS_POPUP` overlay window composited by DWM for correct z-ordering with Obsidian. It receives real-time coordinate updates over stdin.
2. **`CoordinateTracker`** tracks the code block's screen-absolute position using four strategies: ResizeObserver, scroll listeners, MutationObserver, and rAF polling.
3. **Occlusion and boundary detection** hides the OneNote window when the embed area is covered by Obsidian UI or scrolled out of view.

### C helper programs

| Program | Purpose |
|---------|---------|
| `onenote-repos.exe` | COM operations: navigate to pages, get URLs, find/show windows, quit OneNote |
| `win-embed-overlay.exe` | Window embedding: create overlay, reparent/position-only modes, stdin command loop |

Both are compiled as standalone single-file executables with no external runtime dependencies.

## Development

### Prerequisites

- Node.js v16+
- Visual Studio Build Tools (for compiling C helpers — requires `vcvarsall x64`)

### Build

```bash
npm install
npm run build          # TypeScript check + esbuild production build
npm run dev            # Watch mode for development
npm test               # Run tests (vitest)
```

### Compile C helpers

Open a VS Build Tools command prompt and run:

```cmd
compile-repos.bat
```

Or manually:

```cmd
cl /O2 /EHsc repos.c user32.lib ole32.lib oleaut32.lib dwmapi.lib psapi.lib shell32.lib shcore.lib /Fe:onenote-repos.exe
cl /O2 /EHsc win-embed-overlay.c user32.lib psapi.lib dwmapi.lib shcore.lib /Fe:win-embed-overlay.exe
```

### Local test vault

Use `npm run build:test` to build and copy all artifacts to a sibling `test-vault` directory.

### Tech stack

- **TypeScript** — plugin body
- **C** — native window manipulation helpers
- **PowerShell** — COM interface calls
- **esbuild** — fast bundler (CJS, browser target)
- **vitest** — unit tests
- **Obsidian Plugin API** — plugin framework
- **Windows COM / DWM** — window embedding and compositing

## Known limitations

- **~1 frame latency** — a GPU compositor vs native window movement offset of ~16 ms @ 60 fps is inherent to the Windows DWM architecture
- **macOS is basic only** — sidebar browsing works; live window embedding is not supported
- **Handwritten notes** — OneNote InkDrawing ISF binaries cannot render in a browser; the plugin attempts to extract companion preview images but not all ink content has one
- **Single embed** — only one active embedding session at a time

## License

MIT
