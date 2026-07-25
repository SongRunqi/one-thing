import { RingBuffer as CoreRingBuffer } from '@onething/core/events'
import type { SessionEvent } from '@shared/events/index.js'

export class RingBuffer extends CoreRingBuffer<SessionEvent> {}
