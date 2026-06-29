export interface CoreTriggerContext<
  TSettings = unknown,
  TSession = unknown,
  TMessage = unknown,
  TProviderConfig = unknown,
> {
  sessionId: string
  session: TSession
  messages: TMessage[]
  lastUserMessage: string
  lastAssistantMessage: string
  providerId: string
  providerConfig: TProviderConfig
  settings: TSettings
  toolIterations?: number
  skillManageCalled?: boolean
  enabledToolNames?: string[]
}

export interface CoreTrigger<TContext = CoreTriggerContext> {
  id: string
  name: string
  priority: number
  shouldTrigger(ctx: TContext): Promise<boolean>
  execute(ctx: TContext): Promise<void>
}

export interface CoreTriggerManagerLogger {
  log(message: string): void
  warn(message: string): void
  error(message: string, error?: unknown): void
}

export class CoreTriggerManager<TContext = CoreTriggerContext> {
  private triggers: Array<CoreTrigger<TContext>> = []
  private enabled = true

  constructor(private readonly logger: CoreTriggerManagerLogger = console) {}

  register(trigger: CoreTrigger<TContext>): void {
    const existing = this.triggers.find(item => item.id === trigger.id)
    if (existing) {
      this.logger.warn(`[TriggerManager] Trigger ${trigger.id} already registered, skipping`)
      return
    }

    this.triggers.push(trigger)
    this.triggers.sort((a, b) => a.priority - b.priority)
    this.logger.log(`[TriggerManager] Registered trigger: ${trigger.name} (priority: ${trigger.priority})`)
  }

  unregister(triggerId: string): void {
    const index = this.triggers.findIndex(trigger => trigger.id === triggerId)
    if (index !== -1) {
      const trigger = this.triggers[index]
      this.triggers.splice(index, 1)
      this.logger.log(`[TriggerManager] Unregistered trigger: ${trigger.name}`)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.logger.log(`[TriggerManager] Triggers ${enabled ? 'enabled' : 'disabled'}`)
  }

  getTriggers(): Array<CoreTrigger<TContext>> {
    return [...this.triggers]
  }

  async runPostResponse(ctx: TContext & { sessionId: string }): Promise<void> {
    if (!this.enabled) {
      this.logger.log('[TriggerManager] Triggers disabled, skipping')
      return
    }

    if (this.triggers.length === 0) {
      return
    }

    this.logger.log(`[TriggerManager] Running ${this.triggers.length} triggers for session ${ctx.sessionId}`)

    for (const trigger of this.triggers) {
      try {
        const shouldRun = await trigger.shouldTrigger(ctx)
        if (shouldRun) {
          this.logger.log(`[TriggerManager] Executing trigger: ${trigger.name}`)
          await trigger.execute(ctx)
          this.logger.log(`[TriggerManager] Completed trigger: ${trigger.name}`)
        }
      } catch (error) {
        this.logger.error(`[TriggerManager] Trigger ${trigger.name} failed:`, error)
      }
    }
  }
}
