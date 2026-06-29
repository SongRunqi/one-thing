import {
  ONETHING_LOG_MONITOR_MANIFEST,
  registerOnethingLogMonitorPlugin,
} from '@onething/runtime/plugins'
import type { PluginAPI } from '../types.js'
import { getLogDir } from '../../stores/paths.js'

export const logMonitorManifest = ONETHING_LOG_MONITOR_MANIFEST

export default function logMonitorPlugin(api: PluginAPI): void {
  registerOnethingLogMonitorPlugin(api, {
    getLogDir,
    logger: console,
  })
}
