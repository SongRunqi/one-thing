import { createReadTool } from "@onething/runtime/tools";
import { getSettings } from "../../stores/settings.js";
import { getDefaultReadRoots } from "../core/sandbox.js";
import { fileReadTracker } from "./file-read-tracker.js";

export const ReadTool = createReadTool({
	getDefaultWorkingDirectory: () =>
		getSettings().tools?.bash?.defaultWorkingDirectory,
	getDefaultReadRoots,
	fileReadTracker,
});
