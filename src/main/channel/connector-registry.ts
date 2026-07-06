import type {
  IMConnector,
  ReplyTarget,
} from '../../shared/ipc.js'

const connectors = new Map<string, IMConnector>()

export function registerIMConnector(connector: IMConnector): () => void {
  connectors.set(connector.id, connector)
  return () => {
    if (connectors.get(connector.id) === connector) {
      connectors.delete(connector.id)
    }
  }
}

export function getIMConnector(connectorId: string): IMConnector | undefined {
  return connectors.get(connectorId)
}

export function listIMConnectorIds(): string[] {
  return Array.from(connectors.keys()).sort()
}

export async function sendIMReply(
  target: ReplyTarget,
  payload: {
    text: string
    sessionId: string
    messageId: string
  },
): Promise<void> {
  const connector = getIMConnector(target.connector)
  if (!connector) {
    throw new Error(`IM connector "${target.connector}" is not registered`)
  }
  await connector.sendReply(target, payload)
}

