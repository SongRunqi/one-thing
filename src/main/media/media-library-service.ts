import {
  MediaLibraryService as RuntimeMediaLibraryService,
  type OnethingMediaLibraryPaths,
} from '@onething/runtime/media'
import {
  getMediaFilesDir,
  getMediaImagesDir,
  getMediaIndexPath,
} from '../stores/paths.js'

function defaultPaths(): OnethingMediaLibraryPaths {
  return {
    indexPath: getMediaIndexPath(),
    imagesDir: getMediaImagesDir(),
    filesDir: getMediaFilesDir(),
  }
}

export class MediaLibraryService extends RuntimeMediaLibraryService {
  constructor(paths: OnethingMediaLibraryPaths = defaultPaths()) {
    super(paths)
  }
}

export const mediaLibraryService = new MediaLibraryService()
