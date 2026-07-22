import { z } from 'zod'
import {
  executeCoreTimeTool,
  type CoreTimeArgs,
  type CoreTimeMetadata,
} from './time-runtime.js'
import { Tool } from '../tool.js'

const TimeParameters = z.object({
  action: z.enum(['now', 'convert', 'diff', 'add'])
    .describe('now = current time, convert = change timezone, diff = compare two instants, add = add a duration.'),
  timezone: z.string().optional()
    .describe('Default timezone for parsing and output. IANA name (Asia/Shanghai) or offset (UTC+08:00). Defaults to system timezone.'),
  format: z.enum(['full', 'date', 'time', 'iso', 'compact']).optional()
    .describe('Output format.'),
  time: z.string().optional()
    .describe('Input time for convert/add: ISO with offset, local datetime, epoch ms, or "now".'),
  from_timezone: z.string().optional()
    .describe('Source timezone when time has no offset.'),
  to_timezone: z.string().optional()
    .describe('Output timezone for convert/add/now.'),
  start_time: z.string().optional()
    .describe('Start time for diff.'),
  start_timezone: z.string().optional()
    .describe('Timezone for start_time when it has no offset.'),
  end_time: z.string().optional()
    .describe('End time for diff. Defaults to now.'),
  end_timezone: z.string().optional()
    .describe('Timezone for end_time when it has no offset.'),
  amount: z.number().optional()
    .describe('Duration amount for add. Can be negative.'),
  unit: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week']).optional()
    .describe('Duration unit for add/diff. Days/weeks are exact 24h/7d.'),
})

export const TimeTool = Tool.define<typeof TimeParameters, CoreTimeMetadata>('time', {
  name: 'Time',
  description: 'Timezone-aware time utility: current time (now), timezone conversion (convert), difference between two instants (diff), exact duration arithmetic (add). Prefer IANA timezone names; fixed offsets like UTC+08:00 also work. Provide a *_timezone when a datetime has no explicit offset.',
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'text',
  parameters: TimeParameters,
  async execute(args, ctx) {
    ctx.updateResult?.({
      content: [{ type: 'text', text: `Calculating time ${args.action}...` }],
      details: { phase: 'running', action: args.action },
    })

    const result = executeCoreTimeTool(args as CoreTimeArgs)
    ctx.metadata({
      title: result.status.title,
      metadata: result.status.metadata as Partial<CoreTimeMetadata>,
    })

    return {
      title: result.title,
      output: result.output,
      metadata: result.metadata,
    }
  },
})
