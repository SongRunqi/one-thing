# Evals Experiment Log (Phase 4)

Single-hypothesis experiments for prompt changes. Log each change with
before/after eval scores before merging.

## Log

| Date | Hypothesis | Section Changed | Before Score | After Score | Diff Link | Status |
|---|---|---|---|---|---|---|
| _(no experiments yet)_ | | | | | | |

## Experiment Template

```
### Date: YYYY-MM-DD
**Hypothesis:** (What I believe and why)
**Change:** (Which section, what was changed)
**Expected:** (Which cases should improve, none should regress)

**Results:**
- Before mean: X.XX
- After mean: Y.YY
- Cases improved: [...]
- Cases regressed: [...]
- Verdict: PASS/FAIL

**Diff:** <link>
**Merged:** YYYY-MM-DD
```

## Rules

1. Change ONE section at a time
2. Run full eval set before and after
3. Target cases must improve, no other case may regress
4. Record the experiment before merging
5. Mark triage.md category as "已修,观察中" after merge
