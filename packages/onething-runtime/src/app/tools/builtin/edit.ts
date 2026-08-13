import { createEditTool } from "@onething/runtime/tools";
import { getSettings } from "../../stores/settings.js";
import { getConnectedDirectories } from "../../stores/connected-directories.js";
import { getFileMutationsDir } from "../../stores/paths.js";

export const EditTool = createEditTool({
	getDefaultWorkingDirectory: () =>
		getSettings().tools?.bash?.defaultWorkingDirectory,
	getFileMutationsDir,
	getConnectedDirectories,
});
