import type MarkdownComparePlugin from "../main";
import {
	clearAllCompareHighlights,
	compareTwoVisibleMarkdownViews,
} from "./compareTwoVisibleMarkdownViews";

export function registerMarkdownCompareCommands(plugin: MarkdownComparePlugin) {
	plugin.addCommand({
		id: "compare-two-files",
		name: "MarkdownCompare: compare two files",
		callback: () => {
			void plugin.ensureDiffView();
			compareTwoVisibleMarkdownViews(plugin, { showNotice: true });
		},
	});

	plugin.addCommand({
		id: "clear-highlights",
		name: "MarkdownCompare: clear compare highlights",
		callback: () => clearAllCompareHighlights(plugin),
	});

	plugin.addCommand({
		id: "toggle-live-compare",
		name: "MarkdownCompare: toggle live compare",
		callback: () => plugin.toggleLiveCompare(),
	});
}
