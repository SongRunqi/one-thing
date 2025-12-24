# Memory System Architecture

This document explains how the memory system works in the application, enabling agents to remember information about users across conversations.

## Overview

The memory system provides **long-term memory** for AI agents, allowing them to:
- Remember facts about users (preferences, goals, personal info)
- Build relationships over time (trust, familiarity)
- Recall relevant context in future conversations
- Forget less important information naturally (decay)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Memory System                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Conversation                                                       │
│        │                                                             │
│        ▼                                                             │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐       │
│   │    Smart     │────▶│   Memory     │────▶│   Conflict   │       │
│   │  Extraction  │     │  Extractor   │     │   Resolver   │       │
│   └──────────────┘     └──────────────┘     └──────────────┘       │
│                              │                      │                │
│                              ▼                      ▼                │
│                        ┌──────────────┐     ┌──────────────┐       │
│                        │  Embedding   │     │   Memory     │       │
│                        │   Service    │     │   Linker     │       │
│                        └──────────────┘     └──────────────┘       │
│                              │                      │                │
│                              ▼                      ▼                │
│                        ┌─────────────────────────────────┐          │
│                        │      SQLite + Vector Store      │          │
│                        │   (memories, embeddings, links) │          │
│                        └─────────────────────────────────┘          │
│                                       │                              │
│                                       ▼                              │
│                        ┌──────────────────────────┐                 │
│                        │    Memory Scheduler      │                 │
│                        │   (periodic decay)       │                 │
│                        └──────────────────────────┘                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### User Facts (Shared)

Facts about the user that are shared across all agents.

```typescript
interface UserFact {
  id: string
  content: string              // "User prefers dark mode"
  category: 'personal' | 'preference' | 'goal' | 'trait'
  confidence: number           // 0-100
  sources: string[]            // Agent IDs that contributed
  createdAt: number
  updatedAt: number
}
```

### Agent Memory (Per-Agent)

Memories specific to each agent's relationship with the user.

```typescript
interface AgentMemory {
  id: string
  content: string              // "User mentioned they're learning Python"
  category: 'observation' | 'event' | 'feeling' | 'learning'

  // Memory strength (decays over time)
  strength: number             // 0-100
  emotionalWeight: number      // Higher = decays slower

  // Reinforcement
  createdAt: number
  lastRecalledAt: number
  recallCount: number
  linkedMemories: string[]     // Knowledge graph connections

  // Visual indicator
  vividness: 'vivid' | 'clear' | 'hazy' | 'fragment'
}
```

### Memory Links (Knowledge Graph)

Connections between related memories.

```typescript
interface MemoryLink {
  sourceId: string
  targetId: string
  relationship: 'similar' | 'contradicts' | 'updates' | 'related'
  similarity: number           // 0-1 cosine similarity
  createdAt: number
}
```

---

## Components

### 1. Smart Extraction (`smart-extraction.ts`)

Determines **if** a conversation should trigger memory extraction.

**Skip patterns** (no extraction):
- Greetings: "Hi", "Thanks", "Bye"
- Technical: Code blocks, commands
- Simple Q&A: "What is X?", "How do I..."

**Extract patterns** (trigger extraction):
- Personal: "I am...", "My name is..."
- Preferences: "I like...", "I prefer..."
- Goals: "I want to...", "I'm planning to..."
- Experiences: "Yesterday I...", "Recently I..."

```typescript
const result = await shouldExtractMemory(userMessage, assistantMessage)
// { shouldExtract: true, reason: "contains personal information", confidence: 0.85 }
```

### 2. Embedding Service (`embedding-service.ts`)

Generates vector embeddings for semantic search.

**Hybrid approach:**
1. **API (Primary)**: OpenAI `text-embedding-3-small` (384 dims)
2. **Local (Fallback)**: `all-MiniLM-L6-v2` via @xenova/transformers

```typescript
const service = getEmbeddingService()
const result = await service.embed("User loves hiking")
// { embedding: [0.12, -0.34, ...], source: 'api', model: 'text-embedding-3-small' }
```

### 3. SQLite Storage (`sqlite-storage.ts`)

Persistent storage with vector search capabilities.

**Tables:**
- `user_profile` - User profile metadata
- `user_facts` - Facts with embeddings
- `agent_relationships` - Per-agent relationship data
- `agent_memories` - Memories with embeddings
- `memory_links` - Knowledge graph edges

**Key methods:**
```typescript
// Hybrid retrieval (semantic + strength)
const memories = await storage.agentMemory.hybridRetrieveMemories(
  agentId,
  "What does the user like?",
  10,  // limit
  { similarityWeight: 0.6, strengthWeight: 0.4 }
)

// Find via knowledge graph
const related = await storage.agentMemory.findRelatedMemories(memoryId, 2) // 2 hops
```

### 4. Memory Linker (`memory-linker.ts`)

Builds a knowledge graph by linking related memories.

**Link creation:**
```typescript
await linkNewMemory(agentId, newMemory)
// Automatically finds and links to similar existing memories
```

**Relationship types:**
| Type | Similarity | Description |
|------|------------|-------------|
| `similar` | > 0.85 | Nearly identical content |
| `related` | 0.6 - 0.85 | Same topic area |
| `updates` | > 0.85 + patterns | New info replacing old |
| `contradicts` | > 0.85 + negation | Opposite statements |

### 5. Conflict Resolver (`conflict-resolver.ts`)

Handles contradictions when adding new memories.

**Detection:**
```typescript
const conflict = await detectMemoryConflict(agentId, newContent, existingMemories)
// { hasConflict: true, conflictType: 'direct_contradiction', resolution: 'keep_new' }
```

**Resolution strategies:**
| Strategy | Action |
|----------|--------|
| `keep_new` | Mark old as superseded, add new |
| `keep_old` | Skip the new memory |
| `merge` | Combine both into one |

### 6. Memory Scheduler (`memory-scheduler.ts`)

Runs periodic background tasks.

**Decay process (every 4 hours):**
```
For each memory:
  days_since_recall = (now - lastRecalledAt) / day
  decay_rate = max(2, 5 - emotionalWeight * 0.03)
  strength -= decay_rate * days_since_recall

  If strength < 20: vividness = 'fragment'
  If strength < 50: vividness = 'hazy'
  If strength < 80: vividness = 'clear'
  If strength <= 0: DELETE memory
```

---

## Data Flow

### Writing Memories

```
1. User sends message
         │
         ▼
2. Smart Extraction checks if worth extracting
   ├── Skip: "Hello!" → No extraction
   └── Extract: "I'm a software engineer" → Continue
         │
         ▼
3. Memory Extractor (LLM) extracts facts/memories
   → UserFact: "User is a software engineer"
   → AgentMemory: "User shared their profession"
         │
         ▼
4. Conflict Resolver checks for contradictions
   ├── No conflict → Add normally
   └── Conflict with "User is a student" → Supersede old
         │
         ▼
5. Embedding Service generates vector
   → [0.12, -0.34, 0.56, ...]
         │
         ▼
6. SQLite Storage saves memory + embedding
         │
         ▼
7. Memory Linker finds and creates links
   → Links to "User likes programming"
```

### Reading Memories

```
1. New conversation starts
         │
         ▼
2. System prompt needs context
         │
         ▼
3. Hybrid Retrieval:
   a. Generate query embedding
   b. Find semantically similar memories
   c. Score = 0.6 * similarity + 0.4 * (strength/100)
   d. Sort by score, return top K
         │
         ▼
4. (Optional) Knowledge Graph expansion
   → Follow links to find related memories
         │
         ▼
5. Format memories for system prompt
   → "The user is a software engineer who likes Python..."
```

---

## Memory Lifecycle

```
                    ┌─────────────────┐
                    │    Created      │
                    │  strength: 100  │
                    │  vividness: vivid│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐    ┌────────┐
         │ Decay  │    │ Recall │    │Conflict│
         │ (time) │    │ (use)  │    │ (new)  │
         └───┬────┘    └───┬────┘    └───┬────┘
             │             │             │
             ▼             ▼             ▼
      strength -= X   strength += 5   superseded
                           │
                           ▼
                    vividness upgrades
                    (fragment → hazy → clear)
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐    ┌────────┐
         │ Vivid  │    │ Clear  │    │Fragment│
         │ 80-100 │    │ 50-80  │    │ 0-20   │
         └────────┘    └────────┘    └───┬────┘
                                         │
                                         ▼
                                    ┌────────┐
                                    │Deleted │
                                    │strength=0│
                                    └────────┘
```

---

## Configuration

### Memory Scheduler
```typescript
// src/main/index.ts
await startMemoryScheduler({
  decayIntervalMs: 4 * 60 * 60 * 1000,  // 4 hours
  runOnStart: true,                      // Run decay on app start
  debug: process.env.NODE_ENV === 'development'
})
```

### Hybrid Retrieval Weights
```typescript
// In sqlite-storage.ts
const options = {
  similarityWeight: 0.6,   // Semantic relevance
  strengthWeight: 0.4,     // Memory strength
  minSimilarity: 0.3       // Threshold to include
}
```

### Conflict Detection Threshold
```typescript
// In conflict-resolver.ts
const CONFLICT_SIMILARITY_THRESHOLD = 0.8  // Very similar = potential conflict
```

---

## Database Schema

```sql
-- User facts with embeddings
CREATE TABLE user_facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence INTEGER DEFAULT 80,
  sources TEXT DEFAULT '[]',
  embedding BLOB,              -- 384-dim float vector
  created_at INTEGER,
  updated_at INTEGER
);

-- Agent memories with embeddings
CREATE TABLE agent_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  strength REAL DEFAULT 100,
  emotional_weight REAL DEFAULT 5,
  created_at INTEGER,
  last_recalled_at INTEGER,
  recall_count INTEGER DEFAULT 0,
  linked_memories TEXT DEFAULT '[]',
  vividness TEXT DEFAULT 'vivid',
  embedding BLOB,              -- 384-dim float vector
  superseded_by TEXT,          -- ID of newer memory
  superseded_at INTEGER
);

-- Knowledge graph links
CREATE TABLE memory_links (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship TEXT NOT NULL,  -- similar, related, updates, contradicts
  similarity REAL NOT NULL,
  created_at INTEGER
);
```

---

## File Structure

```
src/main/
├── services/
│   ├── embedding-service.ts      # Vector embeddings
│   ├── memory-extractor.ts       # LLM extraction
│   ├── memory-linker.ts          # Knowledge graph
│   ├── memory-scheduler.ts       # Periodic decay
│   ├── conflict-resolver.ts      # Contradiction handling
│   └── triggers/
│       ├── memory-extraction.ts  # Trigger integration
│       └── smart-extraction.ts   # Conversation classifier
│
├── storage/
│   ├── index.ts                  # Storage factory
│   ├── interfaces.ts             # Type definitions
│   ├── file-storage.ts           # JSON file backend
│   └── sqlite-storage.ts         # SQLite + vector backend
│
└── index.ts                      # App entry (scheduler init)
```

---

## Usage Example

```typescript
// Adding a memory with conflict resolution
import { addMemoryWithConflictResolution } from './services/conflict-resolver'
import { linkNewMemory } from './services/memory-linker'

const { memory, conflict, resolution } = await addMemoryWithConflictResolution(
  agentId,
  {
    content: "User now prefers tea over coffee",
    category: 'observation',
    strength: 100,
    emotionalWeight: 5,
    createdAt: Date.now(),
    lastRecalledAt: Date.now(),
    recallCount: 0,
    linkedMemories: [],
    vividness: 'vivid'
  }
)

// If memory was created, link it
if (memory) {
  await linkNewMemory(agentId, memory)
}

// Retrieving relevant memories
import { getSQLiteStorage } from './storage'

const storage = getSQLiteStorage()
const memories = await storage.agentMemory.hybridRetrieveMemories(
  agentId,
  "What beverages does the user like?",
  5
)

// memories: [
//   { content: "User now prefers tea over coffee", hybridScore: 0.85, ... },
//   { content: "User drinks coffee every morning", hybridScore: 0.72, ... }
// ]
```
