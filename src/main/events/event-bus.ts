import { EventBus as CoreEventBus } from '@onething/core/events'
import type { GlobalEvent, SessionEvent } from '../../shared/events/index.js'

export class EventBus extends CoreEventBus<SessionEvent, GlobalEvent> {}
