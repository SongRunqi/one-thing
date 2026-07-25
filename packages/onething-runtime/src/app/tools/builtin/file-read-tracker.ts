/**
 * Main-process singleton FileReadTracker instance.
 * Shared by read, edit, and write tools to enforce read-before-mutation guard.
 */
import { FileReadTracker } from "@onething/runtime/tools";

export const fileReadTracker = new FileReadTracker();
