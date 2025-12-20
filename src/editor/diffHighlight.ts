import type { EditorView as CodeMirrorEditorView } from "@codemirror/view";
import { Decoration, EditorView } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import type { MarkdownView } from "obsidian";

export interface DiffLineDecoration {
	line: number;
	className: string;
}

export interface DiffMarkDecoration {
	line: number;
	from: number;
	to: number;
	className: string;
}

export interface DiffHighlightSpec {
	lines: DiffLineDecoration[];
	marks: DiffMarkDecoration[];
}

const setDiffDecorations = StateEffect.define<DiffHighlightSpec>();
const setJumpLines = StateEffect.define<number[]>();

function buildDecorationSet(
	doc: Text,
	spec: DiffHighlightSpec,
) {
	const builder = new RangeSetBuilder<Decoration>();

	type PendingDecoration = {
		from: number;
		to: number;
		kind: "line" | "mark";
		decoration: Decoration;
	};

	const pending: PendingDecoration[] = [];

	for (const { line, className } of spec.lines) {
		if (line < 1 || line > doc.lines) continue;
		const lineInfo = doc.line(line);
		pending.push({
			from: lineInfo.from,
			to: lineInfo.from,
			kind: "line",
			decoration: Decoration.line({ attributes: { class: className } }),
		});
	}

	for (const { line, from, to, className } of spec.marks) {
		if (line < 1 || line > doc.lines) continue;
		const lineInfo = doc.line(line);
		const clampedFrom = Math.max(0, Math.min(from, lineInfo.length));
		const clampedTo = Math.max(clampedFrom, Math.min(to, lineInfo.length));
		if (clampedFrom === clampedTo) continue;

		pending.push({
			from: lineInfo.from + clampedFrom,
			to: lineInfo.from + clampedTo,
			kind: "mark",
			decoration: Decoration.mark({ class: className }),
		});
	}

	pending.sort((a, b) => {
		if (a.from !== b.from) return a.from - b.from;
		if (a.kind !== b.kind) return a.kind === "line" ? -1 : 1;
		if (a.to !== b.to) return a.to - b.to;
		return 0;
	});

	for (const { from, to, decoration } of pending) {
		builder.add(from, to, decoration);
	}

	return builder.finish();
}

const diffDecorationsField = StateField.define({
	create() {
		return Decoration.none;
	},
	update(value, tr) {
		let next = value.map(tr.changes);

		for (const effect of tr.effects) {
			if (!effect.is(setDiffDecorations)) continue;
			next = buildDecorationSet(tr.state.doc, effect.value);
		}

		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

function buildJumpDecorationSet(doc: Text, lines: number[]) {
	const builder = new RangeSetBuilder<Decoration>();
	const sortedLines = [...lines].sort((a, b) => a - b);

	for (const line of sortedLines) {
		if (line < 1 || line > doc.lines) continue;
		const lineInfo = doc.line(line);
		builder.add(
			lineInfo.from,
			lineInfo.from,
			Decoration.line({ attributes: { class: "markdowncompare-jump-line" } }),
		);
	}

	return builder.finish();
}

const jumpLinesField = StateField.define({
	create() {
		return Decoration.none;
	},
	update(value, tr) {
		let next = value.map(tr.changes);

		for (const effect of tr.effects) {
			if (!effect.is(setJumpLines)) continue;
			next = buildJumpDecorationSet(tr.state.doc, effect.value);
		}

		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

export const diffHighlightExtension = [diffDecorationsField, jumpLinesField];

export function getEditorViewFromMarkdownView(view: MarkdownView) {
	const cm = (view.editor as unknown as { cm?: unknown }).cm;
	if (!cm) return null;
	if (typeof (cm as { dispatch?: unknown }).dispatch !== "function") return null;
	return cm as CodeMirrorEditorView;
}

export function setDiffHighlights(
	editorView: CodeMirrorEditorView,
	spec: DiffHighlightSpec,
) {
	editorView.dispatch({
		effects: setDiffDecorations.of(spec),
	});
}

export function clearDiffHighlights(editorView: CodeMirrorEditorView) {
	setDiffHighlights(editorView, { lines: [], marks: [] });
}

export function setJumpLineHighlights(
	editorView: CodeMirrorEditorView,
	lines: number[],
) {
	editorView.dispatch({
		effects: setJumpLines.of(lines),
	});
}

export function clearJumpLineHighlights(editorView: CodeMirrorEditorView) {
	setJumpLineHighlights(editorView, []);
}
