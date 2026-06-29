import { z } from 'zod'
import {
  executeCoreTimeTool,
  type CoreTimeArgs,
  type CoreTimeMetadata,
} from './time-runtime.js'
import { Tool } from '../tool.js'

const TimeParameters = z.object({
  action: z.enum(['now', 'convert', 'diff', 'add'])
    .describe('Operation to perform: now gets current time, convert changes display timezone, diff compares two instants, add adds an exact duration.'),
  timezone: z.string().optional()
    .describe('Default timezone for parsing and formatting. Supports IANA names like Asia/Shanghai or fixed offsets like UTC+08:00. Defaults to the system timezone.'),
  format: z.enum(['full', 'date', 'time', 'iso', 'compact']).optional()
    .describe('Output format. full is human-readable with timezone, iso is ISO-8601 with zone offset, compact is YYYY-MM-DD HH:mm:ss offset.'),
  time: z.string().optional()
    .describe('Time for convert/add. Use ISO with offset (2026-05-16T09:00:00+08:00), local datetime (2026-05-16 09:00:00) plus timezone, epoch milliseconds, or "now". Defaults to now for add.'),
  from_timezone: z.string().optional()
    .describe('Source timezone for time when it has no explicit offset. Defaults to timezone.'),
  to_timezone: z.string().optional()
    .describe('Target timezone for convert, or output timezone for add/now. Defaults to timezone.'),
  start_time: z.string().optional()
    .describe('Start time for diff. Use ISO with offset, local datetime plus start_timezone/timezone, epoch milliseconds, or "now".'),
  start_timezone: z.string().optional()
    .describe('Timezone used to parse start_time when it has no explicit offset. Defaults to timezone.'),
  end_time: z.string().optional()
    .describe('End time for diff. Defaults to now. Use ISO with offset, local datetime plus end_timezone/timezone, epoch milliseconds, or "now".'),
  end_timezone: z.string().optional()
    .describe('Timezone used to parse end_time when it has no explicit offset. Defaults to timezone.'),
  amount: z.number().optional()
    .describe('Duration amount for add. Can be negative.'),
  unit: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week']).optional()
    .describe('Duration unit for add, and optional preferred unit for diff. Days are exact 24-hour days; weeks are exact 7-day weeks.'),
})

export const TimeTool = Tool.define<typeof TimeParameters, CoreTimeMetadata>('time', {
  name: 'Time',
  description: `Timezone-aware time utility.

Use this tool to:
- Get the current time in a specific timezone with action="now".
- Convert a time from one timezone or offset to another with action="convert".
- Calculate the signed difference between two times with action="diff"; end_time defaults to now.
- Add an exact duration to a time with action="add".

Timezone rules:
- Prefer IANA timezone names such as "Asia/Shanghai", "America/New_York", or "UTC".
- Fixed UTC offsets such as "UTC+08:00", "GMT-05:00", "+0800", and "Z" are also accepted.
- If a datetime has no explicit offset, provide timezone/from_timezone/start_timezone/end_timezone so it can be interpreted correctly.
- Date-only inputs are interpreted as midnight in the selected timezone.`,
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
