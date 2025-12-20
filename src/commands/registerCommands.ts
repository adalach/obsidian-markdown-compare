import type MarkdownComparePlugin from "../main";
import {
	clearAllCompareHighlights,
	compareTwoVisibleMarkdownViews,
} from "./compareTwoVisibleMarkdownViews";

export function registerMarkdownCompareCommands(plugin: MarkdownComparePlugin) {
	plugin.addCommand({
		id: "compare-two-files",
		name: "Compare two files",
		callback: () => {
			void plugin.ensureDiffView();
			compareTwoVisibleMarkdownViews(plugin, { showNotice: true });
		},
	});

	plugin.addCommand({
		id: "clear-highlights",
		name: "Clear compare highlights",
		callback: () => clearAllCompareHighlights(plugin),
	});

	plugin.addCommand({
		id: "toggle-live-compare",
		name: "Toggle live compare",
		callback: () => plugin.toggleLiveCompare(),
	});
}
