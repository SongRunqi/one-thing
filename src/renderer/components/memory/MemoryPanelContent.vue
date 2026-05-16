<template>
  <div class="memory-panel-content">
    <div class="memory-header">
      <div class="memory-title-row">
        <div class="memory-title">
          <Brain
            :size="19"
            :stroke-width="1.7"
          />
          <span>Memory</span>
        </div>
        <div class="memory-actions">
          <button
            class="icon-btn"
            type="button"
            title="Reveal directory"
            :disabled="!overview"
            @click="revealMemoryRoot"
          >
            <FolderOpen
              :size="16"
              :stroke-width="1.8"
            />
          </button>
          <button
            class="icon-btn"
            type="button"
            title="Refresh"
            :disabled="loading"
            @click="loadOverview()"
          >
            <RefreshCw
              :size="16"
              :stroke-width="1.8"
              :class="{ spinning: loading }"
            />
          </button>
        </div>
      </div>

      <div class="memory-stats">
        <span :class="['status-pill', { off: overview?.enabled === false }]">
          {{ overview?.enabled === false ? 'Off' : 'On' }}
        </span>
        <span>{{ overview?.canonicalCount ?? 0 }} profile</span>
        <span>{{ overview?.files.length ?? 0 }} files</span>
        <span>{{ overview?.status.indexedChunks ?? 0 }} chunks</span>
        <span>{{ overview?.status.ftsTokenizer || 'FTS' }}</span>
      </div>

      <div class="root-path">
        {{ overview?.root || 'Loading...' }}
      </div>

      <div class="memory-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['memory-tab', { active: activeTab === tab.id }]"
          type="button"
          @click="activeTab = tab.id"
        >
          <component
            :is="tab.icon"
            :size="14"
            :stroke-width="1.8"
          />
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <div class="memory-body">
      <div
        v-if="error"
        class="notice error"
      >
        {{ error }}
      </div>

      <div
        v-if="loading && !overview"
        class="loading-state"
      >
        <Loader2
          :size="26"
          :stroke-width="1.8"
          class="spinning"
        />
        <span>Loading memory...</span>
      </div>

      <template v-else-if="activeTab === 'overview'">
        <div class="overview-stack">
          <section class="memory-section">
            <div class="overview-grid">
              <div>
                <span class="setting-title">Index</span>
                <strong>{{ overview?.status.indexedFiles ?? 0 }} files / {{ overview?.status.indexedChunks ?? 0 }} chunks</strong>
                <span class="setting-meta">{{ overview?.status.embeddingProvider ? `${overview.status.embeddingProvider}/${overview.status.embeddingModel}` : 'FTS fallback' }}</span>
              </div>
              <div>
                <span class="setting-title">Capture</span>
                <strong>{{ overview?.status.lastCaptureStatus || memorySettings.capture.mode }}</strong>
                <span class="setting-meta">{{ formatMaybeDate(overview?.status.lastCaptureAt) }}</span>
              </div>
              <div>
                <span class="setting-title">Flush</span>
                <strong>{{ overview?.status.lastFlushError ? 'error' : 'ready' }}</strong>
                <span class="setting-meta">{{ formatMaybeDate(overview?.status.lastFlushAt) }}</span>
              </div>
              <div>
                <span class="setting-title">Dreaming</span>
                <strong :class="['status-line', dreamingStatusClass]">
                  <Loader2
                    v-if="isDreamingInFlight"
                    :size="13"
                    :stroke-width="1.8"
                    class="spinning"
                  />
                  <span>{{ dreamingStatusLabel }}</span>
                </strong>
                <span class="setting-meta">{{ dreamingMetaLine }}</span>
              </div>
            </div>
            <div class="action-row">
              <button
                class="secondary-action inline"
                type="button"
                :disabled="loading"
                @click="rebuildIndex"
              >
                <Database
                  :size="15"
                  :stroke-width="1.8"
                />
                <span>Reindex</span>
              </button>
              <button
                class="secondary-action inline"
                type="button"
                :disabled="isDreamingInFlight"
                @click="runDreaming"
              >
                <Loader2
                  v-if="isDreamingInFlight"
                  :size="15"
                  :stroke-width="1.8"
                  class="spinning"
                />
                <Sparkles
                  v-else
                  :size="15"
                  :stroke-width="1.8"
                />
                <span>{{ isDreamingInFlight ? 'Running...' : 'Run dreaming' }}</span>
              </button>
            </div>
          </section>

          <section
            v-if="overview?.status.lastError || overview?.status.lastCaptureError || overview?.status.lastFlushError || overview?.dreaming.lastError"
            class="memory-section"
          >
            <div
              v-if="overview?.status.lastError"
              class="inline-error"
            >
              Index: {{ overview.status.lastError }}
            </div>
            <div
              v-if="overview?.status.lastCaptureError"
              class="inline-error"
            >
              Capture: {{ overview.status.lastCaptureError }}
            </div>
            <div
              v-if="overview?.status.lastFlushError"
              class="inline-error"
            >
              Flush: {{ overview.status.lastFlushError }}
            </div>
            <div
              v-if="overview?.dreaming.lastError"
              class="inline-error"
            >
              Dreaming: {{ overview.dreaming.lastError }}
            </div>
          </section>

          <section class="memory-section">
            <div class="file-list compact">
              <button
                v-for="file in overview?.files.filter(item => item.kind !== 'daily') || []"
                :key="file.relativePath"
                class="file-row"
                type="button"
                @click="openFileInTab(file)"
              >
                <component
                  :is="kindIcon(file.kind)"
                  :size="17"
                  :stroke-width="1.8"
                  class="file-icon"
                />
                <span class="file-main">
                  <span class="file-name">{{ file.relativePath }}</span>
                  <span class="file-meta">{{ kindLabel(file.kind) }} · {{ file.lineCount }} lines · {{ formatSize(file.size) }}</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      </template>

      <template v-else-if="activeTab === 'profile'">
        <div class="profile-toolbar">
          <form
            class="search-row"
            @submit.prevent="loadProfile"
          >
            <input
              v-model="profileSearch"
              class="memory-input"
              type="text"
              placeholder="Search user profile..."
              spellcheck="false"
            >
            <button
              class="primary-btn"
              type="submit"
              :disabled="profileLoading"
            >
              <Search
                :size="15"
                :stroke-width="1.8"
              />
              <span>Search</span>
            </button>
          </form>
          <div class="action-row">
            <button
              class="secondary-action inline"
              type="button"
              @click="resetProfileForm"
            >
              New
            </button>
            <button
              class="secondary-action inline"
              type="button"
              :disabled="profileLoading"
              @click="exportProfile"
            >
              Export
            </button>
          </div>
        </div>

        <div class="profile-layout">
          <div class="profile-list">
            <button
              v-for="memory in profileRecords"
              :key="memory.id"
              :class="['profile-row', { active: profileForm.id === memory.id }]"
              type="button"
              @click="selectProfile(memory)"
            >
              <span class="profile-row-top">
                <code>{{ memory.memoryKey }}</code>
                <span>{{ memory.confidence.toFixed(2) }}</span>
              </span>
              <strong>{{ memory.text }}</strong>
              <span>{{ memory.kind }} · {{ formatMaybeDate(memory.updatedAt) }}</span>
            </button>
            <div
              v-if="!profileLoading && profileRecords.length === 0"
              class="notice compact"
            >
              No canonical profile rows yet.
            </div>
          </div>

          <section class="profile-editor memory-section">
            <div class="profile-grid">
              <label>
                <span class="setting-label">Key</span>
                <input
                  v-model="profileForm.memoryKey"
                  class="memory-input"
                  type="text"
                  placeholder="user.preference.language"
                  spellcheck="false"
                >
              </label>
              <label>
                <span class="setting-label">Kind</span>
                <select
                  v-model="profileForm.kind"
                  class="memory-select"
                >
                  <option
                    v-for="kind in profileKinds"
                    :key="kind"
                    :value="kind"
                  >
                    {{ kind }}
                  </option>
                </select>
              </label>
              <label>
                <span class="setting-label">Subject</span>
                <input
                  v-model="profileForm.subject"
                  class="memory-input"
                  type="text"
                  spellcheck="false"
                >
              </label>
              <label>
                <span class="setting-label">Confidence</span>
                <input
                  v-model.number="profileForm.confidence"
                  class="memory-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                >
              </label>
            </div>
            <label>
              <span class="setting-label">Value</span>
              <input
                v-model="profileForm.value"
                class="memory-input"
                type="text"
                spellcheck="true"
              >
            </label>
            <label>
              <span class="setting-label">Text</span>
              <textarea
                v-model="profileForm.text"
                class="memory-textarea"
                spellcheck="true"
              />
            </label>
            <label>
              <span class="setting-label">Evidence</span>
              <textarea
                v-model="profileForm.evidence"
                class="memory-textarea compact-area"
                spellcheck="true"
              />
            </label>
            <div class="action-row">
              <button
                class="primary-btn"
                type="button"
                :disabled="profileSaving || !profileForm.value.trim()"
                @click="saveProfile"
              >
                Save
              </button>
              <button
                class="secondary-action inline danger"
                type="button"
                :disabled="profileSaving || !profileForm.id"
                @click="deleteProfile"
              >
                Delete
              </button>
            </div>
            <div
              v-if="profileAudit.length"
              class="audit-list"
            >
              <strong>Audit</strong>
              <div
                v-for="event in profileAudit"
                :key="event.id"
                class="audit-row"
              >
                <span>{{ event.action }}</span>
                <span>{{ formatMaybeDate(event.createdAt) }}</span>
              </div>
            </div>
            <textarea
              v-if="profileExportText"
              v-model="profileExportText"
              class="memory-textarea export-area"
              readonly
            />
          </section>
        </div>
      </template>

      <template v-else-if="isFileTab">
        <div class="file-list">
          <button
            v-for="file in visibleFiles"
            :key="file.relativePath"
            :class="['file-row', { active: selectedPath === file.relativePath }]"
            type="button"
            @click="selectFile(file)"
          >
            <component
              :is="kindIcon(file.kind)"
              :size="17"
              :stroke-width="1.8"
              class="file-icon"
            />
            <span class="file-main">
              <span class="file-name">{{ file.relativePath }}</span>
              <span class="file-meta">{{ kindLabel(file.kind) }} · {{ file.lineCount }} lines · {{ formatSize(file.size) }}</span>
              <span
                v-if="file.preview"
                class="file-preview"
              >{{ file.preview }}</span>
            </span>
            <span class="file-date">{{ formatShortDate(file.mtimeMs) }}</span>
          </button>
        </div>

        <div
          v-if="selectedFile"
          class="viewer"
        >
          <div class="viewer-header">
            <span>{{ selectedFile.relativePath }}:{{ selectedFile.startLine }}-{{ selectedFile.endLine }}</span>
            <button
              class="text-btn"
              type="button"
              :disabled="savingFile"
              @click="saveSelectedFile"
            >
              Save
            </button>
            <button
              class="text-btn"
              type="button"
              @click="readSelectedFile(undefined, true)"
            >
              Reload
            </button>
            <button
              class="text-btn"
              type="button"
              @click="openSelectedPath"
            >
              Open
            </button>
          </div>
          <textarea
            v-model="selectedFileText"
            class="memory-editor"
            spellcheck="true"
          />
          <div
            v-if="selectedFile.truncated"
            class="notice compact"
          >
            File is truncated in the editor.
          </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'search'">
        <form
          class="search-row"
          @submit.prevent="runSearch"
        >
          <input
            v-model="searchQuery"
            class="memory-input"
            type="text"
            placeholder="Search memory..."
            spellcheck="false"
          >
          <button
            class="primary-btn"
            type="submit"
            :disabled="searching || !searchQuery.trim()"
          >
            <Search
              :size="15"
              :stroke-width="1.8"
            />
            <span>Search</span>
          </button>
        </form>

        <div class="append-box">
          <div class="append-top">
            <select
              v-model="appendTarget"
              class="memory-select"
            >
              <option value="daily">
                Daily
              </option>
              <option value="memory">
                MEMORY.md
              </option>
            </select>
            <input
              v-model="appendHeading"
              class="memory-input compact"
              type="text"
              placeholder="Heading"
              spellcheck="false"
            >
          </div>
          <textarea
            v-model="appendContent"
            class="memory-textarea"
            placeholder="Append memory..."
            spellcheck="true"
          />
          <button
            class="secondary-action"
            type="button"
            :disabled="appending || !appendContent.trim()"
            @click="appendMemory"
          >
            <Plus
              :size="15"
              :stroke-width="1.8"
            />
            <span>Append</span>
          </button>
        </div>

        <div
          v-if="searching"
          class="notice"
        >
          Searching...
        </div>
        <div
          v-else-if="searchResults.length === 0 && searched"
          class="notice"
        >
          No matches.
        </div>
        <div
          v-else
          class="search-results"
        >
          <button
            v-for="hit in searchResults"
            :key="hit.id"
            class="result-row"
            type="button"
            @click="openSearchHit(hit)"
          >
            <span class="result-path">{{ hit.path }}:{{ hit.startLine }}-{{ hit.endLine }}</span>
            <span class="result-score">{{ hit.score.toFixed(3) }}</span>
            <span class="result-content">{{ hit.content }}</span>
          </button>
        </div>
      </template>

      <template v-else-if="activeTab === 'scheduler'">
        <div class="settings-stack">
          <section class="memory-section">
            <div class="setting-row">
              <div>
                <span class="setting-title">Scheduler</span>
                <span class="setting-meta">{{ schedulerTasks.length }} registered tasks</span>
              </div>
              <button
                class="secondary-action inline"
                type="button"
                :disabled="schedulerLoading"
                @click="loadScheduler"
              >
                <RefreshCw
                  :size="15"
                  :stroke-width="1.8"
                  :class="{ spinning: schedulerLoading }"
                />
                <span>Refresh</span>
              </button>
            </div>
            <div
              v-if="schedulerTasks.length === 0"
              class="notice compact"
            >
              No scheduled tasks registered.
            </div>
            <div
              v-for="task in schedulerTasks"
              :key="task.id"
              class="scheduler-task"
            >
              <div class="scheduler-task-main">
                <strong>{{ task.name || task.id }}</strong>
                <code>{{ task.id }}</code>
                <span>{{ task.enabled ? 'enabled' : 'disabled' }} · {{ task.inFlight ? 'running' : 'idle' }}</span>
              </div>
              <div class="dreaming-status">
                <span>Next</span>
                <strong>{{ formatMaybeDate(task.nextRunAt) }}</strong>
                <span>Last</span>
                <strong>{{ formatMaybeDate(task.lastRunAt) }}</strong>
                <span>Result</span>
                <strong>{{ task.lastError || task.lastRunReason || 'none' }}</strong>
              </div>
              <div class="action-row">
                <button
                  class="secondary-action inline"
                  type="button"
                  :disabled="schedulerActionId === task.id || task.inFlight"
                  @click="runSchedulerTask(task.id)"
                >
                  {{ task.inFlight ? 'Running...' : 'Run now' }}
                </button>
                <button
                  class="secondary-action inline"
                  type="button"
                  :disabled="schedulerActionId === task.id"
                  @click="setSchedulerEnabled(task.id, !task.enabled)"
                >
                  {{ task.enabled ? 'Disable' : 'Enable' }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </template>

      <template v-else>
        <div class="settings-stack">
          <div class="settings-group-title">
            Core
          </div>
          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Soul Memory plugin</span>
                  <span class="setting-meta">Master switch · SOUL.md and canonical profile injection</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.enabled !== false"
                  @change="updateSoulMemory({ enabled: ($event.target as HTMLInputElement).checked })"
                >
              </label>
            </div>

            <div class="setting-row">
              <label class="setting-label">Directory</label>
              <div class="segmented">
                <button
                  :class="{ active: memorySettings.directoryMode === 'ai-note-dir' }"
                  type="button"
                  @click="updateSoulMemory({ directoryMode: 'ai-note-dir' })"
                >
                  AI note dir
                </button>
                <button
                  :class="{ active: memorySettings.directoryMode === 'custom' }"
                  type="button"
                  @click="updateSoulMemory({ directoryMode: 'custom' })"
                >
                  Custom
                </button>
              </div>
              <div
                v-if="memorySettings.directoryMode === 'custom'"
                class="inline-field"
              >
                <input
                  class="memory-input"
                  :value="memorySettings.customDirectory"
                  spellcheck="false"
                  placeholder="/path/to/memory"
                  @change="updateSoulMemory({ customDirectory: ($event.target as HTMLInputElement).value })"
                >
                <button
                  class="icon-btn bordered"
                  type="button"
                  title="Choose directory"
                  @click="chooseMemoryDirectory"
                >
                  <FolderOpen
                    :size="15"
                    :stroke-width="1.8"
                  />
                </button>
              </div>
            </div>

            <div class="setting-row">
              <label class="range-label">
                <span>Prompt cap</span>
                <strong>{{ memorySettings.bootstrapMaxChars }}</strong>
              </label>
              <input
                class="memory-range"
                type="range"
                :min="2000"
                :max="50000"
                :step="1000"
                :value="memorySettings.bootstrapMaxChars"
                :disabled="memorySettings.enabled === false"
                @change="updateSoulMemory({ bootstrapMaxChars: Number(($event.target as HTMLInputElement).value) })"
              >
            </div>
          </section>

          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Canonical User Profile</span>
                  <span class="setting-meta">SQLite source of truth · {{ overview?.canonicalCount ?? 0 }} rows</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.canonicalMemory.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ canonicalMemory: { ...memorySettings.canonicalMemory, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Stores durable user identity, preferences, facts, constraints, and accepted decisions. This is read into prompts as the canonical profile.
            </div>
            <div class="grid-two">
              <label class="field">
                <span>High-confidence threshold</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="memorySettings.canonicalMemory.highConfidenceThreshold"
                  :disabled="memorySettings.enabled === false || memorySettings.canonicalMemory.enabled === false"
                  @change="updateSoulMemory({ canonicalMemory: { ...memorySettings.canonicalMemory, highConfidenceThreshold: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Semantic dedupe threshold</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="memorySettings.canonicalMemory.semanticDedupeThreshold"
                  :disabled="memorySettings.enabled === false || memorySettings.canonicalMemory.enabled === false"
                  @change="updateSoulMemory({ canonicalMemory: { ...memorySettings.canonicalMemory, semanticDedupeThreshold: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
          </section>

          <div class="settings-group-title">
            Writes
          </div>
          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Capture after response</span>
                  <span class="setting-meta">writes memory · {{ memorySettings.capture.mode }} · {{ memorySettings.capture.targetPolicy }}</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.capture.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Runs after an assistant reply. High-confidence user-backed facts go to SQLite; medium-confidence working notes go to today's daily note.
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Mode</span>
                <select
                  class="memory-select"
                  :value="memorySettings.capture.mode"
                  :disabled="memorySettings.enabled === false || memorySettings.capture.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, mode: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="explicit-only">
                    Explicit only
                  </option>
                  <option value="auto">
                    Auto
                  </option>
                  <option value="off">
                    Off
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Target policy</span>
                <select
                  class="memory-select"
                  :value="memorySettings.capture.targetPolicy"
                  :disabled="memorySettings.enabled === false || memorySettings.capture.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, targetPolicy: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="canonical-first">
                    Canonical first
                  </option>
                  <option value="daily-only">
                    Daily only
                  </option>
                  <option value="hybrid">
                    Hybrid
                  </option>
                </select>
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Policy</span>
                <select
                  class="memory-select"
                  :value="memorySettings.capture.policy"
                  :disabled="memorySettings.enabled === false || memorySettings.capture.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, policy: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="high-confidence">
                    High confidence
                  </option>
                  <option value="aggressive">
                    Aggressive
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Long-term confidence</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="memorySettings.capture.longTermMinConfidence"
                  :disabled="memorySettings.enabled === false || memorySettings.capture.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, longTermMinConfidence: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Daily confidence</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="memorySettings.capture.dailyMinConfidence"
                  :disabled="memorySettings.enabled === false || memorySettings.capture.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, dailyMinConfidence: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Timeout ms</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1000"
                  max="60000"
                  step="1000"
                  :value="memorySettings.capture.timeoutMs"
                  :disabled="memorySettings.enabled === false || memorySettings.capture.enabled === false"
                  @change="updateSoulMemory({ capture: { ...memorySettings.capture, timeoutMs: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
          </section>

          <div class="settings-group-title">
            Read / Recall
          </div>
          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Active Memory</span>
                  <span class="setting-meta">reads before each turn · {{ memorySettings.activeMemory.queryMode }} · {{ memorySettings.activeMemory.promptStyle }}</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.activeMemory.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ activeMemory: { ...memorySettings.activeMemory, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Searches SQLite profile rows and Markdown notes before a request, then injects matching context as untrusted recall.
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Query</span>
                <select
                  class="memory-select"
                  :value="memorySettings.activeMemory.queryMode"
                  :disabled="memorySettings.enabled === false || memorySettings.activeMemory.enabled === false"
                  @change="updateSoulMemory({ activeMemory: { ...memorySettings.activeMemory, queryMode: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="recent">
                    Recent
                  </option>
                  <option value="message">
                    Message
                  </option>
                  <option value="full">
                    Full tail
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Style</span>
                <select
                  class="memory-select"
                  :value="memorySettings.activeMemory.promptStyle"
                  :disabled="memorySettings.enabled === false || memorySettings.activeMemory.enabled === false"
                  @change="updateSoulMemory({ activeMemory: { ...memorySettings.activeMemory, promptStyle: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="balanced">
                    Balanced
                  </option>
                  <option value="strict">
                    Strict
                  </option>
                  <option value="contextual">
                    Contextual
                  </option>
                  <option value="recall-heavy">
                    Recall-heavy
                  </option>
                  <option value="precision-heavy">
                    Precision-heavy
                  </option>
                  <option value="preference-only">
                    Preference-only
                  </option>
                </select>
              </label>
            </div>
          </section>

          <div class="settings-group-title">
            Maintenance
          </div>
          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Search index</span>
                  <span class="setting-meta">derived index · {{ memorySettings.search.maxResults }} results · {{ memorySettings.search.chunkTokens }} tokens</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.search.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ search: { ...memorySettings.search, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Maintains SQLite FTS and chunk metadata for Markdown notes. It is rebuildable infrastructure, not the memory source of truth.
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Results</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1"
                  max="20"
                  :value="memorySettings.search.maxResults"
                  :disabled="memorySettings.enabled === false || memorySettings.search.enabled === false"
                  @change="updateSoulMemory({ search: { ...memorySettings.search, maxResults: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Chunk tokens</span>
                <input
                  class="memory-input"
                  type="number"
                  min="100"
                  max="2000"
                  step="50"
                  :value="memorySettings.search.chunkTokens"
                  :disabled="memorySettings.enabled === false || memorySettings.search.enabled === false"
                  @change="updateSoulMemory({ search: { ...memorySettings.search, chunkTokens: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Overlap</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="1000"
                  step="10"
                  :value="memorySettings.search.chunkOverlap"
                  :disabled="memorySettings.enabled === false || memorySettings.search.enabled === false"
                  @change="updateSoulMemory({ search: { ...memorySettings.search, chunkOverlap: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Half-life days</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1"
                  max="365"
                  :value="memorySettings.search.temporalDecayHalfLifeDays"
                  :disabled="memorySettings.enabled === false || memorySettings.search.enabled === false"
                  @change="updateSoulMemory({ search: { ...memorySettings.search, temporalDecayHalfLifeDays: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">MMR dedupe</span>
                  <span class="setting-meta">{{ memorySettings.search.mmrEnabled ? 'on' : 'off' }}</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.search.mmrEnabled !== false"
                  :disabled="memorySettings.enabled === false || memorySettings.search.enabled === false"
                  @change="updateSoulMemory({ search: { ...memorySettings.search, mmrEnabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
          </section>

          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Embeddings</span>
                  <span class="setting-meta">search vectors · {{ embeddingTarget.providerLabel }} · {{ embeddingTarget.model }}</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.embeddings.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Used for vector search and semantic duplicate hints. Prompt injection and FTS search still work when embeddings are unavailable.
            </div>

            <div :class="['embedding-target', { warning: !embeddingTarget.available }]">
              <span>Provider</span>
              <strong>{{ embeddingTarget.providerLabel }}</strong>
              <span>Model</span>
              <code>{{ embeddingTarget.model }}</code>
              <span>Base URL</span>
              <code>{{ embeddingTarget.baseUrl || 'Custom base URL required' }}</code>
              <span>Key</span>
              <strong>{{ embeddingTarget.apiKeyHint }}</strong>
            </div>

            <div class="grid-two">
              <label class="field">
                <span>Provider</span>
                <select
                  class="memory-select"
                  :value="memorySettings.embeddings.providerId"
                  :disabled="memorySettings.enabled === false || memorySettings.embeddings.enabled === false"
                  @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, providerId: ($event.target as HTMLSelectElement).value } })"
                >
                  <option value="auto">
                    Auto
                  </option>
                  <option value="openai">
                    OpenAI
                  </option>
                  <option value="gemini">
                    Gemini
                  </option>
                  <option value="openrouter">
                    OpenRouter
                  </option>
                  <option value="custom">
                    Custom
                  </option>
                  <option value="ollama">
                    Ollama
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Model</span>
                <input
                  class="memory-input"
                  :value="memorySettings.embeddings.model"
                  :placeholder="embeddingTarget.model"
                  spellcheck="false"
                  :disabled="memorySettings.enabled === false || memorySettings.embeddings.enabled === false"
                  @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, model: ($event.target as HTMLInputElement).value } })"
                >
              </label>
            </div>

            <label
              v-if="memorySettings.embeddings.providerId === 'custom'"
              class="field"
            >
              <span>Custom provider</span>
              <select
                class="memory-select"
                :value="memorySettings.embeddings.customProviderId"
                :disabled="memorySettings.enabled === false || memorySettings.embeddings.enabled === false"
                @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, customProviderId: ($event.target as HTMLSelectElement).value } })"
              >
                <option value="">
                  First compatible provider
                </option>
                <option
                  v-for="provider in openAICompatibleCustomProviders"
                  :key="provider.id"
                  :value="provider.id"
                >
                  {{ provider.name || provider.id }}
                </option>
              </select>
            </label>

            <div
              v-if="memorySettings.embeddings.providerId !== 'auto'"
              class="grid-two"
            >
              <label class="field">
                <span>API key</span>
                <input
                  class="memory-input"
                  type="password"
                  :value="memorySettings.embeddings.apiKey"
                  placeholder="Provider key"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="memorySettings.enabled === false || memorySettings.embeddings.enabled === false"
                  @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, apiKey: ($event.target as HTMLInputElement).value } })"
                >
              </label>
              <label class="field">
                <span>Dimensions</span>
                <input
                  class="memory-input"
                  type="number"
                  :value="memorySettings.embeddings.dimensions || ''"
                  placeholder="Default"
                  :disabled="memorySettings.enabled === false || memorySettings.embeddings.enabled === false"
                  @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, dimensions: Number(($event.target as HTMLInputElement).value) || 0 } })"
                >
              </label>
            </div>

            <label
              v-if="memorySettings.embeddings.providerId !== 'auto'"
              class="field"
            >
              <span>Base URL</span>
              <input
                class="memory-input"
                :value="memorySettings.embeddings.baseUrl"
                :placeholder="embeddingTarget.baseUrl || 'OpenAI-compatible /v1 endpoint'"
                spellcheck="false"
                :disabled="memorySettings.enabled === false || memorySettings.embeddings.enabled === false"
                @change="updateSoulMemory({ embeddings: { ...memorySettings.embeddings, baseUrl: ($event.target as HTMLInputElement).value } })"
              >
            </label>
          </section>

          <div class="settings-group-title">
            Read / Recall
          </div>
          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Daily context</span>
                  <span class="setting-meta">reads daily notes · {{ memorySettings.dailyContext.mode }} · {{ memorySettings.dailyContext.daysBack }} days</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.dailyContext.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ dailyContext: { ...memorySettings.dailyContext, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Injects recent daily note excerpts into the prompt. It only reads files; it does not create or update memory.
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Mode</span>
                <select
                  class="memory-select"
                  :value="memorySettings.dailyContext.mode"
                  :disabled="memorySettings.enabled === false || memorySettings.dailyContext.enabled === false"
                  @change="updateSoulMemory({ dailyContext: { ...memorySettings.dailyContext, mode: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="session-start">
                    New chats
                  </option>
                  <option value="always">
                    Every turn
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Days back</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="14"
                  :value="memorySettings.dailyContext.daysBack"
                  :disabled="memorySettings.enabled === false || memorySettings.dailyContext.enabled === false"
                  @change="updateSoulMemory({ dailyContext: { ...memorySettings.dailyContext, daysBack: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
          </section>

          <div class="settings-group-title">
            Writes / Background
          </div>
          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Compact Memory Flush</span>
                  <span class="setting-meta">writes before compact · {{ memorySettings.memoryFlush.maxInputChars }} chars</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.memoryFlush.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ memoryFlush: { ...memorySettings.memoryFlush, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Runs only before context compact. Turning this off does not disable chat compacting; it only stops compact-time memory writes.
            </div>
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Memory Dreaming</span>
                  <span class="setting-meta">scheduled writes · {{ overview?.dreaming.frequency || memorySettings.dreaming.frequency }}</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.dreaming.enabled === true"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Runs as a managed scheduler task. It reviews notes/signals/sessions, then writes reports and thresholded promotions.
            </div>
            <div class="dreaming-status">
              <span>Next</span>
              <strong>{{ formatMaybeDate(overview?.dreaming.nextRunAt) }}</strong>
              <span>Last</span>
              <strong>{{ formatMaybeDate(overview?.dreaming.lastRunAt) }}</strong>
              <span>Status</span>
              <strong>{{ overview?.dreaming.lastStatus || 'none' }}</strong>
            </div>
            <div class="action-row">
              <button
                class="secondary-action inline"
                type="button"
                :disabled="isDreamingInFlight"
                @click="runDreaming"
              >
                <Sparkles
                  :size="15"
                  :stroke-width="1.8"
                />
                <span>{{ isDreamingInFlight ? 'Running...' : 'Run now' }}</span>
              </button>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Schedule</span>
                <input
                  class="memory-input"
                  :value="memorySettings.dreaming.frequency"
                  spellcheck="false"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, frequency: ($event.target as HTMLInputElement).value } })"
                >
              </label>
              <label class="field">
                <span>Timezone</span>
                <input
                  class="memory-input"
                  :value="memorySettings.dreaming.timezone"
                  placeholder="System"
                  spellcheck="false"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, timezone: ($event.target as HTMLInputElement).value } })"
                >
              </label>
            </div>
            <label class="field">
              <span>Model</span>
              <input
                class="memory-input"
                :value="memorySettings.dreaming.model"
                placeholder="Current chat model"
                spellcheck="false"
                :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, model: ($event.target as HTMLInputElement).value } })"
              >
            </label>
            <div class="source-toggles">
              <label
                v-for="source in dreamSourceOptions"
                :key="source"
                class="mini-toggle"
              >
                <input
                  type="checkbox"
                  :checked="(memorySettings.dreaming.sources || []).includes(source)"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="toggleDreamingSource(source, ($event.target as HTMLInputElement).checked)"
                >
                <span>{{ source }}</span>
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Lookback days</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1"
                  max="365"
                  :value="memorySettings.dreaming.lookbackDays"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, lookbackDays: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Promotions</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="100"
                  :value="memorySettings.dreaming.maxPromotions"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, maxPromotions: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Source files</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1"
                  max="100"
                  :value="memorySettings.dreaming.maxSourceFiles"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, maxSourceFiles: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Sessions</span>
                <input
                  class="memory-input"
                  type="number"
                  min="0"
                  max="100"
                  :value="memorySettings.dreaming.maxSessions"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, maxSessions: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Messages / session</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1"
                  max="200"
                  :value="memorySettings.dreaming.maxMessagesPerSession"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, maxMessagesPerSession: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
              <label class="field">
                <span>Input chars</span>
                <input
                  class="memory-input"
                  type="number"
                  min="2000"
                  max="200000"
                  step="1000"
                  :value="memorySettings.dreaming.maxInputChars"
                  :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                  @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, maxInputChars: Number(($event.target as HTMLInputElement).value) } })"
                >
              </label>
            </div>
            <label class="field">
              <span>Timeout ms</span>
              <input
                class="memory-input"
                type="number"
                min="5000"
                max="300000"
                step="5000"
                :value="memorySettings.dreaming.timeoutMs"
                :disabled="memorySettings.enabled === false || memorySettings.dreaming.enabled !== true"
                @change="updateSoulMemory({ dreaming: { ...memorySettings.dreaming, timeoutMs: Number(($event.target as HTMLInputElement).value) } })"
              >
            </label>
            <button
              class="secondary-action"
              type="button"
              :disabled="loading"
              @click="rebuildIndex"
            >
              <Database
                :size="15"
                :stroke-width="1.8"
              />
              <span>Reindex</span>
            </button>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  BookOpen,
  Brain,
  Clock,
  Database,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import type {
  CanonicalMemoryAuditEvent,
  CanonicalMemoryKind,
  CanonicalMemoryRecord,
  MemoryManagedFile,
  MemoryOverview,
  MemoryReadResponse,
  MemorySearchHit,
  SchedulerTaskSnapshotDTO,
  SoulMemorySettings,
} from '@shared/ipc'
import { normalizeSoulMemorySettings } from '@shared/defaults/settings'
import { resolveSoulMemoryEmbeddingTarget } from '@shared/embeddings/defaults'

type TabId = 'overview' | 'profile' | 'ai-notes' | 'daily' | 'dreams' | 'search' | 'scheduler' | 'settings'

const settingsStore = useSettingsStore()

const overview = ref<MemoryOverview | null>(null)
const loading = ref(false)
const searching = ref(false)
const appending = ref(false)
const savingFile = ref(false)
const dreamingRunning = ref(false)
const schedulerLoading = ref(false)
const profileLoading = ref(false)
const profileSaving = ref(false)
const searched = ref(false)
const error = ref('')
const activeTab = ref<TabId>('overview')
const selectedPath = ref('MEMORY.md')
const selectedFile = ref<MemoryReadResponse['file'] | null>(null)
const selectedFileText = ref('')
const searchQuery = ref('')
const searchResults = ref<MemorySearchHit[]>([])
const schedulerTasks = ref<SchedulerTaskSnapshotDTO[]>([])
const profileRecords = ref<CanonicalMemoryRecord[]>([])
const profileAudit = ref<CanonicalMemoryAuditEvent[]>([])
const profileSearch = ref('')
const profileExportText = ref('')
const schedulerActionId = ref('')
const appendTarget = ref<'daily' | 'memory'>('daily')
const appendHeading = ref('Manual memory')
const appendContent = ref('')
const dreamSourceOptions = ['daily', 'sessions', 'short-term', 'memory', 'recall'] as const
const profileKinds: CanonicalMemoryKind[] = ['identity', 'preference', 'constraint', 'decision', 'project', 'fact']
const profileForm = ref({
  id: '',
  memoryKey: '',
  kind: 'fact' as CanonicalMemoryKind,
  subject: 'user',
  value: '',
  text: '',
  confidence: 1,
  sensitivity: 'normal' as 'normal' | 'sensitive' | 'secret',
  evidence: '',
})
let overviewRefreshTimer: number | null = null
let dreamingPollTimer: number | null = null

const tabs: Array<{ id: TabId; label: string; icon: Component }> = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'profile', label: 'User Profile', icon: Database },
  { id: 'ai-notes', label: 'AI Notes', icon: BookOpen },
  { id: 'daily', label: 'Daily', icon: Clock },
  { id: 'dreams', label: 'Dreams', icon: Brain },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'scheduler', label: 'Scheduler', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const memorySettings = computed(() =>
  normalizeSoulMemorySettings(settingsStore.settings.general.soulMemory),
)

const openAICompatibleCustomProviders = computed(() =>
  (settingsStore.settings.ai.customProviders || []).filter(provider => provider.apiType === 'openai'),
)

const embeddingTarget = computed(() =>
  resolveSoulMemoryEmbeddingTarget({
    providerId: memorySettings.value.embeddings.providerId,
    customProviderId: memorySettings.value.embeddings.customProviderId,
    apiKey: memorySettings.value.embeddings.apiKey,
    model: memorySettings.value.embeddings.model,
    baseUrl: memorySettings.value.embeddings.baseUrl,
    providers: settingsStore.settings.ai.providers,
    customProviders: settingsStore.settings.ai.customProviders,
  }),
)

const isDreamingInFlight = computed(() =>
  dreamingRunning.value ||
  overview.value?.dreaming.inFlight === true ||
  schedulerTasks.value.some(task => task.id.includes('memory-dreaming') && task.inFlight),
)

const dreamingStatusLabel = computed(() => {
  if (isDreamingInFlight.value) return 'running'
  if (overview.value?.dreaming.lastError) return 'error'
  return overview.value?.dreaming.lastStatus || (memorySettings.value.dreaming.enabled ? 'scheduled' : 'off')
})

const dreamingStatusClass = computed(() => {
  if (isDreamingInFlight.value) return 'running'
  if (overview.value?.dreaming.lastError) return 'error'
  if (overview.value?.dreaming.lastStatus === 'applied') return 'success'
  if (overview.value?.dreaming.lastStatus === 'skipped') return 'muted'
  return ''
})

const dreamingMetaLine = computed(() => {
  const dreaming = overview.value?.dreaming
  const parts = [
    `last ${formatMaybeDate(dreaming?.lastRunAt)}`,
    typeof dreaming?.lastApplied === 'number' ? `promoted ${dreaming.lastApplied}` : '',
    `next ${formatMaybeDate(dreaming?.nextRunAt)}`,
  ].filter(Boolean)
  return parts.join(' · ')
})

const isFileTab = computed(() =>
  activeTab.value === 'ai-notes' ||
  activeTab.value === 'daily' ||
  activeTab.value === 'dreams',
)

const visibleFiles = computed(() => {
  const files = overview.value?.files || []
  if (activeTab.value === 'ai-notes') return files.filter(file => file.kind === 'soul' || file.kind === 'memory')
  if (activeTab.value === 'daily') return files.filter(file => file.kind === 'daily')
  if (activeTab.value === 'dreams') return files.filter(file => file.kind === 'dreams')
  return []
})

watch(
  () => activeTab.value,
  async (tab) => {
    if (isFileTab.value && overview.value) {
      await ensureFileSelectionForTab()
    }
    if (tab === 'scheduler') {
      await loadScheduler()
    }
    if (tab === 'profile') {
      await loadProfile()
    }
  },
)

onMounted(async () => {
  await loadOverview()
})

onBeforeUnmount(() => {
  if (overviewRefreshTimer) {
    window.clearTimeout(overviewRefreshTimer)
    overviewRefreshTimer = null
  }
  if (dreamingPollTimer) {
    window.clearTimeout(dreamingPollTimer)
    dreamingPollTimer = null
  }
})

async function loadOverview(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.getMemoryOverview()
    if (!response.success || !response.overview) {
      throw new Error(response.error || 'Failed to load memory')
    }
    overview.value = response.overview
    if (!overview.value.files.some(file => file.relativePath === selectedPath.value)) {
      selectedPath.value = overview.value.files.find(file => file.relativePath === 'MEMORY.md')?.relativePath ||
        overview.value.files[0]?.relativePath ||
        ''
    }
    if (isFileTab.value && selectedPath.value) {
      await ensureFileSelectionForTab()
    }
    if (activeTab.value === 'scheduler') {
      await loadScheduler()
    }
    if (activeTab.value === 'profile') {
      await loadProfile()
    }
    syncDreamingPolling()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function rebuildIndex(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.rebuildMemoryIndex()
    if (!response.success) throw new Error(response.error || 'Failed to rebuild memory index')
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function selectFile(file: MemoryManagedFile): Promise<void> {
  selectedPath.value = file.relativePath
  await readSelectedFile(undefined, true)
}

async function ensureFileSelectionForTab(): Promise<void> {
  const files = visibleFiles.value
  if (files.length === 0) {
    selectedFile.value = null
    selectedFileText.value = ''
    return
  }
  if (!files.some(file => file.relativePath === selectedPath.value)) {
    selectedPath.value = files[0].relativePath
  }
  await readSelectedFile(undefined, true)
}

async function readSelectedFile(startLine?: number, full = false): Promise<void> {
  if (!selectedPath.value) return
  const response = await window.electronAPI.readMemoryFile({
    path: selectedPath.value,
    ...(startLine ? { startLine } : {}),
    ...(full ? { full: true } : { lines: startLine ? 180 : 260 }),
  })
  if (!response.success || !response.file) {
    error.value = response.error || 'Failed to read memory file'
    return
  }
  selectedFile.value = response.file
  selectedFileText.value = response.file.text
}

async function saveSelectedFile(): Promise<void> {
  if (!selectedPath.value || !selectedFile.value) return
  savingFile.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.saveMemoryFile({
      path: selectedPath.value,
      content: selectedFileText.value,
    })
    if (!response.success) throw new Error(response.error || 'Failed to save memory file')
    await loadOverview()
    await readSelectedFile(undefined, true)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    savingFile.value = false
  }
}

async function loadProfile(): Promise<void> {
  profileLoading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.listMemoryProfile({
      query: profileSearch.value.trim() || undefined,
      limit: 200,
    })
    if (!response.success || !response.memories) {
      throw new Error(response.error || 'Failed to load user profile')
    }
    profileRecords.value = response.memories
    if (!profileForm.value.id && response.memories[0]) {
      await selectProfile(response.memories[0])
    } else if (profileForm.value.id && !response.memories.some(memory => memory.id === profileForm.value.id)) {
      resetProfileForm()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileLoading.value = false
  }
}

async function selectProfile(memory: CanonicalMemoryRecord): Promise<void> {
  profileExportText.value = ''
  profileForm.value = {
    id: memory.id,
    memoryKey: memory.memoryKey,
    kind: memory.kind,
    subject: memory.subject,
    value: memory.value,
    text: memory.text,
    confidence: memory.confidence,
    sensitivity: memory.sensitivity,
    evidence: memory.evidence || '',
  }
  const response = await window.electronAPI.getMemoryProfileAudit({ id: memory.id })
  profileAudit.value = response.success && response.events ? response.events : []
}

function resetProfileForm(): void {
  profileExportText.value = ''
  profileAudit.value = []
  profileForm.value = {
    id: '',
    memoryKey: '',
    kind: 'fact',
    subject: 'user',
    value: '',
    text: '',
    confidence: 1,
    sensitivity: 'normal',
    evidence: '',
  }
}

async function saveProfile(): Promise<void> {
  profileSaving.value = true
  error.value = ''
  try {
    const form = profileForm.value
    const response = await window.electronAPI.upsertMemoryProfile({
      ...(form.id ? { id: form.id } : {}),
      ...(form.memoryKey.trim() ? { memoryKey: form.memoryKey.trim() } : {}),
      kind: form.kind,
      subject: form.subject.trim() || undefined,
      value: form.value.trim(),
      text: form.text.trim() || form.value.trim(),
      confidence: Math.max(0, Math.min(1, Number(form.confidence) || 0)),
      sensitivity: form.sensitivity,
      evidence: form.evidence.trim() || undefined,
    })
    if (!response.success || !response.memory) {
      throw new Error(response.error || 'Failed to save user profile')
    }
    await loadProfile()
    await selectProfile(response.memory)
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function deleteProfile(): Promise<void> {
  if (!profileForm.value.id) return
  if (!window.confirm('Delete this canonical memory row?')) return
  profileSaving.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.deleteMemoryProfile({ id: profileForm.value.id })
    if (!response.success) throw new Error(response.error || 'Failed to delete user profile row')
    resetProfileForm()
    await loadProfile()
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function exportProfile(): Promise<void> {
  profileLoading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.exportMemoryProfile()
    if (!response.success || !response.markdown) throw new Error(response.error || 'Failed to export profile')
    profileExportText.value = response.markdown
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileLoading.value = false
  }
}

async function runSearch(): Promise<void> {
  const query = searchQuery.value.trim()
  if (!query) return
  searching.value = true
  searched.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.searchMemory({
      query,
      limit: memorySettings.value.search.maxResults,
    })
    if (!response.success || !response.hits) {
      throw new Error(response.error || 'Memory search failed')
    }
    searchResults.value = response.hits
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    searching.value = false
  }
}

async function openSearchHit(hit: MemorySearchHit): Promise<void> {
  if (hit.kind === 'canonical') {
    activeTab.value = 'profile'
    const key = hit.path.replace(/^profile:/, '')
    profileSearch.value = key
    await loadProfile()
    const match = profileRecords.value.find(memory => memory.memoryKey === key || memory.id === hit.id)
    if (match) await selectProfile(match)
    return
  }
  activeTab.value = hit.kind === 'daily' ? 'daily' : 'ai-notes'
  selectedPath.value = hit.path
  await readSelectedFile(hit.startLine)
}

async function openFileInTab(file: MemoryManagedFile): Promise<void> {
  activeTab.value = file.kind === 'daily'
    ? 'daily'
    : file.kind === 'dreams'
      ? 'dreams'
      : 'ai-notes'
  selectedPath.value = file.relativePath
  await readSelectedFile(undefined, true)
}

async function appendMemory(): Promise<void> {
  const content = appendContent.value.trim()
  if (!content) return
  appending.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.appendMemory({
      content,
      target: appendTarget.value,
      heading: appendHeading.value.trim() || undefined,
    })
    if (!response.success) throw new Error(response.error || 'Failed to append memory')
    appendContent.value = ''
    selectedPath.value = response.target?.relativePath || selectedPath.value
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    appending.value = false
  }
}

async function runDreaming(): Promise<void> {
  dreamingRunning.value = true
  error.value = ''
  syncDreamingPolling()
  try {
    const response = await window.electronAPI.runMemoryDreaming()
    if (!response.success) throw new Error(response.error || 'Failed to run dreaming')
    await loadOverview()
    if (activeTab.value === 'scheduler') await loadScheduler()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    dreamingRunning.value = false
    syncDreamingPolling()
  }
}

async function loadScheduler(): Promise<void> {
  schedulerLoading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.listSchedulerTasks()
    if (!response.success || !response.tasks) throw new Error(response.error || 'Failed to load scheduler tasks')
    schedulerTasks.value = response.tasks
    syncDreamingPolling()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    schedulerLoading.value = false
  }
}

function syncDreamingPolling(): void {
  if (!isDreamingInFlight.value) {
    if (dreamingPollTimer) {
      window.clearTimeout(dreamingPollTimer)
      dreamingPollTimer = null
    }
    return
  }
  if (dreamingPollTimer) return
  dreamingPollTimer = window.setTimeout(async () => {
    dreamingPollTimer = null
    await loadOverview()
    if (activeTab.value === 'scheduler') await loadScheduler()
    syncDreamingPolling()
  }, 1500)
}

async function runSchedulerTask(id: string): Promise<void> {
  schedulerActionId.value = id
  error.value = ''
  try {
    const response = await window.electronAPI.runSchedulerTaskNow({ id, force: true })
    if (!response.success) throw new Error(response.error || 'Failed to run scheduled task')
    await loadScheduler()
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    schedulerActionId.value = ''
  }
}

async function setSchedulerEnabled(id: string, enabled: boolean): Promise<void> {
  schedulerActionId.value = id
  error.value = ''
  try {
    const response = await window.electronAPI.setSchedulerTaskEnabled({ id, enabled })
    if (!response.success) throw new Error(response.error || 'Failed to update scheduled task')
    await loadScheduler()
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    schedulerActionId.value = ''
  }
}

async function updateSoulMemory(patch: Partial<SoulMemorySettings>): Promise<void> {
  const nextSettings = {
    ...settingsStore.settings,
    general: {
      ...settingsStore.settings.general,
      soulMemory: {
        ...memorySettings.value,
        ...patch,
      },
    },
  }
  await settingsStore.saveSettings(nextSettings)
  scheduleOverviewRefresh()
}

async function toggleDreamingSource(source: typeof dreamSourceOptions[number], checked: boolean): Promise<void> {
  const current = new Set(memorySettings.value.dreaming.sources)
  if (checked) current.add(source)
  else current.delete(source)
  await updateSoulMemory({
    dreaming: {
      ...memorySettings.value.dreaming,
      sources: Array.from(current),
    },
  })
}

function scheduleOverviewRefresh(): void {
  if (overviewRefreshTimer) {
    window.clearTimeout(overviewRefreshTimer)
  }
  overviewRefreshTimer = window.setTimeout(() => {
    overviewRefreshTimer = null
    void loadOverview()
  }, 350)
}

async function chooseMemoryDirectory(): Promise<void> {
  const result = await window.electronAPI.showOpenDialog({
    title: 'Choose Memory Directory',
    properties: ['openDirectory'],
    defaultPath: memorySettings.value.customDirectory || undefined,
  })
  if (!result.canceled && result.filePaths[0]) {
    await updateSoulMemory({
      directoryMode: 'custom',
      customDirectory: result.filePaths[0],
    })
  }
}

async function revealMemoryRoot(): Promise<void> {
  if (overview.value?.root) {
    await window.electronAPI.revealPath(overview.value.root)
  }
}

async function openSelectedPath(): Promise<void> {
  if (!selectedPath.value || !overview.value) return
  const file = overview.value.files.find(item => item.relativePath === selectedPath.value)
  if (file) await window.electronAPI.openPath(file.absolutePath)
}

function kindIcon(kind: MemoryManagedFile['kind']): Component {
  if (kind === 'soul') return Sparkles
  if (kind === 'memory') return BookOpen
  if (kind === 'dreams') return Brain
  return Clock
}

function kindLabel(kind: MemoryManagedFile['kind']): string {
  if (kind === 'soul') return 'SOUL'
  if (kind === 'memory') return 'AI notes'
  if (kind === 'dreams') return 'Dreaming'
  return 'Daily'
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatShortDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatMaybeDate(ms?: number): string {
  if (!ms) return 'none'
  return new Date(ms).toLocaleString()
}
</script>

<style scoped>
.memory-panel-content {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--text);
}

.memory-header {
  flex-shrink: 0;
  padding: 16px 4px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.memory-title-row,
.memory-actions,
.memory-stats,
.memory-tabs,
.append-top,
.inline-field {
  display: flex;
  align-items: center;
}

.memory-title-row {
  justify-content: space-between;
  gap: 12px;
}

.memory-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
}

.memory-actions {
  gap: 6px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}

.icon-btn.bordered {
  flex-shrink: 0;
  border: 1px solid var(--border);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.memory-stats {
  flex-wrap: wrap;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
}

.memory-stats span {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
}

.status-pill {
  color: var(--accent) !important;
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border)) !important;
}

.status-pill.off {
  color: var(--muted) !important;
  border-color: var(--border) !important;
}

.root-path {
  min-height: 28px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--hover);
  color: var(--muted);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-tabs {
  gap: 6px;
}

.memory-tab {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 10px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.memory-tab.active {
  color: var(--accent);
  background: var(--active);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.memory-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 12px;
}

.loading-state,
.notice {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}

.notice.error {
  min-height: auto;
  justify-content: flex-start;
  margin-bottom: 10px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, #ef4444 45%, var(--border));
  border-radius: 8px;
  color: #ef4444;
  background: color-mix(in srgb, #ef4444 8%, transparent);
}

.notice.compact {
  min-height: 40px;
  justify-content: flex-start;
  padding: 8px 10px;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.file-list,
.search-results,
.settings-stack,
.overview-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-list.compact {
  gap: 0;
}

.file-row,
.result-row {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text);
  padding: 10px;
  cursor: pointer;
  text-align: left;
}

.file-row:hover,
.result-row:hover,
.file-row.active {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: var(--active);
}

.file-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--accent);
}

.file-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-name,
.result-path {
  color: var(--text);
  font-size: 13px;
  font-weight: 620;
  overflow-wrap: anywhere;
}

.file-meta,
.file-date,
.result-score,
.setting-meta {
  color: var(--muted);
  font-size: 11px;
}

.file-preview,
.result-content {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.file-date,
.result-score {
  flex-shrink: 0;
}

.viewer {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.viewer-header {
  min-height: 36px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}

.viewer-header span {
  margin-right: auto;
  overflow-wrap: anywhere;
}

.memory-editor {
  width: 100%;
  min-height: 420px;
  margin: 0;
  padding: 12px;
  border: 0;
  resize: vertical;
  outline: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.viewer pre {
  max-height: 360px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--text);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.text-btn,
.primary-btn,
.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  cursor: pointer;
}

.text-btn {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
}

.text-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--border);
}

.overview-grid > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  background: var(--bg-elevated);
}

.overview-grid strong {
  color: var(--text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.status-line {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.status-line.running {
  color: var(--accent);
}

.status-line.success {
  color: #16a34a;
}

.status-line.error {
  color: #ef4444;
}

.status-line.muted {
  color: var(--muted);
}

.action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--border);
}

.inline-error {
  padding: 8px 10px;
  color: #ef4444;
  font-size: 12px;
  line-height: 1.4;
  border-bottom: 1px solid var(--border);
  overflow-wrap: anywhere;
}

.inline-error:last-child {
  border-bottom: 0;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.memory-input,
.memory-select,
.memory-textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--hover);
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.memory-input,
.memory-select {
  min-height: 34px;
  padding: 7px 10px;
}

.memory-input.compact {
  flex: 1;
}

.memory-textarea {
  min-height: 84px;
  resize: vertical;
  padding: 9px 10px;
  line-height: 1.45;
}

.memory-input:focus,
.memory-select:focus,
.memory-textarea:focus {
  border-color: var(--accent);
}

.primary-btn,
.secondary-action {
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--accent);
  color: white;
  padding: 0 12px;
  font-size: 12px;
  flex-shrink: 0;
}

.secondary-action {
  width: 100%;
  margin-top: 8px;
  background: var(--bg-elevated);
  color: var(--text);
  border-color: var(--border);
}

.secondary-action.inline {
  width: auto;
  min-width: 84px;
  margin-top: 0;
}

.secondary-action.danger {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 38%, var(--border));
}

.primary-btn:disabled,
.secondary-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.append-box {
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
}

.append-top {
  gap: 8px;
  margin-bottom: 8px;
}

.append-top .memory-select {
  width: 118px;
  flex-shrink: 0;
}

.result-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
}

.result-content {
  grid-column: 1 / -1;
  -webkit-line-clamp: 4;
}

.profile-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.profile-toolbar .search-row {
  margin-bottom: 0;
}

.profile-toolbar .action-row {
  padding: 0;
  border-top: 0;
}

.profile-layout {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(260px, 1.15fr);
  gap: 10px;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.profile-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px;
  background: var(--bg-elevated);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.profile-row:hover,
.profile-row.active {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: var(--active);
}

.profile-row-top,
.audit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}

.profile-row code {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--accent);
}

.profile-row strong {
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.profile-row > span:last-child {
  color: var(--muted);
  font-size: 11px;
}

.profile-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.compact-area {
  min-height: 76px;
}

.export-area {
  min-height: 140px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.audit-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.memory-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.settings-group-title {
  color: var(--muted);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0;
  text-transform: uppercase;
}

.behavior-note {
  padding: 0 10px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.scheduler-task {
  padding: 10px;
  border-top: 1px solid var(--border);
}

.scheduler-task:first-of-type {
  border-top: 0;
}

.scheduler-task-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.scheduler-task-main strong {
  color: var(--text);
  font-size: 13px;
}

.scheduler-task-main code,
.scheduler-task-main span {
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.scheduler-task-main code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.setting-row,
.field {
  padding: 10px;
  border-bottom: 1px solid var(--border);
}

.setting-row:last-child,
.field:last-child {
  border-bottom: 0;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.setting-title,
.setting-meta {
  display: block;
}

.setting-title,
.setting-label,
.range-label,
.field span {
  color: var(--text);
  font-size: 12px;
  font-weight: 620;
}

.setting-label,
.range-label,
.field span {
  margin-bottom: 7px;
}

.range-label {
  display: flex;
  justify-content: space-between;
}

.range-label strong {
  color: var(--accent);
  font-size: 12px;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--hover);
}

.segmented button {
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.segmented button.active {
  background: var(--bg-elevated);
  color: var(--text);
}

.inline-field {
  gap: 8px;
  margin-top: 8px;
}

.memory-range {
  width: 100%;
  accent-color: var(--accent);
}

.grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.source-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}

.mini-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  font-size: 12px;
}

.mini-toggle input {
  accent-color: var(--accent);
}

.field {
  display: flex;
  flex-direction: column;
}

.embedding-target,
.dreaming-status {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 6px 8px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
}

.embedding-target.warning {
  border-color: color-mix(in srgb, #f59e0b 45%, var(--border));
}

.embedding-target strong,
.embedding-target code,
.dreaming-status strong {
  min-width: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}

.embedding-target code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

@media (max-width: 520px) {
  .grid-two,
  .profile-grid,
  .profile-layout,
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .search-row {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-btn {
    width: 100%;
  }
}
</style>
