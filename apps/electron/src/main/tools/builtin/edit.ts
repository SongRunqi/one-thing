import { createEditTool } from "@onething/runtime/tools";
import { getSettings } from "../../stores/settings.js";
import { getFileMutationsDir } from "../../stores/paths.js";
import { fileReadTracker } from "./file-read-tracker.js";

export const EditTool = createEditTool({
	getDefaultWorkingDirectory: () =>
		getSettings().tools?.bash?.defaultWorkingDirectory,
	getFileMutationsDir,
	fileReadTracker,
});
