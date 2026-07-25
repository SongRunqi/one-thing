import {
  DEFAULT_ONETHING_AGENT_ID,
  createOnethingAgentStore,
} from '@onething/runtime/agents'
import type { AgentDefinition } from '@shared/ipc.js'
import { getAgentsPath } from '../stores/paths.js'

function getStore() {
  return createOnethingAgentStore({
    agentsPath: getAgentsPath(),
  })
}

export function listAgents(): AgentDefinition[] {
  return getStore().listAgents() as AgentDefinition[]
}

export function getAgent(agentId: string | undefined | null): AgentDefinition {
  return getStore().getAgent(agentId) as AgentDefinition
}

export function agentExists(agentId: string | undefined | null): boolean {
  return getStore().agentExists(agentId)
}

export function createAgent(input: { id: string; name: string; systemPrompt?: string; tools?: string[] }): AgentDefinition {
  return getStore().createAgent(input) as AgentDefinition
}

export function updateAgent(input: { agentId: string; name?: string; systemPrompt?: string; tools?: string[] | null }): AgentDefinition {
  return getStore().updateAgent(input) as AgentDefinition
}

export function deleteAgent(agentId: string): void {
  getStore().deleteAgent(agentId)
}

export const DEFAULT_AGENT_ID = DEFAULT_ONETHING_AGENT_ID
