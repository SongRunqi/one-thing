import { onBeforeUnmount, readonly, ref } from "vue";

/**
 * Drag-and-drop state machine for file drops. Knows nothing about attachments —
 * it only answers "is a file drag hovering my zone?" and hands over the dropped
 * File[]. Anything that wants files (the composer today, other panels later)
 * binds `dropHandlers` to an element and does its own thing with the payload.
 */

/** A drag carries files when the platform lists the "Files" kind. */
function dragCarriesFiles(event: DragEvent): boolean {
	const types = event.dataTransfer?.types;
	if (!types) return false;
	return Array.from(types).includes("Files");
}

export interface UseFileDropOptions {
	onFiles: (files: File[]) => void | Promise<void>;
	/** When true the zone ignores drags entirely (e.g. a read-only composer). */
	isDisabled?: () => boolean;
}

export function useFileDrop({ onFiles, isDisabled }: UseFileDropOptions) {
	const isDragActive = ref(false);

	// dragenter/dragleave fire at every element boundary while bubbling, so a
	// drag crossing a child would otherwise read as "left the zone". Count
	// enters and leaves instead of trusting a single leave.
	let depth = 0;

	function reset() {
		depth = 0;
		isDragActive.value = false;
	}

	function onDragEnter(event: DragEvent) {
		if (isDisabled?.() || !dragCarriesFiles(event)) return;
		event.preventDefault();
		depth += 1;
		isDragActive.value = true;
	}

	function onDragOver(event: DragEvent) {
		if (isDisabled?.() || !dragCarriesFiles(event)) return;
		// Without preventDefault here the browser refuses the drop and the file
		// falls through to the window's default handler (which navigates to
		// file:// and, in Electron, hands the file to the OS).
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
		// A drag that entered before the zone existed (or during a re-render)
		// never bumped the counter; treat sustained hover as authoritative.
		if (!isDragActive.value) isDragActive.value = true;
	}

	function onDragLeave(event: DragEvent) {
		if (!isDragActive.value) return;
		event.preventDefault();
		depth = Math.max(0, depth - 1);
		if (depth === 0) isDragActive.value = false;
	}

	async function onDrop(event: DragEvent) {
		if (isDisabled?.() || !dragCarriesFiles(event)) {
			reset();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		reset();
		const files = Array.from(event.dataTransfer?.files ?? []);
		if (files.length === 0) return;
		await onFiles(files);
	}

	// A drag that ends outside the window (or is cancelled with Escape) never
	// delivers a leave/drop to us — the highlight would stick forever.
	function onWindowDragEnd() {
		reset();
	}
	window.addEventListener("dragend", onWindowDragEnd);
	window.addEventListener("drop", onWindowDragEnd);
	onBeforeUnmount(() => {
		window.removeEventListener("dragend", onWindowDragEnd);
		window.removeEventListener("drop", onWindowDragEnd);
	});

	return {
		isDragActive: readonly(isDragActive),
		dropHandlers: {
			onDragenter: onDragEnter,
			onDragover: onDragOver,
			onDragleave: onDragLeave,
			onDrop,
		},
	};
}

let guardInstalled = false;

/**
 * App-wide safety net. A file dropped anywhere that isn't a registered drop
 * zone otherwise reaches the window default handler, which navigates to
 * `file:///…`; the main process treats that as an external URL and opens the
 * file in the OS default app (apps/electron/src/window/external-links.ts).
 * Dropping a PDF next to the composer should do nothing, not launch Preview.
 *
 * Zones call stopPropagation on their own drop, so this only sees the misses.
 */
export function installGlobalFileDropGuard() {
	if (guardInstalled) return;
	guardInstalled = true;
	window.addEventListener("dragover", (event) => {
		if (!dragCarriesFiles(event as DragEvent)) return;
		event.preventDefault();
		const transfer = (event as DragEvent).dataTransfer;
		if (transfer) transfer.dropEffect = "none";
	});
	window.addEventListener("drop", (event) => {
		if (!dragCarriesFiles(event as DragEvent)) return;
		event.preventDefault();
	});
}
