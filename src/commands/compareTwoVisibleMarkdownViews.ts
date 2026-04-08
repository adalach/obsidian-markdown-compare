import { MarkdownView, Notice, WorkspaceSidedock } from "obsidian";
import type MarkdownComparePlugin from "../main";
import type {
	DiffHighlightSpec,
	DiffLineDecoration,
	DiffMarkDecoration,
} from "../editor/diffHighlight";
import {
	clearDiffHighlights,
	getEditorViewFromMarkdownView,
	setDiffHighlights,
} from "../editor/diffHighlight";
import { diffLinesMyers } from "../diff/myersLineDiff";
import { diffMyers } from "../diff/myersDiff";
import type { DiffHunk } from "../ui/DiffView";
import { computeHeadingAnchors, type HeadingAnchor } from "../scroll/headingAnchors";

const ADDED_CLASS = "markdowncompare-diff-added";
const REMOVED_CLASS = "markdowncompare-diff-removed";
const CHANGED_CLASS = "markdowncompare-diff-changed";
const ADDED_CHAR_CLASS = "markdowncompare-diff-added-char";
const REMOVED_CHAR_CLASS = "markdowncompare-diff-removed-char";

function splitLines(text: string): string[] {
	return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Filter a list of heading anchors (sorted by leftLine) to a strictly
 * monotone-increasing subsequence in rightLine. This is required before
 * inserting sentinels so that both augmented arrays receive sentinels in
 * document order.
 */
function filterMonotoneAnchors(anchors: HeadingAnchor[]): HeadingAnchor[] {
	const result: HeadingAnchor[] = [];
	let maxRight = 0;
	for (const anchor of anchors) {
		if (anchor.rightLine > maxRight) {
			result.push(anchor);
			maxRight = anchor.rightLine;
		}
	}
	return result;
}

function computeHighlights(
	leftText: string,
	rightText: string,
): { left: DiffHighlightSpec; right: DiffHighlightSpec; hunks: DiffHunk[] } {
	const leftLines = splitLines(leftText);
	const rightLines = splitLines(rightText);

	// Compute section anchors and use them to prevent Myers from matching lines
	// across section boundaries. A unique sentinel string is inserted just before
	// each matched heading in both augmented arrays. Because sentinels are unique,
	// Myers must treat them as "equal", effectively locking the alignment at each
	// matched heading and confining the diff to content within the same section.
	const anchors = filterMonotoneAnchors(computeHeadingAnchors(leftText, rightText));

	const augLeft: string[] = [];
	const augRight: string[] = [];
	// Map from augmented-array index → 1-based original line number.
	// null means the entry is a sentinel (no corresponding document line).
	const leftLineOf: (number | null)[] = [];
	const rightLineOf: (number | null)[] = [];

	let li = 0; // 0-based cursor into leftLines
	let ri = 0;

	for (let ai = 0; ai < anchors.length; ai++) {
		const anchor = anchors[ai]!;
		const sentinel = `\x00section-boundary\x00${ai}\x00`;

		while (li < anchor.leftLine - 1) {
			augLeft.push(leftLines[li]!);
			leftLineOf.push(li + 1);
			li++;
		}
		while (ri < anchor.rightLine - 1) {
			augRight.push(rightLines[ri]!);
			rightLineOf.push(ri + 1);
			ri++;
		}

		augLeft.push(sentinel);
		augRight.push(sentinel);
		leftLineOf.push(null);
		rightLineOf.push(null);

		augLeft.push(leftLines[li]!);
		leftLineOf.push(li + 1);
		li++;

		augRight.push(rightLines[ri]!);
		rightLineOf.push(ri + 1);
		ri++;
	}

	while (li < leftLines.length) {
		augLeft.push(leftLines[li]!);
		leftLineOf.push(li + 1);
		li++;
	}
	while (ri < rightLines.length) {
		augRight.push(rightLines[ri]!);
		rightLineOf.push(ri + 1);
		ri++;
	}

	const edits = diffLinesMyers(augLeft, augRight);

	const leftDecorations: DiffLineDecoration[] = [];
	const rightDecorations: DiffLineDecoration[] = [];
	const leftMarks: DiffMarkDecoration[] = [];
	const rightMarks: DiffMarkDecoration[] = [];
	const hunks: DiffHunk[] = [];

	let augLi = 0;
	let augRi = 0;
	// Last-seen original line numbers — used as fallback context in flush().
	let ctxLeft = 1;
	let ctxRight = 1;
	let pendingDeletes: number[] = [];
	let pendingInserts: number[] = [];

	const getHeaderForLine = (lines: string[], line: number) => {
		const clamped = Math.max(1, Math.min(line, lines.length));
		for (let i = clamped; i >= 1; i--) {
			const raw = lines[i - 1] ?? "";
			const match = raw.match(/^(#{1,6})\s+(.*)$/);
			if (!match) continue;
			const level = match[1] ?? "";
			const text = (match[2] ?? "").trim();
			return `${level} ${text}`.trim();
		}
		return null;
	};

	const getPreview = (kind: DiffHunk["kind"], leftLineN: number | null, rightLineN: number | null) => {
		const raw =
			kind === "added"
				? (rightLineN != null ? (rightLines[rightLineN - 1] ?? "") : "")
				: kind === "removed"
					? (leftLineN != null ? (leftLines[leftLineN - 1] ?? "") : "")
					: (rightLineN != null ? (rightLines[rightLineN - 1] ?? "") : (leftLineN != null ? (leftLines[leftLineN - 1] ?? "") : ""));

		return raw.replace(/\t/g, "    ").slice(0, 80);
	};

	const flush = () => {
		if (pendingDeletes.length > 0 && pendingInserts.length > 0) {
			const leftStart = pendingDeletes[0] ?? null;
			const rightStart = pendingInserts[0] ?? null;
			const leftContextLine = leftStart ?? Math.max(1, ctxLeft);
			const rightContextLine = rightStart ?? Math.max(1, ctxRight);
			hunks.push({
				kind: "changed",
				leftLine: leftStart,
				rightLine: rightStart,
				leftCount: pendingDeletes.length,
				rightCount: pendingInserts.length,
				preview: getPreview("changed", leftStart, rightStart),
				leftHeader: getHeaderForLine(leftLines, leftContextLine),
				rightHeader: getHeaderForLine(rightLines, rightContextLine),
			});

			const pairCount = Math.min(pendingDeletes.length, pendingInserts.length);

			for (let i = 0; i < pairCount; i++) {
				const leftLineNo = pendingDeletes[i];
				const rightLineNo = pendingInserts[i];
				if (leftLineNo == null || rightLineNo == null) continue;

				leftDecorations.push({ line: leftLineNo, className: CHANGED_CLASS });
				rightDecorations.push({ line: rightLineNo, className: CHANGED_CLASS });

				const leftLineText = leftLines[leftLineNo - 1] ?? "";
				const rightLineText = rightLines[rightLineNo - 1] ?? "";
				const { left: leftRanges, right: rightRanges } = diffCharRanges(
					leftLineText,
					rightLineText,
				);

				for (const [from, to] of leftRanges) {
					leftMarks.push({ line: leftLineNo, from, to, className: REMOVED_CHAR_CLASS });
				}
				for (const [from, to] of rightRanges) {
					rightMarks.push({ line: rightLineNo, from, to, className: ADDED_CHAR_CLASS });
				}
			}

			for (const line of pendingDeletes.slice(pairCount)) {
				leftDecorations.push({ line, className: REMOVED_CLASS });
				hunks.push({
					kind: "removed",
					leftLine: line,
					rightLine: null,
					leftCount: 1,
					rightCount: 0,
					preview: getPreview("removed", line, null),
					leftHeader: getHeaderForLine(leftLines, line),
					rightHeader: getHeaderForLine(rightLines, Math.max(1, ctxRight)),
				});
			}
			for (const line of pendingInserts.slice(pairCount)) {
				rightDecorations.push({ line, className: ADDED_CLASS });
				hunks.push({
					kind: "added",
					leftLine: null,
					rightLine: line,
					leftCount: 0,
					rightCount: 1,
					preview: getPreview("added", null, line),
					leftHeader: getHeaderForLine(leftLines, Math.max(1, ctxLeft)),
					rightHeader: getHeaderForLine(rightLines, line),
				});
			}
		} else if (pendingDeletes.length > 0) {
			const leftStart = pendingDeletes[0] ?? null;
			const leftContextLine = leftStart ?? Math.max(1, ctxLeft);
			const rightContextLine = Math.max(1, ctxRight);
			hunks.push({
				kind: "removed",
				leftLine: leftStart,
				rightLine: null,
				leftCount: pendingDeletes.length,
				rightCount: 0,
				preview: getPreview("removed", leftStart, null),
				leftHeader: getHeaderForLine(leftLines, leftContextLine),
				rightHeader: getHeaderForLine(rightLines, rightContextLine),
			});
			for (const line of pendingDeletes) {
				leftDecorations.push({ line, className: REMOVED_CLASS });
			}
		} else if (pendingInserts.length > 0) {
			const rightStart = pendingInserts[0] ?? null;
			const leftContextLine = Math.max(1, ctxLeft);
			const rightContextLine = rightStart ?? Math.max(1, ctxRight);
			hunks.push({
				kind: "added",
				leftLine: null,
				rightLine: rightStart,
				leftCount: 0,
				rightCount: pendingInserts.length,
				preview: getPreview("added", null, rightStart),
				leftHeader: getHeaderForLine(leftLines, leftContextLine),
				rightHeader: getHeaderForLine(rightLines, rightContextLine),
			});
			for (const line of pendingInserts) {
				rightDecorations.push({ line, className: ADDED_CLASS });
			}
		}

		pendingDeletes = [];
		pendingInserts = [];
	};

	for (const edit of edits) {
		switch (edit.type) {
			case "equal": {
				flush();
				const origLeft = leftLineOf[augLi] ?? null;
				const origRight = rightLineOf[augRi] ?? null;
				augLi++;
				augRi++;
				// Update context after flush; skip sentinels (null entries).
				if (origLeft !== null) ctxLeft = origLeft;
				if (origRight !== null) ctxRight = origRight;
				break;
			}
			case "delete": {
				const origLeft = leftLineOf[augLi] ?? null;
				augLi++;
				if (origLeft !== null) {
					pendingDeletes.push(origLeft);
					ctxLeft = origLeft;
				}
				break;
			}
			case "insert": {
				const origRight = rightLineOf[augRi] ?? null;
				augRi++;
				if (origRight !== null) {
					pendingInserts.push(origRight);
					ctxRight = origRight;
				}
				break;
			}
		}
	}

	flush();

	return {
		left: { lines: leftDecorations, marks: leftMarks },
		right: { lines: rightDecorations, marks: rightMarks },
		hunks,
	};
}

function diffCharRanges(left: string, right: string) {
	const leftChars = left.split("");
	const rightChars = right.split("");

	const edits = diffMyers(leftChars, rightChars, (a, b) => a === b);

	const leftRanges: Array<[number, number]> = [];
	const rightRanges: Array<[number, number]> = [];

	let leftIndex = 0;
	let rightIndex = 0;
	let leftRangeStart: number | null = null;
	let rightRangeStart: number | null = null;

	const flushRanges = () => {
		if (leftRangeStart != null && leftRangeStart !== leftIndex) {
			leftRanges.push([leftRangeStart, leftIndex]);
		}
		if (rightRangeStart != null && rightRangeStart !== rightIndex) {
			rightRanges.push([rightRangeStart, rightIndex]);
		}
		leftRangeStart = null;
		rightRangeStart = null;
	};

	for (const edit of edits) {
		switch (edit.type) {
			case "equal":
				flushRanges();
				leftIndex++;
				rightIndex++;
				break;
			case "delete":
				if (leftRangeStart == null) leftRangeStart = leftIndex;
				leftIndex++;
				break;
			case "insert":
				if (rightRangeStart == null) rightRangeStart = rightIndex;
				rightIndex++;
				break;
		}
	}

	flushRanges();

	return { left: leftRanges, right: rightRanges };
}

function chooseTwoMarkdownViews(
	plugin: MarkdownComparePlugin,
): [MarkdownView, MarkdownView] | null {
	const leaves = plugin.app.workspace.getLeavesOfType("markdown");
	const isLeafVisible = (leaf: (typeof leaves)[number]) => {
		const el = leaf.view.containerEl;
		return el.isConnected && el.offsetParent !== null;
	};

	const isLeafInSidedock = (leaf: (typeof leaves)[number]) => {
		const el = leaf.view.containerEl;
		if (
			el.closest(".workspace-split.mod-left-split") ||
			el.closest(".workspace-split.mod-right-split")
		) {
			return true;
		}

		type ParentNode = { parent?: ParentNode };
		let parent: ParentNode | null = leaf.parent as ParentNode;
			while (parent) {
				if (parent instanceof WorkspaceSidedock) return true;
			const next: ParentNode | null = parent.parent ?? null;
			if (!next || next === parent) return false;
			parent = next;
			}
		return false;
	};

	const visibleMarkdownViews = leaves
		.filter(isLeafVisible)
		.filter((leaf) => !isLeafInSidedock(leaf))
		.map((leaf) => leaf.view)
		.filter((view): view is MarkdownView => view instanceof MarkdownView)
		.filter((view) => view.file != null);

	if (visibleMarkdownViews.length !== 2) return null;

	const first = visibleMarkdownViews[0];
	const second = visibleMarkdownViews[1];
	if (!first || !second) return null;

	const active = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (active && (active === first || active === second)) {
		const other = active === first ? second : first;
		return [active, other];
	}

	return [first, second];
}

export function compareTwoVisibleMarkdownViews(
	plugin: MarkdownComparePlugin,
	options?: { showNotice?: boolean; clearWhenNotComparable?: boolean },
) {
	const pair = chooseTwoMarkdownViews(plugin);
	if (!pair) {
		if (options?.clearWhenNotComparable) clearAllCompareHighlights(plugin);
		plugin.setCompareTargets(null);
		plugin.setDiffState(null);
		if (options?.showNotice ?? true) {
			new Notice(
				"Open exactly two Markdown panes in the main window, then run compare.",
			);
		}
		return;
	}

	const [leftView, rightView] = pair;
	const leftEditorView = getEditorViewFromMarkdownView(leftView);
	const rightEditorView = getEditorViewFromMarkdownView(rightView);

	if (!leftEditorView || !rightEditorView) {
		if (options?.clearWhenNotComparable) clearAllCompareHighlights(plugin);
		plugin.setCompareTargets(null);
		plugin.setDiffState(null);
		if (options?.showNotice ?? true) {
			new Notice(
				"Switch both panes to source mode or live preview before comparing.",
			);
		}
		return;
	}

	clearAllCompareHighlights(plugin);

	const { left, right, hunks } = computeHighlights(
		leftView.editor.getValue(),
		rightView.editor.getValue(),
	);

	setDiffHighlights(leftEditorView, left);
	setDiffHighlights(rightEditorView, right);

	plugin.setCompareTargets({
		leftEditorView,
		rightEditorView,
		leftPath: leftView.file?.path ?? "(unknown)",
		rightPath: rightView.file?.path ?? "(unknown)",
	});
	plugin.setDiffState({
		leftPath: leftView.file?.path ?? "(unknown)",
		rightPath: rightView.file?.path ?? "(unknown)",
		hunks,
	});

	if (options?.showNotice ?? true) {
		new Notice("Differences highlighted.");
	}
}

export function clearAllCompareHighlights(plugin: MarkdownComparePlugin) {
	const allMarkdownViews = plugin.app.workspace
		.getLeavesOfType("markdown")
		.map((leaf) => leaf.view)
		.filter((view): view is MarkdownView => view instanceof MarkdownView);

	for (const view of allMarkdownViews) {
		const editorView = getEditorViewFromMarkdownView(view);
		if (editorView) clearDiffHighlights(editorView);
	}

	plugin.setCompareTargets(null);
	plugin.setDiffState(null);
}
