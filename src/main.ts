import { Notice, Platform, Plugin, TFile, setIcon } from "obsidian";
import { MarkdownCompareDiffView, type DiffHunk, type DiffState } from "./ui/DiffView";
import { MARKDOWNCOMPARE_DIFF_VIEW_TYPE } from "./ui/constants";
import { registerMarkdownCompareCommands } from "./commands/registerCommands";
import { diffHighlightExtension } from "./editor/diffHighlight";
import {
	clearAllCompareHighlights,
	compareTwoVisibleMarkdownViews,
} from "./commands/compareTwoVisibleMarkdownViews";
import {
	scrollBothEditorsToLines,
	startScrollSync,
	type CompareTargets,
} from "./scroll/scrollSync";
import {
	clearJumpLineHighlights,
	setJumpLineHighlights,
} from "./editor/diffHighlight";

export default class MarkdownComparePlugin extends Plugin {
	private liveCompareIntervalId: number | null = null;
	private statusBarToggleEl: HTMLElement | null = null;
	private diffState: DiffState | null = null;
	private diffStateListeners = new Set<(state: DiffState | null) => void>();
	private compareTargets: CompareTargets | null = null;
	private stopScrollSync: (() => void) | null = null;
	private clearJumpTimeoutId: number | null = null;

	async onload() {
		this.registerView(MARKDOWNCOMPARE_DIFF_VIEW_TYPE, (leaf) => {
			return new MarkdownCompareDiffView(leaf, this);
		});

		this.registerEditorExtension(diffHighlightExtension);
		registerMarkdownCompareCommands(this);

		if (!Platform.isMobile) {
			this.statusBarToggleEl = this.addStatusBarItem();
			this.statusBarToggleEl.addClass("markdowncompare-status-toggle");
			this.statusBarToggleEl.setAttr("role", "button");
			this.statusBarToggleEl.setAttr("tabindex", "0");
			setIcon(this.statusBarToggleEl, "scale");

			const onActivate = () => this.toggleLiveCompare();
			this.registerDomEvent(this.statusBarToggleEl, "click", onActivate);
			this.registerDomEvent(this.statusBarToggleEl, "keydown", (evt: KeyboardEvent) => {
				if (evt.key !== "Enter" && evt.key !== " ") return;
				evt.preventDefault();
				onActivate();
			});

			this.updateStatusBar();
		}

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				if (this.liveCompareIntervalId == null) return;
				this.refreshLiveCompare();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.liveCompareIntervalId == null) return;
				this.refreshLiveCompare();
			}),
		);
	}

	onunload() {
		this.stopLiveCompare();
		clearAllCompareHighlights(this);
		this.stopScrollSync?.();
		this.stopScrollSync = null;
		if (this.clearJumpTimeoutId != null) window.clearTimeout(this.clearJumpTimeoutId);
		this.clearJumpTimeoutId = null;
	}

	toggleLiveCompare() {
		if (this.liveCompareIntervalId == null) {
			this.startLiveCompare();
		} else {
			this.stopLiveCompare();
			clearAllCompareHighlights(this);
			new Notice("MarkdownCompare: live compare off");
		}
		this.updateStatusBar();
	}

	private startLiveCompare() {
		if (this.liveCompareIntervalId != null) return;

		new Notice("MarkdownCompare: live compare on");
		void this.ensureDiffView();
		this.refreshLiveCompare();

		this.liveCompareIntervalId = window.setInterval(() => {
			this.refreshLiveCompare();
		}, 2000);
	}

	private stopLiveCompare() {
		if (this.liveCompareIntervalId == null) return;
		window.clearInterval(this.liveCompareIntervalId);
		this.liveCompareIntervalId = null;
	}

	private refreshLiveCompare() {
		compareTwoVisibleMarkdownViews(this, {
			showNotice: false,
			clearWhenNotComparable: true,
		});
	}

	private updateStatusBar() {
		if (!this.statusBarToggleEl) return;
		const on = this.liveCompareIntervalId != null;
		this.statusBarToggleEl.toggleClass("is-active", on);
		this.statusBarToggleEl.setAttr(
			"aria-label",
			on ? "MarkdownCompare: live compare on" : "MarkdownCompare: live compare off",
		);
		this.statusBarToggleEl.setAttr(
			"title",
			on ? "MarkdownCompare: live compare on" : "MarkdownCompare: live compare off",
		);
	}

	getDiffState() {
		return this.diffState;
	}

	setDiffState(state: DiffState | null) {
		this.diffState = state;
		for (const listener of this.diffStateListeners) listener(state);
	}

	onDiffStateChange(listener: (state: DiffState | null) => void) {
		this.diffStateListeners.add(listener);
		return () => {
			this.diffStateListeners.delete(listener);
		};
	}

	setCompareTargets(targets: CompareTargets | null) {
		if (!targets && !this.compareTargets) return;

		if (
			targets &&
			this.compareTargets &&
			targets.leftEditorView === this.compareTargets.leftEditorView &&
			targets.rightEditorView === this.compareTargets.rightEditorView
		) {
			this.compareTargets = targets;
			return;
		}

		this.compareTargets = targets;
		this.stopScrollSync?.();
		this.stopScrollSync = null;

		if (!targets) return;
		this.stopScrollSync = startScrollSync(
			targets.leftEditorView,
			targets.rightEditorView,
		);
	}

	scrollToDiffHunk(hunk: DiffHunk) {
		if (!this.compareTargets) return;
		const leftLine = hunk.leftLine ?? hunk.rightLine ?? 1;
		const rightLine = hunk.rightLine ?? hunk.leftLine ?? 1;
		scrollBothEditorsToLines(
			this.compareTargets.leftEditorView,
			this.compareTargets.rightEditorView,
			leftLine,
			rightLine,
		);
		this.pulseJumpHighlight(leftLine, rightLine);
	}

	private pulseJumpHighlight(leftLine: number, rightLine: number) {
		if (!this.compareTargets) return;

		if (this.clearJumpTimeoutId != null) window.clearTimeout(this.clearJumpTimeoutId);
		this.clearJumpTimeoutId = null;

		setJumpLineHighlights(this.compareTargets.leftEditorView, [leftLine]);
		setJumpLineHighlights(this.compareTargets.rightEditorView, [rightLine]);

		this.clearJumpTimeoutId = window.setTimeout(() => {
			if (!this.compareTargets) return;
			clearJumpLineHighlights(this.compareTargets.leftEditorView);
			clearJumpLineHighlights(this.compareTargets.rightEditorView);
			this.clearJumpTimeoutId = null;
		}, 500);
	}

	async ensureDiffView() {
		const workspace = this.app.workspace as any;
		if (typeof workspace.ensureSideLeaf === "function") {
			await workspace.ensureSideLeaf(MARKDOWNCOMPARE_DIFF_VIEW_TYPE, "right", {
				active: false,
				reveal: true,
				split: false,
			});
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: MARKDOWNCOMPARE_DIFF_VIEW_TYPE, active: false });
	}

	revealFileInFileExplorer(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice("MarkdownCompare: file not found in vault");
			return;
		}

		const candidates: any[] = [];

		try {
			const leaves = this.app.workspace.getLeavesOfType("file-explorer");
			for (const leaf of leaves) candidates.push(leaf.view);
		} catch {
			// ignore
		}

		const internal = (this.app as any).internalPlugins?.getPluginById?.("file-explorer");
		const instance = internal?.instance;
		if (instance) {
			candidates.push(instance.view);
			candidates.push(instance.fileExplorerView);
			candidates.push(instance);
			candidates.push(instance?.views?.fileExplorer);
		}

		for (const view of candidates) {
			if (!view) continue;
			const reveal = view.revealInFolder;
			if (typeof reveal !== "function") continue;

			try {
				reveal.call(view, file);
				return;
			} catch {
				try {
					reveal.call(view, file, true);
					return;
				} catch {
					// ignore
				}
			}
		}

		void this.app.workspace.getLeaf(false).openFile(file);
	}
}
