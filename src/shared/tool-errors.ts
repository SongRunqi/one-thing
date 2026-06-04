export const DEFAULT_PERMISSION_REJECTED_MESSAGE = 'The user rejected permission for this tool.'

export function formatPermissionRejectedMessage(reason?: string): string {
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  return trimmedReason
    ? `${DEFAULT_PERMISSION_REJECTED_MESSAGE} Reason: ${trimmedReason}`
    : DEFAULT_PERMISSION_REJECTED_MESSAGE
}
