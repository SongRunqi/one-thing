---
name: example-skill
description: A template skill demonstrating the builtin skill format. Use this as a reference for creating your own skills.
---

# Example Builtin Skill

This is a template skill that demonstrates the structure of a builtin skill.

## How to Use

When this skill is activated, you should:

1. Greet the user and explain this is an example skill
2. Show the available features
3. Provide guidance on creating custom skills

## Creating Your Own Skills

To create a new builtin skill:

1. Create a new directory under `resources/skills/` with your skill name
2. Add a `SKILL.md` file with YAML frontmatter containing:
   - `name`: lowercase letters, numbers, and hyphens only (max 64 chars)
   - `description`: what the skill does and when to use it (max 1024 chars)
   - `allowed-tools`: (optional) list of tools this skill can use
3. Add your skill instructions in the markdown body

## Skill Directory: {baseDir}

The `{baseDir}` placeholder will be replaced with the actual skill directory path at runtime.
