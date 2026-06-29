import {
  configureOnethingRipgrepRuntime,
} from '@onething/runtime/files/ripgrep'
import { createRequiredAppFetch } from '../providers/bound-fetch.js'

configureOnethingRipgrepRuntime({
  createFetch: createRequiredAppFetch,
})

export {
  OnethingRipgrep,
  Ripgrep,
  buildOnethingRipgrepFileListArgs,
  buildOnethingRipgrepSearchArgs,
  getOnethingRipgrepPath,
  getOnethingRipgrepPlatformConfig,
  getRipgrepPath,
  listFiles,
  listOnethingRipgrepFiles,
  parseOnethingRipgrepSearchOutput,
  resetOnethingRipgrepRuntimeForTests,
  search,
  searchOnethingRipgrep,
} from '@onething/runtime/files/ripgrep'
export type {
  OnethingRipgrepListFilesOptions,
  OnethingRipgrepRuntimeAdapters,
  OnethingRipgrepSearchOptions,
  OnethingRipgrepSearchResult,
} from '@onething/runtime/files/ripgrep'
