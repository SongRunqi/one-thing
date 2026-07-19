import { createPracticeTool } from '@onething/runtime/tools'
import { getPracticeSummary, getRecentPracticeRecords, logPractice } from '../../practice/index.js'

export const PracticeTool = createPracticeTool({
  log: input => logPractice({
    name: input.name,
    source: 'agent',
    note: input.note,
    exercise: input.exercise ?? {},
    ts: input.ts,
  }),
  query: request => getPracticeSummary(request),
  recent: (days, limit) => getRecentPracticeRecords(days, limit),
})
