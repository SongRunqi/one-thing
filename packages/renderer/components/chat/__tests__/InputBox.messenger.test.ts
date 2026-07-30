// @vitest-environment happy-dom
/**
 * InputBox 形态分装(docs/design/agent-im-chat-ui.md §2 C1/P1)。
 *
 * 一个输入框两种形态:直聊(kind='chat')是工程驾驶舱,房会话(群房 / 单成员
 * dm 房 / 双成员 dm 房,全是 kind='room')是 IM 场。这里钉三件事:
 *   1. 形态分流本身(三种房 → messenger,直聊 → engineering);
 *   2. messenger 的移除清单逐项(§2.2 右列);
 *   3. 直聊零变化 —— 本期最高验收项,全量控件快照。
 */
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InputBox from "../InputBox.vue";
import { createDefaultSettings } from "@shared/defaults/settings";
import { executeCommand, findCommand } from "@/services/commands";

const mocks = vi.hoisted(() => ({
	settingsStore: null as any,
	sessionsStore: null as any,
	chatStore: null as any,
	voiceStore: null as any,
	promptsStore: null as any,
	musicStore: null as any,
	agentsStore: null as any,
}));

vi.mock("@/stores/settings", () => ({
	useSettingsStore: () => mocks.settingsStore,
}));

vi.mock("@/stores/sessions", () => ({
	useSessionsStore: () => mocks.sessionsStore,
}));

vi.mock("@/stores/chat", () => ({
	useChatStore: () => mocks.chatStore,
}));

vi.mock("@/stores/voice", () => ({
	useVoiceStore: () => mocks.voiceStore,
}));

vi.mock("@/stores/prompts", () => ({
	usePromptsStore: () => mocks.promptsStore,
}));

vi.mock("@/stores/music", () => ({
	useMusicStore: () => mocks.musicStore,
}));

vi.mock("@/stores/agents", () => ({
	useAgentsStore: () => mocks.agentsStore,
}));

vi.mock("@/stores/collabBoard", () => ({
	useCollabBoardStore: () => ({
		isRoomTurnActive: () => false,
	}),
}));

vi.mock("@/stores/browser", () => ({
	useBrowserStore: () => ({
		tabs: [],
		activeTabId: null,
		activeTab: null,
		ensureLoaded: vi.fn().mockResolvedValue(undefined),
	}),
}));

vi.mock("@/services/commands", () => ({
	findCommand: vi.fn(() => undefined),
	getCommands: vi.fn(() => [
		{
			id: "compact",
			name: "Compact Context",
			description: "Compact context",
			usage: "/compact",
			execute: vi.fn(),
		},
	]),
	refreshPluginCommands: vi.fn().mockResolvedValue([]),
	executeCommand: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/editor/TextEditor.vue", () => ({
	default: {
		name: "TextEditor",
		props: ["modelValue"],
		emits: [
			"update:modelValue",
			"paste",
			"keydown",
			"focus",
			"blur",
			"heightChange",
			"selectionChange",
			"transaction",
			"compositionstart",
			"compositionend",
		],
		template:
			'<textarea class="composer-input" :value="modelValue" @input="onInput" @keydown="$emit(\'keydown\', $event)" />',
		methods: {
			onInput(this: any, event: Event) {
				this.$emit(
					"update:modelValue",
					(event.target as HTMLTextAreaElement).value,
				);
			},
			focus() {},
			scrollToTop() {},
			getSelection(this: any) {
				const length = String(this.modelValue ?? "").length;
				return { from: length, to: length };
			},
			replaceRange() {},
			setValue(this: any, value: string) {
				this.$emit("update:modelValue", value);
			},
		},
	},
}));

/** 弹层桩:只有 visible 才落 DOM,标题带出来区分 files/pages/members 三份。 */
const pickerStub = (marker: string) => ({
	props: ["visible", "title"],
	template: `<div v-if="visible" class="${marker}" :data-title="title" />`,
});

async function settle() {
	await nextTick();
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await nextTick();
}

function dispatchKeydown(element: Element, key: string) {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
	});
	element.dispatchEvent(event);
	return event;
}

function mountInputBox(sessionId: string) {
	return mount(InputBox, {
		attachTo: document.body,
		props: { sessionId },
		global: {
			stubs: {
				QuotedContext: { template: "<div />" },
				CommandPicker: pickerStub("mock-command-picker"),
				FilePicker: pickerStub("mock-file-picker"),
				PathPicker: pickerStub("mock-path-picker"),
				ModelSelector: { template: '<div class="mock-model-selector" />' },
				ThinkToggle: { template: '<div class="mock-think-toggle" />' },
				MusicStatusBar: { template: "<div />" },
				Transition: false,
				TransitionGroup: false,
			},
		},
	});
}

async function setComposerValue(wrapper: VueWrapper, value: string) {
	await wrapper.find("textarea").setValue(value);
	wrapper.findComponent({ name: "TextEditor" }).vm.$emit("transaction", {
		value,
		selection: { from: value.length, to: value.length },
		docChanged: true,
		selectionChanged: true,
	});
	await settle();
}

/** §2.2 移除清单在 DOM 上的落点。 */
const ENGINEERING_ONLY_SELECTORS = [
	".mock-model-selector",
	".context-meter",
	".mock-think-toggle",
	".permission-mode-select",
	".tts-toggle-btn",
	".call-btn",
];

/** messenger 保留清单在 DOM 上的落点(文本框/附件/speak/发送)。 */
const ALWAYS_PRESENT_SELECTORS = [
	"textarea.composer-input",
	".attach-btn",
	".voice-btn",
	".send-btn",
];

beforeEach(() => {
	vi.mocked(findCommand).mockReturnValue(undefined as never);
	const baseSettings = createDefaultSettings();
	baseSettings.ai.provider = "openai";
	baseSettings.ai.providers.openai.model = "gpt-vision";

	mocks.settingsStore = reactive({
		settings: baseSettings,
		saveSettings: vi.fn(async (newSettings) => {
			mocks.settingsStore.settings = newSettings;
		}),
		getCachedModels: vi.fn(() => [
			{
				id: "gpt-vision",
				context_length: 32000,
				architecture: { input_modalities: ["text", "image"] },
			},
		]),
	});
	mocks.sessionsStore = reactive({
		currentSessionId: "chat-1",
		sessionVariables: new Map(),
		sessions: [
			{ id: "chat-1", kind: "chat", workingDirectory: "/repo" },
			{
				id: "room-group",
				kind: "room",
				workingDirectory: "/repo",
				room: { memberAgentIds: ["a1", "a2"] },
			},
			{
				id: "room-user-dm",
				kind: "room",
				workingDirectory: "/repo",
				room: { memberAgentIds: ["a1"] },
			},
			{
				id: "room-pair-dm",
				kind: "room",
				workingDirectory: "/repo",
				room: { memberAgentIds: ["a1", "a2"] },
			},
		],
		getSessionItem: vi.fn((sessionId: string) =>
			mocks.sessionsStore.sessions.find((item: any) => item.id === sessionId),
		),
		// 产品层判定的唯一出口(store selector);组件不自写第二份过滤。
		isUserDmRoomSession: vi.fn(
			(sessionId?: string | null) => sessionId === "room-user-dm",
		),
		updateSessionPermissionMode: vi.fn(async () => ({ success: true })),
	});
	const composerDrafts = new Map<string, any>();
	mocks.chatStore = reactive({
		sessionMessages: new Map(),
		isSessionGenerating: vi.fn(() => false),
		setComposerDraft: vi.fn((sessionId: string, draft: any) => {
			composerDrafts.set(sessionId, draft);
		}),
		getComposerDraft: vi.fn(
			(sessionId: string) => composerDrafts.get(sessionId) || null,
		),
		clearComposerDraft: vi.fn((sessionId: string) =>
			composerDrafts.delete(sessionId),
		),
		isComposerDraftEmpty: vi.fn(
			(sessionId: string) => !composerDrafts.has(sessionId),
		),
	});
	mocks.voiceStore = reactive({
		isEnabled: false,
		isRecording: false,
		status: "idle",
		startListening: vi.fn().mockResolvedValue({ success: true }),
		stop: vi.fn(),
	});
	mocks.promptsStore = reactive({
		prompts: [],
		loadPrompts: vi.fn().mockResolvedValue([]),
	});
	mocks.musicStore = reactive({
		nowPlaying: null,
		radio: { active: false, intent: "", programmeLength: 0, canResume: false },
		livePosition: 0,
		progressRatio: 0,
		playerBackend: "mpv",
		initialize: vi.fn().mockResolvedValue(undefined),
		useClock: vi.fn(() => () => {}),
		sendCommand: vi.fn().mockResolvedValue({ success: true }),
		setPlayer: vi.fn().mockResolvedValue({ success: true }),
	});
	mocks.agentsStore = reactive({
		agents: [
			{ id: "a1", name: "小明", title: "前端" },
			{ id: "a2", name: "小红", title: "后端" },
		],
		loadAgents: vi.fn().mockResolvedValue(undefined),
	});

	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"window",
		Object.assign(window, {
			electronAPI: {
				getSkills: vi.fn().mockResolvedValue({ success: true, skills: [] }),
				listVariables: vi
					.fn()
					.mockResolvedValue({ success: true, variables: [] }),
				listFiles: vi
					.fn()
					.mockResolvedValue({ success: true, files: ["/repo/src/main.ts"] }),
				listDirs: vi.fn().mockResolvedValue({ success: true, dirs: ["/repo/src"] }),
				openSettingsWindow: vi.fn().mockResolvedValue({ success: true }),
			},
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.textContent = "";
});

describe("InputBox composer profile", () => {
	it("直聊是 engineering,三种房都是 messenger", () => {
		expect(
			mountInputBox("chat-1").find(".composer-toolbar").attributes("data-profile"),
		).toBe("engineering");
		for (const roomId of ["room-group", "room-user-dm", "room-pair-dm"]) {
			expect(
				mountInputBox(roomId).find(".composer-toolbar").attributes("data-profile"),
			).toBe("messenger");
		}
	});

	it("直聊零变化:工程驾驶舱全量渲染(回归钉)", () => {
		const wrapper = mountInputBox("chat-1");
		for (const selector of [
			...ENGINEERING_ONLY_SELECTORS,
			...ALWAYS_PRESENT_SELECTORS,
		]) {
			expect(
				wrapper.find(selector).exists(),
				`直聊少了 ${selector}`,
			).toBe(true);
		}
	});

	it("messenger 移除清单逐项:三种房都不挂工程控件", () => {
		for (const roomId of ["room-group", "room-user-dm", "room-pair-dm"]) {
			const wrapper = mountInputBox(roomId);
			for (const selector of ENGINEERING_ONLY_SELECTORS) {
				expect(
					wrapper.find(selector).exists(),
					`${roomId} 仍在渲染 ${selector}`,
				).toBe(false);
			}
		}
	});

	it("messenger 保留清单:文本框 / 附件 / speak / 发送照旧", () => {
		for (const roomId of ["room-group", "room-user-dm", "room-pair-dm"]) {
			const wrapper = mountInputBox(roomId);
			for (const selector of ALWAYS_PRESENT_SELECTORS) {
				expect(
					wrapper.find(selector).exists(),
					`${roomId} 少了 ${selector}`,
				).toBe(true);
			}
		}
	});
});

describe("InputBox messenger @ mentions", () => {
	it("群房:输入 @ 照旧弹成员补全", async () => {
		const wrapper = mountInputBox("room-group");
		await setComposerValue(wrapper, "问一下 @");

		const picker = wrapper.find('.mock-file-picker[data-title="成员"]');
		expect(picker.exists()).toBe(true);
	});

	it("双成员 dm 房:@ 照旧(房里还有第二个人)", async () => {
		const wrapper = mountInputBox("room-pair-dm");
		await setComposerValue(wrapper, "问一下 @");

		expect(wrapper.find('.mock-file-picker[data-title="成员"]').exists()).toBe(
			true,
		);
	});

	it("单成员 dm 房:输入 @ 什么都不弹(也不掉进文件选择器)", async () => {
		const wrapper = mountInputBox("room-user-dm");
		await setComposerValue(wrapper, "问一下 @");

		expect(wrapper.find(".mock-file-picker").exists()).toBe(false);
		expect(wrapper.find(".mock-command-picker").exists()).toBe(false);
		expect(wrapper.find(".mock-path-picker").exists()).toBe(false);
	});

	it("直聊:bare @ 照旧弹文件选择器(零变化)", async () => {
		const wrapper = mountInputBox("chat-1");
		await setComposerValue(wrapper, "看看 @");

		expect(wrapper.find(".mock-file-picker").exists()).toBe(true);
	});
});

describe("InputBox messenger slash text", () => {
	it("messenger:`/` 不弹命令面", async () => {
		const wrapper = mountInputBox("room-group");
		await setComposerValue(wrapper, "/comp");

		expect(wrapper.find(".mock-command-picker").exists()).toBe(false);
	});

	it("直聊:`/` 照旧弹命令面(零变化)", async () => {
		const wrapper = mountInputBox("chat-1");
		await setComposerValue(wrapper, "/comp");

		expect(wrapper.find(".mock-command-picker").exists()).toBe(true);
	});

	it("messenger:`/compact` 当普通文本原样发出,一个字不吞", async () => {
		vi.mocked(findCommand).mockReturnValue({
			id: "compact",
			name: "Compact Context",
			description: "Compact context",
			usage: "/compact",
			execute: vi.fn(),
		} as never);
		const wrapper = mountInputBox("room-group");
		await setComposerValue(wrapper, "/compact 这句是说给房里的人听的");
		dispatchKeydown(wrapper.find("textarea").element, "Enter");
		await settle();

		expect(executeCommand).not.toHaveBeenCalled();
		const sent = wrapper.emitted("sendMessage");
		expect(sent).toBeTruthy();
		expect(sent?.[0]?.[0]).toBe("/compact 这句是说给房里的人听的");
	});

	it("直聊:`/compact` 照旧走命令派发(零变化)", async () => {
		vi.mocked(findCommand).mockReturnValue({
			id: "compact",
			name: "Compact Context",
			description: "Compact context",
			usage: "/compact",
			execute: vi.fn(),
		} as never);
		const wrapper = mountInputBox("chat-1");
		// 尾空格让命令面自己关掉(触发器只吃 `/词`),Enter 才落到 sendMessage
		// 的命令派发上而不是"确认补全"。
		await setComposerValue(wrapper, "/compact ");
		dispatchKeydown(wrapper.find("textarea").element, "Enter");
		await settle();

		expect(executeCommand).toHaveBeenCalledWith(
			"compact",
			expect.objectContaining({ sessionId: "chat-1" }),
		);
		expect(wrapper.emitted("sendMessage")).toBeFalsy();
	});

	it("messenger:RUN 标签不出现,SEND 照旧", async () => {
		const wrapper = mountInputBox("room-group");
		await setComposerValue(wrapper, "/compact");

		expect(wrapper.find(".send-label").text()).toBe("SEND ⏎");
	});
});
