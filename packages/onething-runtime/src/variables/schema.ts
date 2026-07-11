export interface VariablesFileGlobalVariable {
	name: string;
	value: string;
	description?: string;
	updatedAt?: number;
}

export interface VariablesFile {
	ai_note_dir: string;
	user_note_dir: string;
	work_note_dir: string;
	global_variables: VariablesFileGlobalVariable[];
}

export function createDefaultVariablesFile(): VariablesFile {
	return {
		ai_note_dir: "~/.onething/memory",
		user_note_dir: "",
		work_note_dir: "",
		global_variables: [],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseGlobalVariable(
	value: unknown,
): VariablesFileGlobalVariable | null {
	if (!isRecord(value)) return null;
	if (typeof value.name !== "string") return null;
	if (typeof value.value !== "string") return null;
	return {
		name: value.name,
		value: value.value,
		description:
			typeof value.description === "string" ? value.description : undefined,
		updatedAt:
			typeof value.updatedAt === "number" ? value.updatedAt : undefined,
	};
}

export function parseVariablesFile(raw: unknown): {
	data: VariablesFile;
	recovered: boolean;
} {
	if (!isRecord(raw)) {
		return { data: createDefaultVariablesFile(), recovered: true };
	}

	const globalsRaw = Array.isArray(raw.global_variables)
		? raw.global_variables
		: [];
	const globalVariables = globalsRaw.map(parseGlobalVariable);
	if (globalVariables.some((value) => !value)) {
		console.warn(
			"[variables.store] persisted file failed schema validation, falling back to defaults",
		);
		return { data: createDefaultVariablesFile(), recovered: true };
	}

	const data: VariablesFile = {
		ai_note_dir:
			typeof raw.ai_note_dir === "string"
				? raw.ai_note_dir
				: "~/.onething/memory",
		user_note_dir:
			typeof raw.user_note_dir === "string" ? raw.user_note_dir : "",
		work_note_dir:
			typeof raw.work_note_dir === "string" ? raw.work_note_dir : "",
		global_variables: globalVariables as VariablesFileGlobalVariable[],
	};

	return {
		data: migrateReservedGlobals(raw, data),
		recovered: false,
	};
}

function migrateReservedGlobals(
	raw: unknown,
	data: VariablesFile,
): VariablesFile {
	if (data.work_note_dir) return data;
	if (!isRecord(raw)) return data;
	const globals = raw.global_variables;
	if (!Array.isArray(globals)) return data;
	const legacy = globals.find(
		(v) =>
			isRecord(v) && v.name === "work_note_dir" && typeof v.value === "string",
	) as { value: string } | undefined;
	return legacy ? { ...data, work_note_dir: legacy.value } : data;
}
