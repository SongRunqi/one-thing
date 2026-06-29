import type {
  OnethingLegacyMediaItem,
  OnethingMediaIngestGeneratedImageInput,
} from '@onething/runtime/media'
import { mediaLibraryService } from './media-library-service.js'

export type MediaItem = OnethingLegacyMediaItem

export async function saveMediaImage(
  data: OnethingMediaIngestGeneratedImageInput,
): Promise<MediaItem> {
  return mediaLibraryService.saveGeneratedImageAsLegacyItem(data)
}
