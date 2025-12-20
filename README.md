# MarkdownCompare

Compare two open Obsidian notes (split view) and highlight line-level differences.

![markdowncompare-preview.webp](src/markdowncompare-preview.webp)

## Usage

1. Open exactly 2 markdown panes (vertical or horizontal split).
2. Run the command `MarkdownCompare: compare two files`.
3. To remove highlighting, run `MarkdownCompare: clear compare highlights`.
4. To keep highlights updated while you edit, run `MarkdownCompare: toggle live compare`.
5. (Desktop) You can also toggle live compare from the status bar (scale icon - see the animation above).
6. (Desktop) The right sidebar panel lists differences and lets you jump between them.

Notes:
- Both panes must be in **Source mode** or **Live Preview** (Reading view can’t be decorated).
- It highlights changed/added/removed lines and also the exact changed characters for modified lines.



## Manual install

Copy `main.js`, `manifest.json`, and `styles.css` into:

`<Vault>/.obsidian/plugins/markdown-compare/`

Then turn this plugin on in the Community Plugins list.
