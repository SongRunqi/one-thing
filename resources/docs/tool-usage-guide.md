# Tool Usage Guide

## Tool Selection Priority

### File Operations - Use Specialized Tools

| Operation | ❌ Avoid | ✅ Use |
|-----------|----------|--------|
| Read file | cat, head, tail, less | read |
| Write file | echo >, cat <<EOF | write |
| Edit file | sed, awk | edit |
| Search content | grep, rg | grep |
| Find files | find, ls | glob |

**Bash is ONLY for:**
- System commands (git, npm, docker, etc.)
- Running scripts and builds
- Commands without a specialized tool equivalent

---

## Execution Strategy

### Batch Independent Calls

Return multiple tool calls in ONE response to save round-trips.

**Good Example:**
```
Need to read 3 files?
→ Return read("a.ts"), read("b.ts"), read("c.ts") together
  (executed sequentially, but only 1 LLM turn)
```

**Bad Example:**
```
Return read("a.ts"), wait for result, return read("b.ts"), wait...
(wastes 3 LLM turns)
```

### Separate Dependent Calls

When result of one call is needed for another, use separate responses.

```
Response 1: glob("*.config.ts") → returns ["vite.config.ts"]
Response 2: read("vite.config.ts") ← uses result from response 1
```

---

## Parameter Rules

1. **Never guess** file paths, function names, or any values
2. **Never use placeholders** like "<path>" or "TODO"
3. **Use exact values** from user input or previous tool results
4. **Omit optional params** - don't set them to null/undefined

---

## File Modification Guidelines

### Before Modifying Files

1. **Always read first** - Understand current state before changes
2. **Use edit for changes** - Prefer edit() over write() for existing files
3. **Verify paths exist** - Use glob() if unsure about file location

### Edit vs Write

- `edit()` - For modifying existing files (safer, preserves context)
- `write()` - For creating new files or complete rewrites

---

## Plan Tool Usage

### When to Create a Plan (ALWAYS for):

- ANY task with 2 or more steps
- Implementing/adding/creating a feature
- Multiple requirements from user
- Tasks involving file modifications
- Bug fixes requiring investigation

### How to Use

1. **Before starting**: Call `plan({ todos: [...] })` to create task list
2. **When starting a task**: Mark one item as 'in_progress'
3. **After completing**: Mark as 'completed'
4. **Always include ALL items** when updating (completed + in_progress + pending)

### Task Format

```typescript
{
  content: string      // Imperative: "Add user authentication"
  activeForm: string   // Present continuous: "Adding user authentication"
  status: 'pending' | 'in_progress' | 'completed'
}
```

### Example

User: "Add a login feature"

```json
{
  "todos": [
    { "content": "Create user model", "status": "in_progress", "activeForm": "Creating user model" },
    { "content": "Add auth middleware", "status": "pending", "activeForm": "Adding auth middleware" },
    { "content": "Implement login API", "status": "pending", "activeForm": "Implementing login API" }
  ]
}
```

**Remember: Use the plan tool proactively. Don't wait for the user to ask.**
