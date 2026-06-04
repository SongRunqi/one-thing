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
        <span>{{ overview?.graph?.entities ?? 0 }} entities</span>
        <span>{{ overview?.graph?.observations ?? 0 }} facts</span>
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
            @submit.prevent="loadGraph"
          >
            <input
              v-model="graphSearch"
              class="memory-input"
              type="text"
              placeholder="Search graph memory..."
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
              @click="newGraphRecord"
            >
              {{ graphView === 'entities' ? 'New entity' : graphView === 'relations' ? 'New relation' : 'New observation' }}
            </button>
            <button
              class="secondary-action inline"
              type="button"
              :disabled="profileLoading"
              @click="loadGraph"
            >
              Refresh
            </button>
          </div>
        </div>

        <div class="segmented graph-tabs">
          <button
            :class="{ active: graphView === 'observations' }"
            type="button"
            @click="graphView = 'observations'"
          >
            Observations {{ graphObservations.length }}
          </button>
          <button
            :class="{ active: graphView === 'relations' }"
            type="button"
            @click="graphView = 'relations'"
          >
            Relations {{ graphRelations.length }}
          </button>
          <button
            :class="{ active: graphView === 'entities' }"
            type="button"
            @click="graphView = 'entities'"
          >
            Entities {{ graphEntities.length }}
          </button>
          <button
            :class="{ active: graphView === 'duplicates' }"
            type="button"
            @click="graphView = 'duplicates'"
          >
            Duplicates {{ graphDuplicates.length }}
          </button>
        </div>

        <div class="profile-layout graph-layout">
          <div class="profile-list">
            <template v-if="graphView === 'observations'">
              <button
                v-for="memory in graphObservations"
                :key="memory.id"
                :class="['profile-row', { active: graphObservationForm.id === memory.id }]"
                type="button"
                @click="selectGraphObservation(memory)"
              >
                <span class="profile-row-top">
                  <code :title="`${memory.entityDisplayName || memory.entityId} / ${memory.slot}`">{{ memory.entityDisplayName || memory.entityId }} / {{ memory.slot }}</code>
                  <span>{{ memory.confidence.toFixed(2) }}</span>
                </span>
                <strong>{{ memory.text }}</strong>
                <span>{{ memory.kind }} · {{ memory.status }} · {{ formatMaybeDate(memory.updatedAt) }}</span>
                <span
                  v-if="graphObservationForm.id === memory.id"
                  class="profile-expanded"
                >
                  <span class="profile-detail-grid">
                    <span class="profile-detail-item">
                      <span>Entity</span>
                      <code>{{ memory.entityDisplayName || memory.entityId }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>Slot</span>
                      <code>{{ memory.slot }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>Confidence</span>
                      <strong>{{ memory.confidence.toFixed(2) }}</strong>
                    </span>
                    <span class="profile-detail-item">
                      <span>Source</span>
                      <code>{{ memory.source }}</code>
                    </span>
                  </span>
                  <span class="profile-detail-text">
                    <span>Value</span>
                    <strong>{{ memory.value }}</strong>
                  </span>
                  <span class="profile-detail-text">
                    <span>Text</span>
                    <strong>{{ memory.text }}</strong>
                  </span>
                  <span
                    v-if="memory.evidence"
                    class="profile-detail-text"
                  >
                    <span>Evidence</span>
                    <strong>{{ memory.evidence }}</strong>
                  </span>
                </span>
              </button>
            </template>
            <template v-else-if="graphView === 'relations'">
              <button
                v-for="relation in graphRelations"
                :key="relation.id"
                :class="['profile-row', { active: graphRelationForm.id === relation.id }]"
                type="button"
                @click="selectGraphRelation(relation)"
              >
                <span class="profile-row-top">
                  <code :title="`${relation.fromDisplayName || relation.fromEntityId} → ${relation.toDisplayName || relation.toEntityId}`">{{ relation.fromDisplayName || relation.fromEntityId }} → {{ relation.toDisplayName || relation.toEntityId }}</code>
                  <span>{{ relation.confidence.toFixed(2) }}</span>
                </span>
                <strong>{{ relation.relationType }}</strong>
                <span>{{ relation.text }}</span>
                <span
                  v-if="graphRelationForm.id === relation.id"
                  class="profile-expanded"
                >
                  <span class="profile-detail-grid">
                    <span class="profile-detail-item">
                      <span>From</span>
                      <code>{{ relation.fromDisplayName || relation.fromEntityId }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>Relation</span>
                      <code>{{ relation.relationType }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>To</span>
                      <code>{{ relation.toDisplayName || relation.toEntityId }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>Confidence</span>
                      <strong>{{ relation.confidence.toFixed(2) }}</strong>
                    </span>
                  </span>
                  <span class="profile-detail-text">
                    <span>Text</span>
                    <strong>{{ relation.text }}</strong>
                  </span>
                  <span
                    v-if="relation.evidence"
                    class="profile-detail-text"
                  >
                    <span>Evidence</span>
                    <strong>{{ relation.evidence }}</strong>
                  </span>
                </span>
              </button>
            </template>
            <template v-else-if="graphView === 'entities'">
              <button
                v-for="entity in graphEntities"
                :key="entity.id"
                :class="['profile-row', { active: graphEntityForm.id === entity.id }]"
                type="button"
                @click="selectGraphEntity(entity)"
              >
                <span class="profile-row-top">
                  <code :title="entity.id">{{ entity.id }}</code>
                  <span>{{ entity.confidence.toFixed(2) }}</span>
                </span>
                <strong>{{ entity.displayName }}</strong>
                <span>{{ entity.entityType }} · {{ formatMaybeDate(entity.updatedAt) }}</span>
                <span
                  v-if="graphEntityForm.id === entity.id"
                  class="profile-expanded"
                >
                  <span class="profile-detail-grid">
                    <span class="profile-detail-item">
                      <span>Entity id</span>
                      <code>{{ entity.id }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>Type</span>
                      <code>{{ entity.entityType }}</code>
                    </span>
                    <span class="profile-detail-item">
                      <span>Confidence</span>
                      <strong>{{ entity.confidence.toFixed(2) }}</strong>
                    </span>
                    <span class="profile-detail-item">
                      <span>Source</span>
                      <code>{{ entity.source }}</code>
                    </span>
                  </span>
                  <span
                    v-if="entity.aliases.length"
                    class="profile-detail-text"
                  >
                    <span>Aliases</span>
                    <strong>{{ entity.aliases.join(', ') }}</strong>
                  </span>
                  <span
                    v-if="entity.evidence"
                    class="profile-detail-text"
                  >
                    <span>Evidence</span>
                    <strong>{{ entity.evidence }}</strong>
                  </span>
                </span>
              </button>
            </template>
            <template v-else-if="graphView === 'duplicates'">
              <div
                v-for="duplicate in graphDuplicates"
                :key="duplicate.id"
                class="profile-row duplicate-row"
              >
                <span class="profile-row-top">
                  <code>{{ duplicate.kind }}</code>
                  <span>{{ duplicate.score.toFixed(2) }}</span>
                </span>
                <strong>{{ duplicate.sourceId }} → {{ duplicate.targetId }}</strong>
                <span>{{ duplicate.reason }}</span>
                <div class="action-row">
                  <button
                    class="secondary-action inline"
                    type="button"
                    @click="mergeGraphDuplicate(duplicate.id)"
                  >
                    Merge
                  </button>
                  <button
                    class="secondary-action inline"
                    type="button"
                    @click="ignoreGraphDuplicate(duplicate.id)"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="notice compact">
                Possible duplicates are review-only. Merge or ignore them from the list.
              </div>
            </template>
            <div
              v-if="!profileLoading && graphCurrentListCount === 0"
              class="notice compact"
            >
              No graph memory rows yet.
            </div>
          </div>

          <section class="profile-editor memory-section">
            <template v-if="graphView === 'entities'">
              <label>
                <span class="setting-label">Entity id</span>
                <input
                  v-model="graphEntityForm.id"
                  class="memory-input"
                  type="text"
                  placeholder="project:onething"
                  spellcheck="false"
                >
              </label>
              <div class="profile-grid">
                <label>
                  <span class="setting-label">Type</span>
                  <select
                    v-model="graphEntityForm.entityType"
                    class="memory-select"
                  >
                    <option
                      v-for="type in graphEntityTypes"
                      :key="type"
                      :value="type"
                    >
                      {{ type }}
                    </option>
                  </select>
                </label>
                <label>
                  <span class="setting-label">Name</span>
                  <input
                    v-model="graphEntityForm.name"
                    class="memory-input"
                    type="text"
                    spellcheck="false"
                  >
                </label>
              </div>
              <label>
                <span class="setting-label">Display name</span>
                <input
                  v-model="graphEntityForm.displayName"
                  class="memory-input"
                  type="text"
                  spellcheck="true"
                >
              </label>
              <label>
                <span class="setting-label">Aliases</span>
                <input
                  v-model="graphEntityAliases"
                  class="memory-input"
                  type="text"
                  placeholder="comma separated"
                  spellcheck="false"
                >
              </label>
              <div class="action-row">
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="profileSaving || !graphEntityForm.name.trim()"
                  @click="saveGraphEntity"
                >
                  Save
                </button>
                <button
                  class="secondary-action inline danger"
                  type="button"
                  :disabled="profileSaving || !graphEntityForm.id || graphEntityForm.id === 'user:self'"
                  @click="deleteGraphEntity"
                >
                  Delete
                </button>
              </div>
            </template>

            <template v-else-if="graphView === 'relations'">
              <div class="profile-grid">
                <label>
                  <span class="setting-label">From</span>
                  <select
                    v-model="graphRelationForm.fromEntityId"
                    class="memory-select"
                  >
                    <option
                      v-for="entity in graphEntities"
                      :key="entity.id"
                      :value="entity.id"
                    >
                      {{ entity.displayName }} · {{ entity.id }}
                    </option>
                  </select>
                </label>
                <label>
                  <span class="setting-label">Relation</span>
                  <input
                    v-model="graphRelationForm.relationType"
                    class="memory-input"
                    type="text"
                    placeholder="works_on"
                    spellcheck="false"
                  >
                </label>
                <label>
                  <span class="setting-label">To</span>
                  <select
                    v-model="graphRelationForm.toEntityId"
                    class="memory-select"
                  >
                    <option
                      v-for="entity in graphEntities"
                      :key="entity.id"
                      :value="entity.id"
                    >
                      {{ entity.displayName }} · {{ entity.id }}
                    </option>
                  </select>
                </label>
                <label>
                  <span class="setting-label">Confidence</span>
                  <input
                    v-model.number="graphRelationForm.confidence"
                    class="memory-input"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                  >
                </label>
              </div>
              <label>
                <span class="setting-label">Text</span>
                <textarea
                  v-model="graphRelationForm.text"
                  class="memory-textarea"
                  spellcheck="true"
                />
              </label>
              <div class="action-row">
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="profileSaving || !graphRelationForm.fromEntityId || !graphRelationForm.relationType.trim() || !graphRelationForm.toEntityId"
                  @click="saveGraphRelation"
                >
                  Save
                </button>
                <button
                  class="secondary-action inline danger"
                  type="button"
                  :disabled="profileSaving || !graphRelationForm.id"
                  @click="deleteGraphRelation"
                >
                  Delete
                </button>
              </div>
            </template>

            <template v-else>
              <div class="profile-grid">
                <label>
                  <span class="setting-label">Entity</span>
                  <select
                    v-model="graphObservationForm.entityId"
                    class="memory-select"
                  >
                    <option
                      v-for="entity in graphEntities"
                      :key="entity.id"
                      :value="entity.id"
                    >
                      {{ entity.displayName }} · {{ entity.id }}
                    </option>
                  </select>
                </label>
                <label>
                  <span class="setting-label">Kind</span>
                  <select
                    v-model="graphObservationForm.kind"
                    class="memory-select"
                  >
                    <option
                      v-for="kind in graphObservationKinds"
                      :key="kind"
                      :value="kind"
                    >
                      {{ kind }}
                    </option>
                  </select>
                </label>
                <label>
                  <span class="setting-label">Slot</span>
                  <input
                    v-model="graphObservationForm.slot"
                    class="memory-input"
                    type="text"
                    placeholder="name"
                    spellcheck="false"
                  >
                </label>
                <label>
                  <span class="setting-label">Confidence</span>
                  <input
                    v-model.number="graphObservationForm.confidence"
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
                  v-model="graphObservationForm.value"
                  class="memory-input"
                  type="text"
                  spellcheck="true"
                >
              </label>
              <label>
                <span class="setting-label">Text</span>
                <textarea
                  v-model="graphObservationForm.text"
                  class="memory-textarea"
                  spellcheck="true"
                />
              </label>
              <label>
                <span class="setting-label">Evidence</span>
                <textarea
                  v-model="graphObservationForm.evidence"
                  class="memory-textarea compact-area"
                  spellcheck="true"
                />
              </label>
              <div class="action-row">
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="profileSaving || !graphObservationForm.entityId || !graphObservationForm.slot.trim() || !graphObservationForm.value.trim()"
                  @click="saveGraphObservation"
                >
                  Save
                </button>
                <button
                  class="secondary-action inline danger"
                  type="button"
                  :disabled="profileSaving || !graphObservationForm.id"
                  @click="deleteGraphObservation"
                >
                  Delete
                </button>
              </div>
            </template>
            <div
              v-if="graphAudit.length"
              class="audit-list"
            >
              <strong>Audit</strong>
              <div
                v-for="event in graphAudit"
                :key="event.id"
                class="audit-row"
              >
                <span>{{ event.action }}</span>
                <span>{{ formatMaybeDate(event.createdAt) }}</span>
              </div>
            </div>
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
                Daily note
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

      <template v-else-if="activeTab === 'logs'">
        <div class="settings-stack">
          <section class="memory-section">
            <div class="setting-row">
              <div>
                <span class="setting-title">Diagnostics logs</span>
                <span class="setting-meta">
                  {{ memoryLogStats?.entriesInBuffer ?? memoryLogs.length }} buffered · {{ memoryLogStats?.files ?? 0 }} files · {{ memoryLogStats?.retainedDays ?? memorySettings.logging.retentionDays }} days
                </span>
              </div>
              <div class="action-row compact-actions">
                <button
                  class="secondary-action inline"
                  type="button"
                  :disabled="logsLoading"
                  @click="loadMemoryLogs"
                >
                  <RefreshCw
                    :size="15"
                    :stroke-width="1.8"
                    :class="{ spinning: logsLoading }"
                  />
                  <span>Refresh</span>
                </button>
                <button
                  class="secondary-action inline"
                  type="button"
                  @click="openLogFolder"
                >
                  <FolderOpen
                    :size="15"
                    :stroke-width="1.8"
                  />
                  <span>Open</span>
                </button>
                <button
                  class="secondary-action inline"
                  type="button"
                  :disabled="logsLoading"
                  @click="cleanupLogs"
                >
                  Clean
                </button>
              </div>
            </div>
            <div class="log-filter-grid">
              <input
                v-model="logQuery"
                class="memory-input"
                type="search"
                placeholder="Search logs"
                spellcheck="false"
              >
              <select
                v-model="logSubsystem"
                class="memory-select"
              >
                <option
                  v-for="item in logSubsystemOptions"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select>
              <select
                v-model="logLevel"
                class="memory-select"
              >
                <option
                  v-for="item in logLevelOptions"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select>
              <select
                v-model="logStatus"
                class="memory-select"
              >
                <option
                  v-for="item in logStatusOptions"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select>
            </div>
            <label class="mini-toggle log-auto-toggle">
              <input
                v-model="logAutoRefresh"
                type="checkbox"
              >
              <span>Auto refresh</span>
            </label>
          </section>

          <section class="memory-section log-layout">
            <div class="log-list">
              <button
                v-for="group in logGroups"
                :key="group.id"
                :class="['log-row', group.level, { active: selectedLogGroupId === group.id }]"
                type="button"
                @click="selectLogGroup(group)"
              >
                <span class="log-time">{{ formatMaybeDate(group.latestAt) }}</span>
                <span class="log-main">
                  <strong>{{ group.subsystem }}</strong>
                  <span>{{ group.operationLabel }}</span>
                  <span class="log-chain">{{ group.count }} event{{ group.count === 1 ? '' : 's' }} · {{ group.stageLabel }}</span>
                </span>
                <code class="log-status">{{ group.status }}</code>
                <span
                  v-if="group.durationMs !== undefined"
                  class="log-duration"
                >
                  {{ group.durationMs }}ms
                </span>
                <span class="log-summary">{{ group.summary }}</span>
                <span
                  v-if="selectedLogGroupId === group.id"
                  class="log-timeline"
                >
                  <span
                    v-for="event in group.entries"
                    :key="event.id"
                    class="log-event"
                  >
                    <span class="log-event-head">
                      <code>{{ event.operation }} / {{ event.stage }}</code>
                      <span>{{ event.status }}</span>
                      <span v-if="event.durationMs !== undefined">{{ event.durationMs }}ms</span>
                    </span>
                    <span class="log-event-summary">{{ event.summary || event.error?.message || '' }}</span>
                  </span>
                </span>
                <span
                  v-if="selectedLogGroupId === group.id"
                  class="log-inline-detail"
                >
                  {{ formatLogGroupDetails(group) }}
                </span>
              </button>
              <div
                v-if="!logsLoading && memoryLogs.length === 0"
                class="notice compact"
              >
                No memory logs yet.
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
                  <span class="setting-meta">Master switch · SOUL.md and graph profile injection</span>
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
                  <span class="setting-title">Graph Memory</span>
                  <span class="setting-meta">SQLite source of truth · {{ overview?.graph?.entities ?? 0 }} entities / {{ overview?.graph?.observations ?? 0 }} observations</span>
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
              Stores durable user identity, preferences, facts, constraints, project relationships, and accepted decisions. This graph summary is read into prompts.
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
                    Graph first
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
              Searches SQLite graph memory and Markdown notes before a request, then injects matching context as untrusted recall.
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

          <section class="memory-section">
            <div class="setting-row">
              <label class="toggle-row">
                <span>
                  <span class="setting-title">Diagnostics logging</span>
                  <span class="setting-meta">{{ memorySettings.logging.level }} · {{ memorySettings.logging.retentionDays }} days · {{ memorySettings.logging.maxPreviewChars }} chars</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.logging.enabled !== false"
                  :disabled="memorySettings.enabled === false"
                  @change="updateSoulMemory({ logging: { ...memorySettings.logging, enabled: ($event.target as HTMLInputElement).checked } })"
                >
              </label>
            </div>
            <div class="behavior-note">
              Records redacted memory and embedding diagnostics: API timing, provider/model, status, errors, fallback, and memory routing. API keys, full prompts, full user messages, and vectors are not saved.
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Level</span>
                <select
                  class="memory-select"
                  :value="memorySettings.logging.level"
                  :disabled="memorySettings.enabled === false || memorySettings.logging.enabled === false"
                  @change="updateSoulMemory({ logging: { ...memorySettings.logging, level: ($event.target as HTMLSelectElement).value as any } })"
                >
                  <option value="debug">
                    debug
                  </option>
                  <option value="info">
                    info
                  </option>
                  <option value="warn">
                    warn
                  </option>
                  <option value="error">
                    error
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Retention days</span>
                <input
                  class="memory-input"
                  type="number"
                  min="1"
                  max="90"
                  :value="memorySettings.logging.retentionDays"
                  :disabled="memorySettings.enabled === false || memorySettings.logging.enabled === false"
                  @change="updateSoulMemory({ logging: { ...memorySettings.logging, retentionDays: Number(($event.target as HTMLInputElement).value) || 7 } })"
                >
              </label>
            </div>
            <div class="grid-two">
              <label class="field">
                <span>Preview chars</span>
                <input
                  class="memory-input"
                  type="number"
                  min="120"
                  max="4000"
                  step="20"
                  :value="memorySettings.logging.maxPreviewChars"
                  :disabled="memorySettings.enabled === false || memorySettings.logging.enabled === false"
                  @change="updateSoulMemory({ logging: { ...memorySettings.logging, maxPreviewChars: Number(($event.target as HTMLInputElement).value) || 600 } })"
                >
              </label>
              <label class="field toggle-row">
                <span>
                  <span class="setting-title">HTTP error body</span>
                  <span class="setting-meta">redacted preview only</span>
                </span>
                <input
                  type="checkbox"
                  :checked="memorySettings.logging.includeHttpErrorBody !== false"
                  :disabled="memorySettings.enabled === false || memorySettings.logging.enabled === false"
                  @change="updateSoulMemory({ logging: { ...memorySettings.logging, includeHttpErrorBody: ($event.target as HTMLInputElement).checked } })"
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
import { useSessionsStore } from '@/stores/sessions'
import type {
  MemoryGraphAuditEvent,
  MemoryGraphDuplicate,
  MemoryGraphEntity,
  MemoryGraphEntityType,
  MemoryGraphObservation,
  MemoryGraphObservationKind,
  MemoryGraphRelation,
  MemoryGraphStatus,
  MemoryDiagnosticLogEntry,
  MemoryLogsStatsResponse,
  MemoryManagedFile,
  MemoryOverview,
  MemoryReadResponse,
  MemorySearchHit,
  SoulMemorySettings,
} from '@shared/ipc'
import { normalizeSoulMemorySettings } from '@shared/defaults/settings'
import { resolveSoulMemoryEmbeddingTarget } from '@shared/embeddings/defaults'

type TabId = 'overview' | 'profile' | 'ai-notes' | 'daily' | 'dreams' | 'search' | 'logs' | 'settings'
type MemoryLogGroup = {
  id: string
  subsystem: string
  level: MemoryDiagnosticLogEntry['level']
  status: MemoryDiagnosticLogEntry['status']
  operationLabel: string
  stageLabel: string
  summary: string
  count: number
  latestAt: number
  durationMs?: number
  entries: MemoryDiagnosticLogEntry[]
}

const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const activeAgentId = computed(() => sessionsStore.currentSession?.agentId || 'default')

const overview = ref<MemoryOverview | null>(null)
const loading = ref(false)
const searching = ref(false)
const appending = ref(false)
const savingFile = ref(false)
const dreamingRunning = ref(false)
const logsLoading = ref(false)
const profileLoading = ref(false)
const profileSaving = ref(false)
const searched = ref(false)
const error = ref('')
const activeTab = ref<TabId>('overview')
const selectedPath = ref('SOUL.md')
const selectedFile = ref<MemoryReadResponse['file'] | null>(null)
const selectedFileText = ref('')
const searchQuery = ref('')
const searchResults = ref<MemorySearchHit[]>([])
const memoryLogs = ref<MemoryDiagnosticLogEntry[]>([])
const memoryLogStats = ref<MemoryLogsStatsResponse['stats'] | null>(null)
const selectedLogGroupId = ref('')
const logQuery = ref('')
const logLevel = ref('all')
const logSubsystem = ref('all')
const logStatus = ref('all')
const logAutoRefresh = ref(false)
const graphEntities = ref<MemoryGraphEntity[]>([])
const graphObservations = ref<MemoryGraphObservation[]>([])
const graphRelations = ref<MemoryGraphRelation[]>([])
const graphDuplicates = ref<MemoryGraphDuplicate[]>([])
const graphAudit = ref<MemoryGraphAuditEvent[]>([])
const graphSearch = ref('')
const graphView = ref<'observations' | 'relations' | 'entities' | 'duplicates'>('observations')
const appendTarget = ref<'daily'>('daily')
const appendHeading = ref('Manual memory')
const appendContent = ref('')
const dreamSourceOptions = ['daily', 'sessions', 'short-term', 'recall'] as const
const graphEntityTypes: MemoryGraphEntityType[] = ['user', 'project', 'tech', 'component', 'decision', 'concept', 'person', 'organization']
const graphObservationKinds: MemoryGraphObservationKind[] = ['identity', 'preference', 'constraint', 'decision', 'project', 'fact', 'summary', 'episodic']
const graphEntityAliases = ref('')
const graphEntityForm = ref({
  id: '',
  entityType: 'project' as MemoryGraphEntityType,
  name: '',
  displayName: '',
  aliases: [] as string[],
  confidence: 1,
  sensitivity: 'normal' as 'normal' | 'sensitive' | 'secret',
  evidence: '',
})
const graphObservationForm = ref({
  id: '',
  entityId: 'user:self',
  kind: 'fact' as MemoryGraphObservationKind,
  slot: '',
  value: '',
  text: '',
  confidence: 1,
  sensitivity: 'normal' as 'normal' | 'sensitive' | 'secret',
  status: 'active' as MemoryGraphStatus,
  evidence: '',
})
const graphRelationForm = ref({
  id: '',
  fromEntityId: 'user:self',
  relationType: '',
  toEntityId: '',
  text: '',
  confidence: 1,
  sensitivity: 'normal' as 'normal' | 'sensitive' | 'secret',
  status: 'active' as MemoryGraphStatus,
  evidence: '',
})
let overviewRefreshTimer: number | null = null
let dreamingPollTimer: number | null = null
let logsPollTimer: number | null = null

const tabs: Array<{ id: TabId; label: string; icon: Component }> = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'profile', label: 'Graph Memory', icon: Database },
  { id: 'ai-notes', label: 'AI Notes', icon: BookOpen },
  { id: 'daily', label: 'Daily', icon: Clock },
  { id: 'dreams', label: 'Dreams', icon: Brain },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'logs', label: 'Logs', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const logSubsystemOptions = ['all', 'embedding', 'index', 'search', 'capture', 'graph', 'daily', 'active-memory', 'flush', 'dreaming', 'scheduler', 'ipc']
const logLevelOptions = ['all', 'debug', 'info', 'warn', 'error']
const logStatusOptions = ['all', 'started', 'ok', 'error', 'skipped', 'fallback']

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
  overview.value?.dreaming.inFlight === true,
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

const graphCurrentListCount = computed(() => {
  if (graphView.value === 'entities') return graphEntities.value.length
  if (graphView.value === 'relations') return graphRelations.value.length
  if (graphView.value === 'duplicates') return graphDuplicates.value.length
  return graphObservations.value.length
})

const logGroups = computed(() => buildMemoryLogGroups(memoryLogs.value))

const visibleFiles = computed(() => {
  const files = overview.value?.files || []
  if (activeTab.value === 'ai-notes') return files.filter(file => file.kind === 'soul')
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
    if (tab === 'profile') {
      await loadGraph()
    }
    if (tab === 'logs') {
      await loadMemoryLogs()
      syncLogsPolling()
    } else {
      stopLogsPolling()
    }
  },
)

watch(
  () => [logQuery.value, logLevel.value, logSubsystem.value, logStatus.value],
  () => {
    if (activeTab.value === 'logs') {
      void loadMemoryLogs()
    }
  },
)

watch(
  () => logAutoRefresh.value,
  () => syncLogsPolling(),
)

watch(
  () => activeAgentId.value,
  async () => {
    await loadOverview()
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
  stopLogsPolling()
})

async function loadOverview(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.getMemoryOverview(activeAgentId.value)
    if (!response.success || !response.overview) {
      throw new Error(response.error || 'Failed to load memory')
    }
    overview.value = response.overview
    if (!overview.value.files.some(file => file.relativePath === selectedPath.value)) {
      selectedPath.value = overview.value.files.find(file => file.relativePath === 'SOUL.md')?.relativePath ||
        overview.value.files[0]?.relativePath ||
        ''
    }
    if (isFileTab.value && selectedPath.value) {
      await ensureFileSelectionForTab()
    }
    if (activeTab.value === 'profile') {
      await loadGraph()
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
    const response = await window.electronAPI.rebuildMemoryIndex(activeAgentId.value)
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
    agentId: activeAgentId.value,
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
      agentId: activeAgentId.value,
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

async function loadGraph(): Promise<void> {
  profileLoading.value = true
  error.value = ''
  try {
    const agentId = activeAgentId.value
    const query = graphSearch.value.trim() || undefined
    const [entities, observations, relations, duplicates] = await Promise.all([
      window.electronAPI.listMemoryGraphEntities({ agentId, query, limit: 250 }),
      window.electronAPI.listMemoryGraphObservations({ agentId, query, limit: 250 }),
      window.electronAPI.listMemoryGraphRelations({ agentId, query, limit: 250 }),
      window.electronAPI.listMemoryGraphDuplicates({ agentId, query, limit: 100 }),
    ])
    if (!entities.success || !entities.entities) throw new Error(entities.error || 'Failed to load graph entities')
    if (!observations.success || !observations.observations) throw new Error(observations.error || 'Failed to load graph observations')
    if (!relations.success || !relations.relations) throw new Error(relations.error || 'Failed to load graph relations')
    if (!duplicates.success || !duplicates.duplicates) throw new Error(duplicates.error || 'Failed to load graph duplicates')
    graphEntities.value = entities.entities
    graphObservations.value = observations.observations
    graphRelations.value = relations.relations
    graphDuplicates.value = duplicates.duplicates
    if (!graphObservationForm.value.entityId && graphEntities.value[0]) {
      graphObservationForm.value.entityId = graphEntities.value[0].id
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileLoading.value = false
  }
}

async function loadGraphAudit(id: string): Promise<void> {
  const response = await window.electronAPI.getMemoryGraphAudit({ agentId: activeAgentId.value, id })
  graphAudit.value = response.success && response.events ? response.events : []
}

function selectGraphEntity(entity: MemoryGraphEntity): void {
  graphAudit.value = []
  graphEntityForm.value = {
    id: entity.id,
    entityType: entity.entityType,
    name: entity.name,
    displayName: entity.displayName,
    aliases: entity.aliases,
    confidence: entity.confidence,
    sensitivity: entity.sensitivity,
    evidence: entity.evidence || '',
  }
  graphEntityAliases.value = entity.aliases.join(', ')
  void loadGraphAudit(entity.id)
}

function resetGraphEntityForm(): void {
  graphAudit.value = []
  graphEntityAliases.value = ''
  graphEntityForm.value = {
    id: '',
    entityType: 'project',
    name: '',
    displayName: '',
    aliases: [],
    confidence: 1,
    sensitivity: 'normal',
    evidence: '',
  }
}

function selectGraphObservation(memory: MemoryGraphObservation): void {
  graphAudit.value = []
  graphObservationForm.value = {
    id: memory.id,
    entityId: memory.entityId,
    kind: memory.kind,
    slot: memory.slot,
    value: memory.value,
    text: memory.text,
    confidence: memory.confidence,
    sensitivity: memory.sensitivity,
    status: memory.status,
    evidence: memory.evidence || '',
  }
  void loadGraphAudit(memory.id)
}

function resetGraphObservationForm(): void {
  graphAudit.value = []
  graphObservationForm.value = {
    id: '',
    entityId: graphEntities.value.find(entity => entity.id === 'user:self')?.id || graphEntities.value[0]?.id || 'user:self',
    kind: 'fact',
    slot: '',
    value: '',
    text: '',
    confidence: 1,
    sensitivity: 'normal',
    status: 'active',
    evidence: '',
  }
}

function selectGraphRelation(relation: MemoryGraphRelation): void {
  graphAudit.value = []
  graphRelationForm.value = {
    id: relation.id,
    fromEntityId: relation.fromEntityId,
    relationType: relation.relationType,
    toEntityId: relation.toEntityId,
    text: relation.text,
    confidence: relation.confidence,
    sensitivity: relation.sensitivity,
    status: relation.status,
    evidence: relation.evidence || '',
  }
  void loadGraphAudit(relation.id)
}

function resetGraphRelationForm(): void {
  graphAudit.value = []
  graphRelationForm.value = {
    id: '',
    fromEntityId: graphEntities.value.find(entity => entity.id === 'user:self')?.id || graphEntities.value[0]?.id || 'user:self',
    relationType: '',
    toEntityId: graphEntities.value.find(entity => entity.id !== 'user:self')?.id || '',
    text: '',
    confidence: 1,
    sensitivity: 'normal',
    status: 'active',
    evidence: '',
  }
}

function newGraphRecord(): void {
  if (graphView.value === 'entities') {
    resetGraphEntityForm()
  } else if (graphView.value === 'relations') {
    resetGraphRelationForm()
  } else {
    graphView.value = 'observations'
    resetGraphObservationForm()
  }
}

async function saveGraphEntity(): Promise<void> {
  profileSaving.value = true
  error.value = ''
  try {
    const form = graphEntityForm.value
    const response = await window.electronAPI.upsertMemoryGraphEntity({
      agentId: activeAgentId.value,
      ...(form.id.trim() ? { id: form.id.trim() } : {}),
      entityType: form.entityType,
      name: form.name.trim(),
      displayName: form.displayName.trim() || undefined,
      aliases: graphEntityAliases.value.split(',').map(item => item.trim()).filter(Boolean),
      confidence: Math.max(0, Math.min(1, Number(form.confidence) || 0)),
      sensitivity: form.sensitivity,
      evidence: form.evidence.trim() || undefined,
    })
    if (!response.success || !response.entity) throw new Error(response.error || 'Failed to save graph entity')
    await loadGraph()
    selectGraphEntity(response.entity)
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function deleteGraphEntity(): Promise<void> {
  if (!graphEntityForm.value.id) return
  if (!window.confirm('Delete this graph entity and its attached graph rows?')) return
  profileSaving.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.deleteMemoryGraphEntity({ agentId: activeAgentId.value, id: graphEntityForm.value.id })
    if (!response.success) throw new Error(response.error || 'Failed to delete graph entity')
    resetGraphEntityForm()
    await loadGraph()
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function saveGraphObservation(): Promise<void> {
  profileSaving.value = true
  error.value = ''
  try {
    const form = graphObservationForm.value
    const response = await window.electronAPI.upsertMemoryGraphObservation({
      agentId: activeAgentId.value,
      ...(form.id ? { id: form.id } : {}),
      entityId: form.entityId,
      kind: form.kind,
      slot: form.slot.trim(),
      value: form.value.trim(),
      text: form.text.trim() || form.value.trim(),
      confidence: Math.max(0, Math.min(1, Number(form.confidence) || 0)),
      sensitivity: form.sensitivity,
      status: form.status,
      evidence: form.evidence.trim() || undefined,
    })
    if (!response.success || !response.observation) throw new Error(response.error || 'Failed to save graph observation')
    await loadGraph()
    selectGraphObservation(response.observation)
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function deleteGraphObservation(): Promise<void> {
  if (!graphObservationForm.value.id) return
  if (!window.confirm('Delete this graph observation?')) return
  profileSaving.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.deleteMemoryGraphObservation({ agentId: activeAgentId.value, id: graphObservationForm.value.id })
    if (!response.success) throw new Error(response.error || 'Failed to delete graph observation')
    resetGraphObservationForm()
    await loadGraph()
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function saveGraphRelation(): Promise<void> {
  profileSaving.value = true
  error.value = ''
  try {
    const form = graphRelationForm.value
    const response = await window.electronAPI.upsertMemoryGraphRelation({
      agentId: activeAgentId.value,
      ...(form.id ? { id: form.id } : {}),
      fromEntityId: form.fromEntityId,
      relationType: form.relationType.trim(),
      toEntityId: form.toEntityId,
      text: form.text.trim() || undefined,
      confidence: Math.max(0, Math.min(1, Number(form.confidence) || 0)),
      sensitivity: form.sensitivity,
      status: form.status,
      evidence: form.evidence.trim() || undefined,
    })
    if (!response.success || !response.relation) throw new Error(response.error || 'Failed to save graph relation')
    await loadGraph()
    selectGraphRelation(response.relation)
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function deleteGraphRelation(): Promise<void> {
  if (!graphRelationForm.value.id) return
  if (!window.confirm('Delete this graph relation?')) return
  profileSaving.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.deleteMemoryGraphRelation({ agentId: activeAgentId.value, id: graphRelationForm.value.id })
    if (!response.success) throw new Error(response.error || 'Failed to delete graph relation')
    resetGraphRelationForm()
    await loadGraph()
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileSaving.value = false
  }
}

async function mergeGraphDuplicate(id: string): Promise<void> {
  const response = await window.electronAPI.mergeMemoryGraphDuplicate({ agentId: activeAgentId.value, id })
  if (!response.success) {
    error.value = response.error || 'Failed to merge possible duplicate'
    return
  }
  await loadGraph()
  await loadOverview()
}

async function ignoreGraphDuplicate(id: string): Promise<void> {
  const response = await window.electronAPI.ignoreMemoryGraphDuplicate({ agentId: activeAgentId.value, id })
  if (!response.success) {
    error.value = response.error || 'Failed to ignore possible duplicate'
    return
  }
  await loadGraph()
  await loadOverview()
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
      agentId: activeAgentId.value,
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
  if (hit.kind === 'graph' || hit.kind === 'canonical') {
    activeTab.value = 'profile'
    graphSearch.value = hit.id
    await loadGraph()
    if (hit.path.startsWith('entity:')) {
      graphView.value = 'entities'
      const match = graphEntities.value.find(entity => entity.id === hit.id)
      if (match) selectGraphEntity(match)
    } else if (hit.path.startsWith('relation:')) {
      graphView.value = 'relations'
      const match = graphRelations.value.find(relation => relation.id === hit.id)
      if (match) selectGraphRelation(match)
    } else {
      graphView.value = 'observations'
      const match = graphObservations.value.find(memory => memory.id === hit.id)
      if (match) selectGraphObservation(match)
    }
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
      agentId: activeAgentId.value,
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
    const response = await window.electronAPI.runMemoryDreaming(activeAgentId.value)
    if (!response.success) throw new Error(response.error || 'Failed to run dreaming')
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    dreamingRunning.value = false
    syncDreamingPolling()
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
    syncDreamingPolling()
  }, 1500)
}

async function loadMemoryLogs(): Promise<void> {
  logsLoading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.listMemoryLogs({
      limit: 200,
      query: logQuery.value.trim() || undefined,
      level: logLevel.value as any,
      subsystem: logSubsystem.value as any,
      status: logStatus.value as any,
    })
    if (!response.success || !response.entries) throw new Error(response.error || 'Failed to load memory logs')
    memoryLogs.value = response.entries
    const groups = buildMemoryLogGroups(response.entries)
    if (selectedLogGroupId.value && !groups.some(group => group.id === selectedLogGroupId.value)) {
      selectedLogGroupId.value = ''
    }
    if (!selectedLogGroupId.value && groups[0]) {
      selectedLogGroupId.value = groups[0].id
    }
    const stats = await window.electronAPI.getMemoryLogStats()
    memoryLogStats.value = stats.success ? stats.stats || null : null
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    logsLoading.value = false
  }
}

function syncLogsPolling(): void {
  stopLogsPolling()
  if (activeTab.value !== 'logs' || !logAutoRefresh.value) return
  logsPollTimer = window.setTimeout(async () => {
    logsPollTimer = null
    await loadMemoryLogs()
    syncLogsPolling()
  }, 2000)
}

function stopLogsPolling(): void {
  if (logsPollTimer) {
    window.clearTimeout(logsPollTimer)
    logsPollTimer = null
  }
}

async function cleanupLogs(): Promise<void> {
  logsLoading.value = true
  error.value = ''
  try {
    const response = await window.electronAPI.cleanupMemoryLogs()
    if (!response.success) throw new Error(response.error || 'Failed to clean memory logs')
    await loadMemoryLogs()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    logsLoading.value = false
  }
}

async function openLogFolder(): Promise<void> {
  const response = await window.electronAPI.openMemoryLogFolder()
  if (!response.success) {
    error.value = response.error || 'Failed to open memory log folder'
  }
}

function selectLogGroup(group: MemoryLogGroup): void {
  selectedLogGroupId.value = selectedLogGroupId.value === group.id ? '' : group.id
}

function formatLogGroupDetails(group: MemoryLogGroup): string {
  return JSON.stringify({
    id: group.id,
    subsystem: group.subsystem,
    status: group.status,
    operation: group.operationLabel,
    events: group.entries,
  }, null, 2)
}

function buildMemoryLogGroups(entries: MemoryDiagnosticLogEntry[]): MemoryLogGroup[] {
  const byGroup = new Map<string, MemoryDiagnosticLogEntry[]>()
  for (const entry of entries) {
    const key = entry.runId
      ? `${entry.subsystem}:${entry.runId}`
      : `${entry.subsystem}:${entry.operation}:${entry.sessionId || 'global'}:${entry.id}`
    const list = byGroup.get(key)
    if (list) {
      list.push(entry)
    } else {
      byGroup.set(key, [entry])
    }
  }
  return Array.from(byGroup.entries())
    .map(([id, groupEntries]) => summarizeLogGroup(id, groupEntries))
    .sort((a, b) => b.latestAt - a.latestAt)
}

function summarizeLogGroup(id: string, entries: MemoryDiagnosticLogEntry[]): MemoryLogGroup {
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp)
  const latest = sorted[sorted.length - 1]
  const terminal = [...sorted].reverse().find(entry =>
    entry.status === 'error' ||
    entry.status === 'ok' ||
    entry.status === 'skipped' ||
    entry.status === 'fallback',
  ) || latest
  const first = sorted[0]
  const operations = Array.from(new Set(sorted.map(entry => entry.operation)))
  const stages = Array.from(new Set(sorted.map(entry => entry.stage)))
  const durationMs = typeof terminal.durationMs === 'number'
    ? terminal.durationMs
    : sorted.length > 1
      ? Math.max(0, latest.timestamp - first.timestamp)
      : undefined
  return {
    id,
    subsystem: latest.subsystem,
    level: sorted.reduce((level, entry) => logLevelWeight(entry.level) > logLevelWeight(level) ? entry.level : level, latest.level),
    status: terminal.status,
    operationLabel: operations.length === 1 ? operations[0] : `${operations[0]} -> ${operations[operations.length - 1]}`,
    stageLabel: stages.join(' -> '),
    summary: terminal.summary || logErrorMessage(terminal) || latest.summary || logErrorMessage(latest) || '',
    count: sorted.length,
    latestAt: latest.timestamp,
    ...(durationMs !== undefined ? { durationMs } : {}),
    entries: sorted,
  }
}

function logErrorMessage(entry: MemoryDiagnosticLogEntry): string {
  const message = entry.error?.message
  return typeof message === 'string' ? message : ''
}

function logLevelWeight(level: MemoryDiagnosticLogEntry['level']): number {
  if (level === 'error') return 4
  if (level === 'warn') return 3
  if (level === 'info') return 2
  return 1
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
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--ui-text-primary-fg, var(--text));
  overflow: hidden;
}

.memory-header {
  min-width: 0;
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
  min-width: 0;
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
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 15px;
  font-weight: 650;
}

.memory-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-actions {
  flex: 0 0 auto;
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
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.icon-btn.bordered {
  flex-shrink: 0;
  border: 1px solid var(--ui-border-default-border, var(--border));
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.memory-stats {
  flex-wrap: wrap;
  gap: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.memory-stats span {
  max-width: 100%;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  color: var(--ui-accent-primary-fg, var(--accent)) !important;
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 38%, var(--ui-border-default-border, var(--border))) !important;
}

.status-pill.off {
  color: var(--ui-text-muted-fg, var(--muted)) !important;
  border-color: var(--ui-border-default-border, var(--border)) !important;
}

.root-path {
  min-height: 28px;
  padding: 7px 9px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  gap: 6px;
}

.memory-tab {
  min-width: 0;
  width: 100%;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  padding: 0 10px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  cursor: pointer;
}

.memory-tab span {
  min-width: 0;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-align: center;
}

.memory-tab.active {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-active-bg, var(--active));
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 40%, var(--ui-border-default-border, var(--border)));
}

.memory-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 4px 12px;
}

.loading-state,
.notice {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
}

.notice.error {
  min-height: auto;
  justify-content: flex-start;
  margin-bottom: 10px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 45%, var(--ui-border-default-border, var(--border)));
  border-radius: 8px;
  color: var(--ui-status-danger-fg, #ef4444);
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 8%, transparent);
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
  min-width: 0;
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
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-primary-fg, var(--text));
  padding: 10px;
  cursor: pointer;
  text-align: left;
}

.file-row:hover,
.result-row:hover,
.file-row.active {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 38%, var(--ui-border-default-border, var(--border)));
  background: var(--ui-state-active-bg, var(--active));
}

.file-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--ui-accent-primary-fg, var(--accent));
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
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 620;
  overflow-wrap: anywhere;
}

.file-meta,
.file-date,
.result-score,
.setting-meta {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.file-preview,
.result-content {
  color: var(--ui-text-muted-fg, var(--muted));
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
  min-width: 0;
  margin-top: 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  overflow: hidden;
}

.viewer-header {
  min-width: 0;
  min-height: 36px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.viewer-header span {
  min-width: 0;
  margin-right: auto;
  overflow-wrap: anywhere;
}

.memory-editor {
  width: 100%;
  max-width: 100%;
  min-height: 420px;
  margin: 0;
  padding: 12px;
  border: 0;
  resize: vertical;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.viewer pre {
  max-height: 360px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--ui-text-primary-fg, var(--text));
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
  color: var(--ui-accent-primary-fg, var(--accent));
  font-size: 12px;
}

.text-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.overview-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--ui-border-default-border, var(--border));
}

.overview-grid > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.overview-grid strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  overflow-wrap: anywhere;
}

.status-line {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.status-line.running {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.status-line.success {
  color: var(--ui-status-success-fg, #16a34a);
}

.status-line.error {
  color: var(--ui-status-danger-fg, #ef4444);
}

.status-line.muted {
  color: var(--ui-text-muted-fg, var(--muted));
}

.action-row {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
}

.action-row > * {
  max-width: 100%;
}

.inline-error {
  padding: 8px 10px;
  color: var(--ui-status-danger-fg, #ef4444);
  font-size: 12px;
  line-height: 1.4;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  overflow-wrap: anywhere;
}

.inline-error:last-child {
  border-bottom: 0;
}

.search-row {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.search-row .memory-input {
  flex: 1 1 180px;
}

.memory-input,
.memory-select,
.memory-textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
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
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.primary-btn,
.secondary-action {
  max-width: 100%;
  min-width: 0;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 45%, var(--ui-border-default-border, var(--border)));
  background: var(--ui-accent-primary-fg, var(--accent));
  color: white;
  padding: 0 12px;
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1.25;
  text-align: center;
  white-space: normal;
}

.primary-btn span,
.secondary-action span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.secondary-action {
  width: 100%;
  margin-top: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-default-border, var(--border));
}

.secondary-action.inline {
  width: auto;
  min-width: 84px;
  margin-top: 0;
}

.secondary-action.danger {
  color: var(--ui-status-danger-fg, #ef4444);
  border-color: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 38%, var(--ui-border-default-border, var(--border)));
}

.primary-btn:disabled,
.secondary-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.append-box {
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.append-top {
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.append-top .memory-select {
  width: 118px;
  flex-shrink: 0;
}

.append-top .memory-input {
  flex: 1 1 160px;
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
  min-width: 0;
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
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 10px;
}

.graph-layout {
  align-items: start;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  max-height: 420px;
  overflow: auto;
}

.profile-row {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  padding: 9px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-primary-fg, var(--text));
  text-align: left;
  cursor: pointer;
}

.profile-row:hover,
.profile-row.active {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 38%, var(--ui-border-default-border, var(--border)));
  background: var(--ui-state-active-bg, var(--active));
}

.profile-row-top,
.audit-row {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.profile-row-top code,
.audit-row code {
  flex: 1 1 140px;
}

.profile-row-top code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-row-top span,
.audit-row span {
  flex: 0 0 auto;
}

.profile-row code {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.profile-row strong {
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.profile-row > span:last-child {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.profile-expanded {
  display: block;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  text-align: left;
  cursor: default;
}

.profile-detail-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
  gap: 8px;
}

.profile-detail-item,
.profile-detail-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.profile-detail-item > span,
.profile-detail-text > span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-weight: 650;
}

.profile-detail-item strong,
.profile-detail-text strong {
  display: block;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11px;
  line-height: 1.45;
  overflow: visible;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.profile-detail-text {
  max-height: 180px;
  margin-top: 8px;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-state-hover-bg, var(--hover));
}

.profile-editor {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.profile-grid {
  min-width: 0;
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
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  padding-top: 8px;
}

.memory-section {
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  overflow: hidden;
}

.settings-group-title {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0;
  text-transform: uppercase;
}

.behavior-note {
  padding: 0 10px 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  line-height: 1.45;
}

.compact-actions {
  justify-content: flex-end;
  padding: 0;
  border-top: 0;
}

.log-filter-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.log-filter-grid .memory-input {
  grid-column: 1 / -1;
}

.log-auto-toggle {
  margin: 10px;
}

.log-layout {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.log-list {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.log-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: 4px 8px;
  padding: 9px 10px;
  border: 0;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  text-align: left;
  cursor: pointer;
}

.log-row:hover,
.log-row.active {
  background: var(--ui-state-active-bg, var(--active));
}

.log-row.warn {
  border-left: 3px solid var(--ui-status-warning-fg, #f59e0b);
}

.log-row.error {
  border-left: 3px solid var(--ui-status-danger-fg, #ef4444);
}

.log-row strong,
.log-row span,
.log-row code {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.log-row strong {
  color: var(--ui-text-primary-fg, var(--text));
}

.log-row span,
.log-row code {
  color: var(--ui-text-muted-fg, var(--muted));
}

.log-row code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.log-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-chain {
  color: var(--ui-text-muted-fg, var(--muted));
}

.log-status {
  justify-self: end;
  padding: 1px 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 999px;
  background: var(--ui-state-hover-bg, var(--hover));
}

.log-duration {
  justify-self: end;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.log-time,
.log-summary {
  grid-column: 1 / -1;
}

.log-summary {
  color: var(--ui-text-primary-fg, var(--text));
}

.log-timeline {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-state-hover-bg, var(--hover)) 68%, transparent);
}

.log-event {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.log-event:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.log-event-head {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.log-event-head code {
  flex: 1 1 150px;
}

.log-event-summary {
  color: var(--ui-text-primary-fg, var(--text));
  line-height: 1.35;
}

.log-inline-detail {
  grid-column: 1 / -1;
  display: block;
  max-height: 320px;
  margin-top: 6px;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  line-height: 1.45;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.log-detail {
  margin: 0;
  padding: 10px;
  max-width: 100%;
  max-height: 420px;
  overflow: auto;
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  font-size: 11px;
  line-height: 1.45;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.setting-row,
.field {
  min-width: 0;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.setting-row:last-child,
.field:last-child {
  border-bottom: 0;
}

.toggle-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-row > span {
  min-width: 0;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--ui-accent-primary-fg, var(--accent));
}

.setting-title,
.setting-meta {
  display: block;
}

.setting-title,
.setting-label,
.range-label,
.field span {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  font-weight: 620;
  overflow-wrap: anywhere;
}

.setting-label,
.range-label,
.field span {
  margin-bottom: 7px;
}

.setting-meta {
  overflow-wrap: anywhere;
}

.memory-select {
  text-overflow: ellipsis;
}

.range-label {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  justify-content: space-between;
}

.range-label strong {
  color: var(--ui-accent-primary-fg, var(--accent));
  font-size: 12px;
}

.segmented {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-state-hover-bg, var(--hover));
}

.segmented button {
  min-width: 0;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  line-height: 1.2;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.segmented.graph-tabs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 8px;
}

.segmented.graph-tabs button {
  min-height: 28px;
  padding: 0 4px;
}

.segmented button.active {
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-primary-fg, var(--text));
}

.inline-field {
  gap: 8px;
  margin-top: 8px;
}

.memory-range {
  width: 100%;
  accent-color: var(--ui-accent-primary-fg, var(--accent));
}

.grid-two {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.source-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.mini-toggle {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.mini-toggle span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.mini-toggle input {
  accent-color: var(--ui-accent-primary-fg, var(--accent));
}

.field {
  display: flex;
  flex-direction: column;
}

.embedding-target,
.dreaming-status {
  min-width: 0;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 6px 8px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.embedding-target.warning {
  border-color: color-mix(in srgb, var(--ui-status-warning-fg, #f59e0b) 45%, var(--ui-border-default-border, var(--border)));
}

.embedding-target strong,
.embedding-target code,
.dreaming-status strong {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  overflow-wrap: anywhere;
}

.embedding-target code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

@media (max-width: 720px) {
  .profile-layout,
  .log-layout {
    grid-template-columns: 1fr;
  }

  .log-list {
    border-right: 0;
    border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  }
}

@media (max-width: 640px) {
  .grid-two,
  .profile-grid,
  .log-filter-grid,
  .overview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .search-row {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-btn {
    width: 100%;
  }
}
</style>
