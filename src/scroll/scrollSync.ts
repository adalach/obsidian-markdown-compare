import type { EditorView } from "@codemirror/view";
import { EditorView as EditorViewNS } from "@codemirror/view";

export interface CompareTargets {
	leftEditorView: EditorView;
	rightEditorView: EditorView;
	leftPath: string;
	rightPath: string;
}

export function scrollEditorToLine(editorView: EditorView, line: number) {
	const clampedLine = Math.max(1, Math.min(line, editorView.state.doc.lines));
	const pos = editorView.state.doc.line(clampedLine).from;
	editorView.dispatch({
		selection: { anchor: pos },
		effects: EditorViewNS.scrollIntoView(pos, { y: "center" }),
	});
}

export function scrollBothEditorsToLines(
	left: EditorView,
	right: EditorView,
	leftLine: number,
	rightLine: number,
) {
	scrollEditorToLine(left, leftLine);
	scrollEditorToLine(right, rightLine);
}

export function startScrollSync(left: EditorView, right: EditorView) {
	let syncing = false;
	let rafId: number | null = null;
	let pending: { source: EditorView } | null = null;

	const syncFrom = (source: EditorView) => {
		pending = { source };
		if (rafId != null) return;

		rafId = window.requestAnimationFrame(() => {
			rafId = null;
			if (!pending) return;

			const src = pending.source;
			pending = null;
			const dst = src === left ? right : left;

			if (syncing) return;
			syncing = true;
			try {
				const srcTop = src.scrollDOM.scrollTop;
				const srcBlock = src.lineBlockAtHeight(srcTop + 2);
				const srcLine = src.state.doc.lineAt(srcBlock.from).number;

				const dstLine = Math.max(1, Math.min(srcLine, dst.state.doc.lines));
				const dstPos = dst.state.doc.line(dstLine).from;
				const dstBlock = dst.lineBlockAt(dstPos);
				dst.scrollDOM.scrollTop = dstBlock.top;
			} finally {
				syncing = false;
			}
		});
	};

	const leftHandler = () => syncFrom(left);
	const rightHandler = () => syncFrom(right);

	left.scrollDOM.addEventListener("scroll", leftHandler, { passive: true });
	right.scrollDOM.addEventListener("scroll", rightHandler, { passive: true });

	return () => {
		left.scrollDOM.removeEventListener("scroll", leftHandler);
		right.scrollDOM.removeEventListener("scroll", rightHandler);
		if (rafId != null) window.cancelAnimationFrame(rafId);
	};
}

