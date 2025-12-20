# MarkdownCompare

Compare two open notes (split view) and highlight line-level differences, similar to Notepad++ Compare.

## Usage

1. Open exactly 2 markdown panes (vertical or horizontal split).
2. Run the command `MarkdownCompare: compare two files`.
3. To remove highlighting, run `MarkdownCompare: clear compare highlights`.
4. To keep highlights updated while you edit, run `MarkdownCompare: toggle live compare`.
5. (Desktop) You can also toggle live compare from the status bar (scale icon).
6. (Desktop) The right sidebar panel lists differences and lets you jump between them.

Notes:
- Both panes must be in **Source mode** or **Live Preview** (Reading view can’t be decorated).
- It highlights changed/added/removed lines and also the exact changed characters for modified lines.

## Development

```bash
npm install
npm run dev
```

### Syncing builds into a vault (optional)

If `MARKDOWNCOMPARE_PLUGIN_DIR` is set, builds are copied into that folder after every build.

If `MARKDOWNCOMPARE_PLUGIN_DIR` is not set, the build script will auto-sync only if this folder already exists:

`$HOME/Documents/Obsidian Vault/.obsidian/plugins/markdown-compare`

## Build

```bash
npm run build
```

## Manual install (for testing)

Copy `main.js`, `manifest.json`, and `styles.css` into:

`<Vault>/.obsidian/plugins/markdown-compare/`
