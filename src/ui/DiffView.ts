import { ItemView, type WorkspaceLeaf } from "obsidian";
import type MarkdownComparePlugin from "../main";
import { MARKDOWNCOMPARE_DIFF_VIEW_TYPE } from "./constants";

export type DiffHunkKind = "changed" | "added" | "removed";

export interface DiffHunk {
	kind: DiffHunkKind;
	leftLine: number | null;
	rightLine: number | null;
	leftCount: number;
	rightCount: number;
	preview: string;
	leftHeader: string | null;
	rightHeader: string | null;
}

export interface DiffState {
	leftPath: string;
	rightPath: string;
	hunks: DiffHunk[];
}

export class MarkdownCompareDiffView extends ItemView {
	private plugin: MarkdownComparePlugin;
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MarkdownComparePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return MARKDOWNCOMPARE_DIFF_VIEW_TYPE;
	}

	getDisplayText() {
		return "MarkdownCompare";
	}

	getIcon() {
		return "scale";
	}

	async onOpen() {
		this.unsubscribe = this.plugin.onDiffStateChange((state) => {
			this.render(state);
		});
		this.render(this.plugin.getDiffState());
	}

	async onClose() {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private render(state: DiffState | null) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("markdowncompare-diffview");

		const header = contentEl.createDiv({ cls: "markdowncompare-diffview-header" });
		header.createDiv({
			text: "MarkdownCompare",
			cls: "markdowncompare-diffview-title",
		});

		if (!state) {
			contentEl.createDiv({
				text: "Run “MarkdownCompare: compare two files” to populate this list.",
				cls: "markdowncompare-diffview-empty",
			});
			return;
		}

		const files = contentEl.createDiv({ cls: "markdowncompare-diffview-files" });
		const leftFile = files.createDiv({
			text: state.leftPath,
			cls: "markdowncompare-diffview-file",
		});
		const rightFile = files.createDiv({
			text: state.rightPath,
			cls: "markdowncompare-diffview-file",
		});

		leftFile.setAttr("role", "button");
		leftFile.setAttr("tabindex", "0");
		leftFile.setAttr("title", "Reveal in file explorer");
		rightFile.setAttr("role", "button");
		rightFile.setAttr("tabindex", "0");
		rightFile.setAttr("title", "Reveal in file explorer");

		const revealLeft = () => this.plugin.revealFileInFileExplorer(state.leftPath);
		const revealRight = () => this.plugin.revealFileInFileExplorer(state.rightPath);

		leftFile.addEventListener("click", revealLeft);
		rightFile.addEventListener("click", revealRight);

		leftFile.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key !== "Enter" && evt.key !== " ") return;
			evt.preventDefault();
			revealLeft();
		});

		rightFile.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key !== "Enter" && evt.key !== " ") return;
			evt.preventDefault();
			revealRight();
		});

		const list = contentEl.createDiv({ cls: "markdowncompare-diffview-list" });
		if (state.hunks.length === 0) {
			list.createDiv({ text: "No differences.", cls: "markdowncompare-diffview-empty" });
			return;
		}

		let lastHeaderKey: string | null = null;

		for (const hunk of state.hunks) {
			const headerKey = `${hunk.leftHeader ?? ""}||${hunk.rightHeader ?? ""}`;
			if (headerKey !== lastHeaderKey) {
				lastHeaderKey = headerKey;

				const section = list.createDiv({
					cls: "markdowncompare-diffview-section",
				});

				section.createDiv({
					text: hunk.leftHeader ?? "—",
					cls: "markdowncompare-diffview-section-cell",
				});
				section.createDiv({
					text: hunk.rightHeader ?? "—",
					cls: "markdowncompare-diffview-section-cell",
				});
			}

			const row = list.createDiv({
				cls: `markdowncompare-diffview-row markdowncompare-diffview-row-${hunk.kind}`,
			});

			const leftText =
				hunk.leftLine != null ? `L${hunk.leftLine}` : "—";
			const rightText =
				hunk.rightLine != null ? `R${hunk.rightLine}` : "—";

			row.createDiv({ text: leftText, cls: "markdowncompare-diffview-cell" });
			row.createDiv({ text: rightText, cls: "markdowncompare-diffview-cell" });

			row.createDiv({
				text: hunk.preview.length > 0 ? hunk.preview : "(blank)",
				cls: "markdowncompare-diffview-cell markdowncompare-diffview-cell-label",
			});

			row.setAttr("role", "button");
			row.setAttr("tabindex", "0");
			const activate = () => this.plugin.scrollToDiffHunk(hunk);
			row.addEventListener("click", activate);
			row.addEventListener("keydown", (evt: KeyboardEvent) => {
				if (evt.key !== "Enter" && evt.key !== " ") return;
				evt.preventDefault();
				activate();
			});
		}
	}
}
