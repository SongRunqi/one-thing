<template>
  <div class="memory-panel-content">
    <div class="memory-header">
      <div class="memory-commandbar">
        <div class="memory-title-block">
          <div class="memory-title">
            <Brain
              :size="18"
              :stroke-width="1.7"
            />
            <span>Memory</span>
          </div>
          <div class="memory-state-line">
            <span :class="['state-indicator', { off: overview?.enabled === false }]">
              <span class="state-dot" />
              {{ overview?.enabled === false ? 'Off' : 'On' }}
            </span>
            <span>{{ indexStateLabel }}</span>
          </div>
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

      <div
        class="memory-tabs"
        role="tablist"
        aria-label="Memory sections"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['memory-tab', { active: activeTab === tab.id }]"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
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
          <section class="memory-hero">
            <div class="memory-hero-main">
              <span class="section-kicker">What AI knows</span>
              <strong>{{ memoryHeroTitle }}</strong>
              <span>{{ memoryHeroSubtitle }}</span>
            </div>
            <div
              class="memory-hero-stats"
              aria-label="Memory summary"
            >
              <div
                v-for="stat in memoryHeroStats"
                :key="stat.id"
              >
                <strong>{{ stat.value }}</strong>
                <span>{{ stat.label }}</span>
              </div>
            </div>
            <div class="memory-hero-highlights">
              <div
                v-for="highlight in memoryHeroHighlights"
                :key="highlight.id"
                class="memory-highlight"
              >
                <span>{{ highlight.label }}</span>
                <strong>{{ highlight.title }}</strong>
                <p>{{ highlight.body }}</p>
              </div>
            </div>
          </section>

          <section
            class="memory-activity"
            aria-labelledby="memory-activity-title"
          >
            <div class="overview-domain-head">
              <span class="section-kicker">Activity</span>
              <strong id="memory-activity-title">What AI learned recently</strong>
            </div>
            <div class="recent-memory-list">
              <div
                v-for="activity in recentMemoryActivity"
                :key="activity.id"
                class="recent-memory-row"
              >
                <span>
                  <strong>{{ activity.title }}</strong>
                  <small>{{ activity.meta }}</small>
                </span>
                <p>{{ activity.body }}</p>
              </div>
            </div>
          </section>

          <details
            :class="['diagnostics-panel', 'diagnostics-domain', diagnosticsTone]"
          >
            <summary>
              <span>
                <strong>Diagnostics</strong>
                <small>How memory is operating</small>
              </span>
              <em>{{ diagnosticsSummary }}</em>
            </summary>
            <div class="diagnostics-content">
              <div class="health-cards">
                <div
                  v-for="card in healthCards"
                  :key="card.id"
                  :class="['health-card', card.tone]"
                >
                  <span class="health-card-dot" />
                  <span>
                    <strong>{{ card.title }}</strong>
                    <small>{{ card.detail }}</small>
                  </span>
                  <em>{{ card.status }}</em>
                </div>
              </div>

              <div
                v-if="hasMemoryErrors"
                class="diagnostic-errors"
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
              </div>

              <div class="path-grid">
                <span>Root</span>
                <code>{{ overview?.root || '...' }}</code>
                <span>Memory dir</span>
                <code>{{ overview?.memoryDir || '...' }}</code>
                <span>Profile</span>
                <code>{{ overview?.soulPath || '...' }}</code>
                <span>AI notes</span>
                <code>{{ overview?.memoryPath || '...' }}</code>
                <span>Dreams</span>
                <code>{{ overview?.dreamsPath || '...' }}</code>
                <span>Today</span>
                <code>{{ overview?.todayPath || '...' }}</code>
                <span>Index DB</span>
                <code>{{ overview?.dbPath || '...' }}</code>
              </div>
            </div>
          </details>
        </div>
      </template>

      <template v-else-if="activeTab === 'profile'">
        <div class="memory-tab-page profile-page">
          <section class="memory-tab-intro profile-intro">
            <div class="tab-intro-main">
              <span class="section-kicker">Profile</span>
              <strong>Shape what AI knows about you</strong>
              <span>Review durable facts, entities, and relationships before they steer future conversations.</span>
            </div>
            <div class="tab-intro-stats">
              <span>
                <strong>{{ activeGraphFactCount }}</strong>
                <small>Active facts</small>
              </span>
              <span>
                <strong>{{ graphEntities.length }}</strong>
                <small>Entities</small>
              </span>
              <span>
                <strong>{{ graphRelations.length }}</strong>
                <small>Connections</small>
              </span>
            </div>
            <div class="tab-intro-actions">
              <form
                class="search-row"
                @submit.prevent="loadGraph"
              >
                <input
                  v-model="graphSearch"
                  class="memory-input"
                  type="text"
                  placeholder="Search profile..."
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
              <div class="toolbar-actions">
                <button
                  class="secondary-action inline"
                  type="button"
                  @click="newGraphRecord"
                >
                  {{ graphView === 'entities' ? 'New entity' : graphView === 'relations' ? 'New connection' : 'New fact' }}
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
          </section>

          <div class="segmented graph-tabs">
            <button
              :class="{ active: graphView === 'observations' }"
              type="button"
              @click="graphView = 'observations'"
            >
              Facts {{ graphObservations.length }}
            </button>
            <button
              :class="{ active: graphView === 'relations' }"
              type="button"
              @click="graphView = 'relations'"
            >
              Connections {{ graphRelations.length }}
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

          <div class="profile-layout graph-layout memory-workspace">
            <section class="profile-list-surface memory-surface">
              <div class="workspace-head">
                <span>
                  <strong>{{ profileListTitle }}</strong>
                  <small>{{ profileListSubtitle }}</small>
                </span>
                <em>{{ graphCurrentListCount }} items</em>
              </div>
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
                  <code :title="`${memory.entityDisplayName || memory.entityId} / ${memory.slot}`">{{ observationActivityTitle(memory) }}</code>
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
              No profile rows yet.
            </div>
              </div>
            </section>

            <section class="profile-editor memory-surface">
              <div class="workspace-head">
                <span>
                  <strong>{{ profileEditorTitle }}</strong>
                  <small>{{ profileEditorSubtitle }}</small>
                </span>
              </div>
            <template v-if="graphView === 'entities'">
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
              <details class="profile-advanced">
                <summary>Advanced</summary>
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
                    <span class="setting-label">Confidence</span>
                    <input
                      v-model.number="graphEntityForm.confidence"
                      class="memory-input"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                    >
                  </label>
                  <label>
                    <span class="setting-label">Sensitivity</span>
                    <select
                      v-model="graphEntityForm.sensitivity"
                      class="memory-select"
                    >
                      <option value="normal">
                        Normal
                      </option>
                      <option value="sensitive">
                        Sensitive
                      </option>
                      <option value="secret">
                        Secret
                      </option>
                    </select>
                  </label>
                </div>
                <label>
                  <span class="setting-label">Evidence</span>
                  <textarea
                    v-model="graphEntityForm.evidence"
                    class="memory-textarea compact-area"
                    spellcheck="true"
                  />
                </label>
              </details>
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
                  <span class="setting-label">Text</span>
                  <input
                    v-model="graphRelationForm.text"
                    class="memory-input"
                    type="text"
                    spellcheck="true"
                  >
                </label>
              </div>
              <details class="profile-advanced">
                <summary>Advanced</summary>
                <div
                  v-if="graphRelationForm.id"
                  class="profile-id-row"
                >
                  <span>ID</span>
                  <code>{{ graphRelationForm.id }}</code>
                </div>
                <div class="profile-grid">
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
                  <label>
                    <span class="setting-label">Status</span>
                    <select
                      v-model="graphRelationForm.status"
                      class="memory-select"
                    >
                      <option value="active">
                        Active
                      </option>
                      <option value="superseded">
                        Superseded
                      </option>
                      <option value="conflict">
                        Conflict
                      </option>
                      <option value="deleted">
                        Deleted
                      </option>
                    </select>
                  </label>
                  <label>
                    <span class="setting-label">Sensitivity</span>
                    <select
                      v-model="graphRelationForm.sensitivity"
                      class="memory-select"
                    >
                      <option value="normal">
                        Normal
                      </option>
                      <option value="sensitive">
                        Sensitive
                      </option>
                      <option value="secret">
                        Secret
                      </option>
                    </select>
                  </label>
                </div>
                <label>
                  <span class="setting-label">Evidence</span>
                  <textarea
                    v-model="graphRelationForm.evidence"
                    class="memory-textarea compact-area"
                    spellcheck="true"
                  />
                </label>
              </details>
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

            <template v-else-if="graphView === 'duplicates'">
              <div class="review-empty">
                <strong>Possible duplicates are review-only here.</strong>
                <span>Use Merge or Ignore from the review list. New facts are created from the Facts tab.</span>
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
                  <span class="setting-label">Value</span>
                  <input
                    v-model="graphObservationForm.value"
                    class="memory-input"
                    type="text"
                    spellcheck="true"
                  >
                </label>
              </div>
              <label>
                <span class="setting-label">Text</span>
                <textarea
                  v-model="graphObservationForm.text"
                  class="memory-textarea"
                  spellcheck="true"
                />
              </label>
              <details class="profile-advanced">
                <summary>Advanced</summary>
                <div
                  v-if="graphObservationForm.id"
                  class="profile-id-row"
                >
                  <span>ID</span>
                  <code>{{ graphObservationForm.id }}</code>
                </div>
                <div class="profile-grid">
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
                  <label>
                    <span class="setting-label">Status</span>
                    <select
                      v-model="graphObservationForm.status"
                      class="memory-select"
                    >
                      <option value="active">
                        Active
                      </option>
                      <option value="superseded">
                        Superseded
                      </option>
                      <option value="conflict">
                        Conflict
                      </option>
                      <option value="deleted">
                        Deleted
                      </option>
                    </select>
                  </label>
                  <label>
                    <span class="setting-label">Sensitivity</span>
                    <select
                      v-model="graphObservationForm.sensitivity"
                      class="memory-select"
                    >
                      <option value="normal">
                        Normal
                      </option>
                      <option value="sensitive">
                        Sensitive
                      </option>
                      <option value="secret">
                        Secret
                      </option>
                    </select>
                  </label>
                </div>
                <label>
                  <span class="setting-label">Evidence</span>
                  <textarea
                    v-model="graphObservationForm.evidence"
                    class="memory-textarea compact-area"
                    spellcheck="true"
                  />
                </label>
              </details>
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
              class="audit-list profile-advanced"
            >
              <details>
                <summary>Audit</summary>
                <div
                  v-for="event in graphAudit"
                  :key="event.id"
                  class="audit-row"
                >
                  <span>{{ event.action }}</span>
                  <span>{{ formatMaybeDate(event.createdAt) }}</span>
                </div>
              </details>
            </div>
          </section>
        </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'notes'">
        <div class="memory-tab-page notes-page">
          <section class="memory-tab-intro notes-intro">
            <div class="tab-intro-main">
              <span class="section-kicker">Notes</span>
              <strong>Review raw memory notes</strong>
              <span>Use notes as source evidence; keep the user-facing profile clean and the raw capture editable.</span>
            </div>
            <div class="tab-intro-stats">
              <span>
                <strong>{{ noteCount('ai') }}</strong>
                <small>AI notes</small>
              </span>
              <span>
                <strong>{{ noteCount('daily') }}</strong>
                <small>Daily captures</small>
              </span>
              <span>
                <strong>{{ noteCount('dreams') }}</strong>
                <small>Reflections</small>
              </span>
            </div>
            <div class="segmented notes-tabs">
              <button
                v-for="filter in noteFilters"
                :key="filter.id"
                :class="{ active: noteFilter === filter.id }"
                type="button"
                @click="noteFilter = filter.id"
              >
                {{ filter.label }} {{ noteCount(filter.id) }}
              </button>
            </div>
          </section>

          <div class="notes-workspace memory-workspace">
            <section class="notes-list-surface memory-surface">
              <div class="workspace-head">
                <span>
                  <strong>Memory notes</strong>
                  <small>{{ visibleFiles.length }} visible notes</small>
                </span>
              </div>
              <div class="file-list">
                <button
                  v-for="file in visibleFiles"
                  :key="file.relativePath"
                  :class="['file-row', { active: selectedPath === file.relativePath }]"
                  type="button"
                  :title="file.relativePath"
                  @click="selectFile(file)"
                >
                  <component
                    :is="kindIcon(file.kind)"
                    :size="17"
                    :stroke-width="1.8"
                    class="file-icon"
                  />
                  <span class="file-main">
                    <span class="file-name">{{ memoryFileDisplayName(file) }}</span>
                    <span class="file-meta">{{ memoryFileMeta(file) }}</span>
                    <span
                      v-if="file.preview"
                      class="file-preview"
                    >{{ cleanMemoryPreview(file.preview, 120) }}</span>
                  </span>
                  <span class="file-date">{{ formatShortDate(file.mtimeMs) }}</span>
                </button>
              </div>
            </section>

          <div
            v-if="selectedFile"
            class="viewer memory-surface"
          >
            <div class="viewer-header">
              <span>
                <strong>{{ selectedFileDisplayTitle }}</strong>
                <small>{{ selectedFile.relativePath }}:{{ selectedFile.startLine }}-{{ selectedFile.endLine }}</small>
              </span>
              <em :class="['save-state', { dirty: selectedFileIsDirty }]">{{ selectedFileStatus }}</em>
              <button
                class="text-btn"
                type="button"
                :disabled="savingFile || !selectedFileIsDirty"
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
        </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'search'">
        <div class="memory-tab-page search-page">
          <section class="memory-tab-intro search-intro">
            <div class="tab-intro-main">
              <span class="section-kicker">Recall and capture</span>
              <strong>Find or add memory</strong>
              <span>Search what AI can recall, capture a fresh note, then review the evidence before jumping into Profile or Notes.</span>
            </div>
          </section>

          <div class="search-workspace memory-workspace">
            <section class="task-surface search-surface memory-surface">
              <div class="section-head">
                <div>
                  <span class="section-kicker">Recall</span>
                  <strong>Recall memory</strong>
                  <small>Search facts, profile records, and raw notes.</small>
                </div>
              </div>
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
            </section>

            <section class="task-surface capture-surface memory-surface">
              <div class="section-head">
                <div>
                  <span class="section-kicker">Capture</span>
                  <strong>Append note</strong>
                  <small>Save a quick observation to today&apos;s memory note.</small>
                </div>
              </div>
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
                <span
                  v-if="appendFeedback"
                  class="inline-feedback"
                >
                  {{ appendFeedback }}
                </span>
              </div>
            </section>
          </div>

          <section class="task-surface results-surface memory-surface">
            <div class="section-head">
              <div>
                <span class="section-kicker">Review</span>
                <strong>{{ searchStatusLabel }}</strong>
                <small>Open graph matches in Profile and note matches in Notes.</small>
              </div>
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
              v-else-if="!searched"
              class="search-empty-state"
            >
              <strong>Ready to recall</strong>
              <span>Try a project, preference, decision, or phrase from a recent conversation.</span>
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
                <span class="result-path">{{ searchHitTitle(hit) }}</span>
                <span class="result-score">{{ hit.score.toFixed(3) }}</span>
                <span class="result-meta">{{ searchHitMeta(hit) }}</span>
                <span class="result-content">{{ hit.content }}</span>
              </button>
            </div>
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
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-vue-next'
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
  MemoryManagedFile,
  MemoryOverview,
  MemoryReadResponse,
  MemorySearchHit,
} from '@shared/ipc'
import { normalizeSoulMemorySettings } from '@shared/defaults/settings'

type TabId = 'overview' | 'profile' | 'notes' | 'search'
type NoteFilter = 'all' | 'ai' | 'daily' | 'dreams'

interface MemoryHeroHighlight {
  id: string
  label: string
  title: string
  body: string
}

interface MemoryHeroStat {
  id: string
  value: string
  label: string
}

interface RecentMemoryActivity {
  id: string
  title: string
  meta: string
  body: string
}

interface HealthCard {
  id: string
  title: string
  status: string
  detail: string
  tone: 'healthy' | 'warning' | 'danger' | 'muted'
}

const sessionsStore = useSessionsStore()
const activeAgentId = computed(() => sessionsStore.currentSession?.agentId || 'default')

const overview = ref<MemoryOverview | null>(null)
const loading = ref(false)
const searching = ref(false)
const appending = ref(false)
const savingFile = ref(false)
const profileLoading = ref(false)
const profileSaving = ref(false)
const searched = ref(false)
const error = ref('')
const activeTab = ref<TabId>('overview')
const noteFilter = ref<NoteFilter>('all')
const selectedPath = ref('SOUL.md')
const selectedFile = ref<MemoryReadResponse['file'] | null>(null)
const selectedFileText = ref('')
const searchQuery = ref('')
const searchResults = ref<MemorySearchHit[]>([])
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
const appendFeedback = ref('')
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
let dreamingPollTimer: number | null = null

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'profile', label: 'Profile' },
  { id: 'notes', label: 'Notes' },
  { id: 'search', label: 'Search' },
]

const noteFilters: Array<{ id: NoteFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ai', label: 'AI Notes' },
  { id: 'daily', label: 'Daily' },
  { id: 'dreams', label: 'Dreams' },
]

const memorySettings = computed(() =>
  normalizeSoulMemorySettings(overview.value?.settings),
)

const loadedFactCount = computed(() =>
  graphObservations.value.filter(item => item.status === 'active').length,
)

const durableFactCount = computed(() =>
  Math.max(overview.value?.graph?.observations ?? 0, loadedFactCount.value),
)

const knownEntityCount = computed(() =>
  Math.max(overview.value?.graph?.entities ?? 0, graphEntities.value.length),
)

const memoryHeroTitle = computed(() => {
  if (durableFactCount.value > 0) {
    return `Memory has learned ${durableFactCount.value} durable ${durableFactCount.value === 1 ? 'fact' : 'facts'}`
  }
  const fileCount = overview.value?.files.length ?? 0
  if (fileCount > 0) return `Memory is learning from ${fileCount} notes`
  return 'Memory is ready to learn from your work'
})

const memoryHeroSubtitle = computed(() => {
  const entities = knownEntityCount.value
  const daily = noteCount('daily')
  const parts = [
    entities > 0 ? `${entities} entities` : '',
    daily > 0 ? `${daily} daily captures` : '',
    overview.value?.dreaming.lastApplied ? `${overview.value.dreaming.lastApplied} promoted insights` : '',
  ].filter(Boolean)
  return parts.length
    ? parts.join(' · ')
    : 'Profile facts, daily notes, and recall signals will appear here as memory learns.'
})

const memoryHeroStats = computed<MemoryHeroStat[]>(() => [
  {
    id: 'facts',
    value: String(durableFactCount.value),
    label: 'Durable facts',
  },
  {
    id: 'entities',
    value: String(knownEntityCount.value),
    label: 'Known entities',
  },
  {
    id: 'daily',
    value: String(noteCount('daily')),
    label: 'Daily captures',
  },
])

const memoryHeroHighlights = computed<MemoryHeroHighlight[]>(() => {
  const observations = graphObservations.value
    .filter(item => item.status === 'active')
    .slice(0, 3)
    .map(item => ({
      id: item.id,
      label: kindTitle(item.kind),
      title: observationActivityTitle(item),
      body: cleanMemoryPreview(item.text || item.value, 132),
    }))

  if (observations.length > 0) return observations

  const files = [...(overview.value?.files || [])]
    .filter(file => file.preview.trim())
    .sort((a, b) => fileSignalWeight(b) - fileSignalWeight(a) || b.mtimeMs - a.mtimeMs)
    .slice(0, 3)

  if (files.length > 0) {
    return files.map(file => ({
      id: file.relativePath,
      label: kindLabel(file.kind),
      title: memoryFileHighlightTitle(file),
      body: cleanMemoryPreview(file.preview, 132),
    }))
  }

  return [{
    id: 'empty',
    label: 'Ready',
    title: 'No learned memory yet',
    body: 'Facts and notes captured from conversations will become visible here.',
  }]
})

const recentMemoryActivity = computed<RecentMemoryActivity[]>(() => {
  const pending = (overview.value?.pendingCaptures || []).slice(0, 1).map(item => ({
    id: `pending:${item.id}`,
    title: item.heading ? `Capture: ${item.heading}` : 'Capture waiting to be reviewed',
    meta: activityMeta('Capture', item.createdAt),
    body: cleanMemoryPreview(item.userPreview || item.assistantPreview || item.content, 150),
  }))

  const observations = graphObservations.value
    .filter(item => item.status === 'active')
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, Math.max(0, 4 - pending.length))
    .map(item => ({
      id: `observation:${item.id}`,
      title: observationActivityTitle(item),
      meta: activityMeta(kindTitle(item.kind), item.updatedAt || item.createdAt),
      body: cleanMemoryPreview(item.text || item.value, 150),
    }))

  const files = [...(overview.value?.files || [])]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(0, 4 - pending.length - observations.length))
    .map(file => ({
      id: `file:${file.relativePath}`,
      title: memoryFileActivityTitle(file),
      meta: activityMeta(kindLabel(file.kind), file.mtimeMs),
      body: cleanMemoryPreview(file.preview || `${file.lineCount} lines`, 150),
    }))

  const items = [...pending, ...observations, ...files]
  if (items.length > 0) return items
  return [{
    id: 'empty',
    title: 'No activity yet',
    meta: 'Memory',
    body: 'Captured notes and promoted insights will appear here.',
  }]
})

const hasMemoryErrors = computed(() =>
  Boolean(
    overview.value?.status.lastError ||
    overview.value?.status.lastCaptureError ||
    overview.value?.status.lastFlushError ||
    overview.value?.dreaming.lastError,
  ),
)

const diagnosticsSummary = computed(() => {
  if (hasMemoryErrors.value) return 'Needs attention'
  const indexed = overview.value?.status.indexedFiles ?? 0
  if (indexed > 0) return `${indexed} indexed files · ${dreamingStatusLabel.value}`
  return 'Ready'
})

const diagnosticsTone = computed(() => {
  if (hasMemoryErrors.value) return 'danger'
  if (isDreamingInFlight.value) return 'warning'
  return 'muted'
})

const healthCards = computed<HealthCard[]>(() => {
  const status = overview.value?.status
  const dreaming = overview.value?.dreaming
  return [
    {
      id: 'capture',
      title: 'Capture',
      status: status?.lastCaptureError ? 'Needs attention' : (status?.lastCaptureStatus || 'Ready'),
      detail: status?.lastCaptureError || `Last ${formatStatusDate(status?.lastCaptureAt)}`,
      tone: status?.lastCaptureError ? 'danger' : 'healthy',
    },
    {
      id: 'recall',
      title: 'Recall index',
      status: status?.lastError ? 'Needs attention' : status?.indexedFiles ? 'Ready' : 'Not indexed',
      detail: status?.lastError || `${status?.indexedFiles ?? 0} files searchable`,
      tone: status?.lastError ? 'danger' : status?.indexedFiles ? 'healthy' : 'muted',
    },
    {
      id: 'dreaming',
      title: 'Dreaming',
      status: dreaming?.lastError ? 'Needs attention' : dreamingStatusLabel.value,
      detail: dreaming?.lastError || `Next ${formatStatusDate(dreaming?.nextRunAt)}`,
      tone: dreaming?.lastError ? 'danger' : isDreamingInFlight.value ? 'warning' : dreaming?.enabled ? 'healthy' : 'muted',
    },
    {
      id: 'sync',
      title: 'Compact flush',
      status: status?.lastFlushError ? 'Needs attention' : 'Ready',
      detail: status?.lastFlushError || `Last ${formatStatusDate(status?.lastFlushAt)}`,
      tone: status?.lastFlushError ? 'danger' : 'healthy',
    },
  ]
})

const indexStateLabel = computed(() => {
  const status = overview.value?.status
  if (!status) return 'Loading index'
  if (status.lastError) return 'Index needs attention'
  if (status.indexedFiles > 0) return `${status.indexedFiles} files indexed`
  return 'Index not built'
})

const isDreamingInFlight = computed(() =>
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

const graphCurrentListCount = computed(() => {
  if (graphView.value === 'entities') return graphEntities.value.length
  if (graphView.value === 'relations') return graphRelations.value.length
  if (graphView.value === 'duplicates') return graphDuplicates.value.length
  return graphObservations.value.length
})

const activeGraphFactCount = computed(() =>
  graphObservations.value.filter(item => item.status === 'active').length,
)

const profileListTitle = computed(() => {
  if (graphView.value === 'entities') return 'Known entities'
  if (graphView.value === 'relations') return 'Connections'
  if (graphView.value === 'duplicates') return 'Possible duplicates'
  return 'Facts to review'
})

const profileListSubtitle = computed(() => {
  if (graphView.value === 'entities') return 'People, projects, systems, and concepts memory can attach facts to.'
  if (graphView.value === 'relations') return 'How remembered entities relate to each other.'
  if (graphView.value === 'duplicates') return 'Review possible overlap before merging durable memory.'
  return 'Durable facts that shape future assistant behavior.'
})

const profileEditorTitle = computed(() => {
  if (graphView.value === 'entities') return graphEntityForm.value.id ? 'Edit entity' : 'Create entity'
  if (graphView.value === 'relations') return graphRelationForm.value.id ? 'Edit connection' : 'Create connection'
  if (graphView.value === 'duplicates') return 'Review duplicates'
  return graphObservationForm.value.id ? 'Edit fact' : 'Create fact'
})

const profileEditorSubtitle = computed(() => {
  if (graphView.value === 'entities') return 'Define the thing memory can recognize.'
  if (graphView.value === 'relations') return 'Describe a relationship between two remembered things.'
  if (graphView.value === 'duplicates') return 'Duplicate actions happen from the review list.'
  return 'Turn a useful observation into structured memory.'
})

const visibleFiles = computed(() => {
  const files = overview.value?.files || []
  if (noteFilter.value === 'all') return files
  if (noteFilter.value === 'ai') return files.filter(file => file.kind === 'soul' || file.kind === 'memory')
  return files.filter(file => file.kind === noteFilter.value)
})

const selectedManagedFile = computed(() =>
  overview.value?.files.find(file => file.relativePath === selectedPath.value) || null,
)

const selectedFileIsDirty = computed(() =>
  Boolean(selectedFile.value && selectedFileText.value !== selectedFile.value.text),
)

const selectedFileStatus = computed(() => {
  if (savingFile.value) return 'Saving...'
  return selectedFileIsDirty.value ? 'Unsaved changes' : 'Saved'
})

const selectedFileDisplayTitle = computed(() => {
  if (selectedManagedFile.value) return memoryFileDisplayName(selectedManagedFile.value)
  return selectedFile.value?.relativePath || 'Selected note'
})

const searchStatusLabel = computed(() => {
  if (searching.value) return 'Searching...'
  if (!searched.value) return 'Ready'
  return `${searchResults.value.length} ${searchResults.value.length === 1 ? 'match' : 'matches'}`
})

watch(
  () => activeTab.value,
  async (tab) => {
    if (tab === 'notes' && overview.value) {
      await ensureFileSelectionForTab()
    }
    if (tab === 'profile') {
      await loadGraph()
    }
  },
)

watch(
  () => noteFilter.value,
  async () => {
    if (activeTab.value === 'notes' && overview.value) {
      await ensureFileSelectionForTab()
    }
  },
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
  if (dreamingPollTimer) {
    window.clearTimeout(dreamingPollTimer)
    dreamingPollTimer = null
  }
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
    void loadOverviewMemoryFacts()
    if (!overview.value.files.some(file => file.relativePath === selectedPath.value)) {
      selectedPath.value = overview.value.files.find(file => file.relativePath === 'SOUL.md')?.relativePath ||
        overview.value.files[0]?.relativePath ||
        ''
    }
    if (activeTab.value === 'notes' && selectedPath.value) {
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

async function loadOverviewMemoryFacts(): Promise<void> {
  try {
    const agentId = activeAgentId.value
    const [entities, observations] = await Promise.all([
      window.electronAPI.listMemoryGraphEntities({ agentId, limit: 40 }),
      window.electronAPI.listMemoryGraphObservations({ agentId, limit: 8 }),
    ])
    if (entities.success && entities.entities) {
      graphEntities.value = entities.entities
    }
    if (observations.success && observations.observations) {
      graphObservations.value = observations.observations
    }
  } catch {
    // Overview memory previews are supplemental; the page should stay usable if graph recall is unavailable.
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
  if (file.relativePath !== selectedPath.value && !confirmDiscardSelectedFileChanges()) return
  selectedPath.value = file.relativePath
  await readSelectedFile(undefined, true)
}

function confirmDiscardSelectedFileChanges(): boolean {
  return !selectedFileIsDirty.value || window.confirm('Discard unsaved note changes?')
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
  if (!confirmDiscardSelectedFileChanges()) return
  activeTab.value = 'notes'
  noteFilter.value = hit.kind === 'daily' ? 'daily' : hit.kind === 'memory' ? 'ai' : 'all'
  selectedPath.value = hit.path
  await readSelectedFile(hit.startLine)
}

async function openFileInTab(file: MemoryManagedFile): Promise<void> {
  activeTab.value = 'notes'
  noteFilter.value = file.kind === 'daily'
    ? 'daily'
    : file.kind === 'dreams'
      ? 'dreams'
      : file.kind === 'soul' || file.kind === 'memory'
        ? 'ai'
        : 'all'
  selectedPath.value = file.relativePath
  await readSelectedFile(undefined, true)
}

async function appendMemory(): Promise<void> {
  const content = appendContent.value.trim()
  if (!content) return
  appending.value = true
  error.value = ''
  appendFeedback.value = ''
  try {
    const response = await window.electronAPI.appendMemory({
      content,
      agentId: activeAgentId.value,
      target: appendTarget.value,
      heading: appendHeading.value.trim() || undefined,
    })
    if (!response.success) throw new Error(response.error || 'Failed to append memory')
    appendContent.value = ''
    appendFeedback.value = `Saved to ${memoryAppendTargetLabel(response.target?.relativePath)}`
    selectedPath.value = response.target?.relativePath || selectedPath.value
    await loadOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    appending.value = false
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

function memoryFileDisplayName(file: MemoryManagedFile): string {
  if (file.kind === 'soul') return 'Profile guidance'
  if (file.kind === 'memory') return 'Long-term memory note'
  if (file.kind === 'dreams') return 'Reflection report'
  const date = memoryFileDateLabel(file)
  return date ? `Daily capture · ${date}` : 'Daily capture'
}

function memoryFileMeta(file: MemoryManagedFile): string {
  return `${kindLabel(file.kind)} · ${file.lineCount} lines · ${formatSize(file.size)}`
}

function memoryAppendTargetLabel(relativePath?: string): string {
  const file = overview.value?.files.find(item => item.relativePath === relativePath)
  if (file) return memoryFileDisplayName(file)
  return relativePath || 'daily memory'
}

function memoryFileDateLabel(file: MemoryManagedFile): string {
  if (file.date) {
    const ms = Date.parse(`${file.date}T12:00:00`)
    if (!Number.isNaN(ms)) return formatShortDate(ms)
  }
  return formatShortDate(file.mtimeMs)
}

function kindTitle(kind: MemoryGraphObservationKind): string {
  if (kind === 'identity') return 'Identity'
  if (kind === 'preference') return 'Preference'
  if (kind === 'constraint') return 'Constraint'
  if (kind === 'decision') return 'Decision'
  if (kind === 'project') return 'Project'
  if (kind === 'summary') return 'Summary'
  if (kind === 'episodic') return 'Episode'
  return 'Fact'
}

function observationActivityTitle(item: MemoryGraphObservation): string {
  const slot = humanizeMemoryLabel(item.slot)
  if (item.entityDisplayName && slot) return `${item.entityDisplayName}: ${slot}`
  if (slot) return slot
  return kindTitle(item.kind)
}

function humanizeMemoryLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, letter => letter.toUpperCase())
}

function memoryFileHighlightTitle(file: MemoryManagedFile): string {
  if (file.kind === 'soul') return 'Profile facts'
  if (file.kind === 'memory') return 'Long-term notes'
  if (file.kind === 'dreams') return 'Promoted insights'
  return 'Daily capture'
}

function memoryFileActivityTitle(file: MemoryManagedFile): string {
  if (file.kind === 'soul') return 'Profile memory refined'
  if (file.kind === 'memory') return 'Long-term notes updated'
  if (file.kind === 'dreams') return 'Reflection summary refreshed'
  return 'Daily memory captured'
}

function searchHitTitle(hit: MemorySearchHit): string {
  if (hit.kind === 'graph' || hit.kind === 'canonical') {
    if (hit.path.startsWith('entity:')) return 'Profile entity'
    if (hit.path.startsWith('relation:')) return 'Memory connection'
    return 'Structured memory fact'
  }
  if (hit.kind === 'daily') {
    const date = hit.date ? formatShortDate(Date.parse(`${hit.date}T12:00:00`)) : ''
    return date ? `Daily capture · ${date}` : 'Daily capture'
  }
  return 'AI memory note'
}

function searchHitMeta(hit: MemorySearchHit): string {
  const source = hit.kind === 'graph' || hit.kind === 'canonical'
    ? 'Profile'
    : hit.kind === 'daily'
      ? 'Notes'
      : 'AI notes'
  return `${source} · ${hit.path}:${hit.startLine}-${hit.endLine}`
}

function fileSignalWeight(file: MemoryManagedFile): number {
  if (file.kind === 'soul') return 40
  if (file.kind === 'memory') return 30
  if (file.kind === 'dreams') return 20
  return 10
}

function cleanMemoryPreview(value: string, maxLength = 180): string {
  const clean = value
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return 'No preview available yet.'
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}...` : clean
}

function noteCount(filter: NoteFilter): number {
  const files = overview.value?.files || []
  if (filter === 'all') return files.length
  if (filter === 'ai') return files.filter(file => file.kind === 'soul' || file.kind === 'memory').length
  return files.filter(file => file.kind === filter).length
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function activityMeta(label: string, ms?: number): string {
  const date = formatShortDate(ms)
  return date ? `${label} · ${date}` : label
}

function formatShortDate(ms?: number): string {
  if (!ms || ms < 100000000000) return ''
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatStatusDate(ms?: number): string {
  if (!ms) return 'never'
  return formatShortDate(ms)
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
  padding: 10px 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memory-commandbar,
.memory-actions,
.memory-tabs,
.append-top,
.inline-field {
  min-width: 0;
  display: flex;
  align-items: center;
}

.memory-commandbar {
  justify-content: space-between;
  gap: 14px;
}

.memory-title-block {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.memory-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 14px;
  font-weight: 700;
}

.memory-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-state-line {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.state-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ui-status-success-fg, #16a34a);
  font-weight: 700;
}

.state-indicator.off {
  color: var(--ui-text-muted-fg, var(--muted));
}

.state-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
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

.memory-tabs {
  display: flex;
  gap: 18px;
  padding: 0 1px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 58%, transparent);
}

.memory-tab {
  position: relative;
  min-width: 0;
  width: auto;
  min-height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  padding: 0 0 7px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  font-weight: 650;
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
  background: transparent;
}

.memory-tab.active::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: var(--ui-accent-primary-fg, var(--accent));
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

	@keyframes memoryRiseIn {
	  from {
	    opacity: 0;
	    transform: translateY(6px);
	  }
	  to {
	    opacity: 1;
	    transform: translateY(0);
	  }
	}

	.file-list,
	.search-results,
	.overview-stack,
	.memory-tab-page {
	  min-width: 0;
	  display: flex;
	  flex-direction: column;
	  gap: 8px;
	}

	.memory-tab-page {
	  gap: 14px;
	  animation: memoryRiseIn 0.18s ease-out;
	}

	.memory-tab-intro,
	.memory-surface {
	  min-width: 0;
	  border-radius: 8px;
	  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3.5%, transparent);
	}

	.memory-tab-intro {
	  display: grid;
	  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.52fr);
	  gap: 12px;
	  align-items: end;
	  padding: 14px;
	}

	.tab-intro-main,
	.workspace-head > span,
	.section-head > div {
	  min-width: 0;
	  display: grid;
	  gap: 3px;
	}

	.tab-intro-main strong {
	  color: var(--ui-text-primary-fg, var(--text));
	  font-size: 18px;
	  font-weight: 760;
	  line-height: 1.2;
	  overflow-wrap: anywhere;
	}

	.tab-intro-main > span:last-child,
	.workspace-head small,
	.section-head small {
	  color: var(--ui-text-muted-fg, var(--muted));
	  font-size: 12px;
	  line-height: 1.4;
	  overflow-wrap: anywhere;
	}

	.tab-intro-stats {
	  min-width: 0;
	  display: grid;
	  grid-template-columns: repeat(3, minmax(0, 1fr));
	  gap: 8px;
	}

	.tab-intro-stats span {
	  min-width: 0;
	  display: grid;
	  gap: 2px;
	  padding: 9px;
	  border-radius: 8px;
	  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 68%, transparent);
	}

	.tab-intro-stats strong {
	  color: var(--ui-text-primary-fg, var(--text));
	  font-size: 16px;
	  line-height: 1.1;
	}

	.tab-intro-stats small {
	  color: var(--ui-text-muted-fg, var(--muted));
	  font-size: 11px;
	  line-height: 1.25;
	}

	.tab-intro-actions {
	  min-width: 0;
	  grid-column: 1 / -1;
	  display: grid;
	  grid-template-columns: minmax(0, 1fr) auto;
	  gap: 8px;
	  align-items: center;
	}

	.memory-workspace {
	  min-width: 0;
	}

	.workspace-head {
	  min-width: 0;
	  display: flex;
	  align-items: start;
	  justify-content: space-between;
	  gap: 12px;
	  margin-bottom: 8px;
	}

	.workspace-head strong {
	  color: var(--ui-text-primary-fg, var(--text));
	  font-size: 13px;
	  line-height: 1.25;
	}

	.workspace-head em {
	  color: var(--ui-text-muted-fg, var(--muted));
	  font-size: 11px;
	  font-style: normal;
	  font-weight: 700;
	  white-space: nowrap;
	}

	.file-list.compact {
	  gap: 0;
	}

.notes-workspace {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(260px, 0.42fr) minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}

	.notes-workspace .file-list {
	  gap: 2px;
	  min-height: 0;
	}

	.notes-list-surface,
	.profile-list-surface,
	.profile-editor,
	.viewer,
	.task-surface {
	  padding: 10px;
	  animation: memoryRiseIn 0.18s ease-out;
	}

	.file-row,
	.result-row {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  padding: 8px;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}

	.file-row:hover,
	.result-row:hover,
	.file-row.active {
	  background: var(--ui-state-active-bg, var(--active));
	  transform: translateY(-1px);
	}

.file-row.active,
.result-row:hover {
  box-shadow: inset 3px 0 0 var(--ui-accent-primary-fg, var(--accent));
}

.file-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.file-row.active .file-icon {
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
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.file-date,
.result-score {
  flex-shrink: 0;
}

	.viewer {
	  min-width: 0;
	  margin-top: 0;
	  border: 0;
	  border-radius: 8px;
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
	  display: grid;
	  gap: 2px;
	  margin-right: auto;
	  overflow-wrap: anywhere;
	}

	.viewer-header strong {
	  color: var(--ui-text-primary-fg, var(--text));
	  font-size: 12px;
	  line-height: 1.25;
	}

	.viewer-header small,
	.save-state {
	  color: var(--ui-text-muted-fg, var(--muted));
	  font-size: 11px;
	  line-height: 1.25;
	}

	.save-state {
	  font-style: normal;
	  font-weight: 700;
	  white-space: nowrap;
	}

	.save-state.dirty,
	.inline-feedback {
	  color: var(--ui-accent-primary-fg, var(--accent));
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

.memory-hero,
.task-surface {
  min-width: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4%, transparent);
}

.overview-stack {
  gap: 14px;
}

.memory-hero {
  display: grid;
  gap: 16px;
  padding: 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent), transparent 52%),
    color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 5%, transparent);
}

.memory-hero-main,
.section-head > div,
.health-card,
.recent-memory-row > span,
.overview-domain-head,
.diagnostics-panel summary > span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.memory-hero-main strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 24px;
  font-weight: 760;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.memory-hero-main > span:last-child,
.memory-highlight p,
.recent-memory-row p,
.recent-memory-row small,
.health-card small,
.diagnostics-panel small {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.memory-hero-stats {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.memory-hero-stats div {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 78%, transparent);
}

.memory-hero-stats strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 18px;
  line-height: 1.1;
}

.memory-hero-stats span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 650;
  line-height: 1.25;
}

.memory-hero-highlights {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.memory-highlight {
  min-width: 0;
  display: grid;
  gap: 4px;
  align-content: start;
  min-height: 108px;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 72%, transparent);
}

.memory-highlight span,
.overview-domain-head .section-kicker {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 720;
  line-height: 1.2;
}

.memory-highlight strong,
.recent-memory-row strong,
.section-head strong,
.overview-domain-head strong,
.diagnostics-panel summary strong,
.health-card strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.section-kicker {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.section-head,
.overview-domain-head {
  min-width: 0;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 8px;
}

.overview-domain-head {
  display: grid;
  justify-content: stretch;
  padding: 0;
}

.memory-activity {
  min-width: 0;
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3%, transparent);
}

.recent-memory-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.recent-memory-row,
.health-card {
  min-width: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
}

.health-card em {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}

.recent-memory-row {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 112px;
  padding: 12px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 70%, transparent);
}

.memory-highlight p,
.recent-memory-row p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.health-cards {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.health-card {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 7px 8px;
  padding: 8px;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2%, transparent);
}

.health-card em {
  grid-column: 2;
}

.health-card-dot {
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 999px;
  background: var(--ui-text-muted-fg, var(--muted));
}

.health-card.healthy .health-card-dot {
  background: var(--ui-status-success-fg, #16a34a);
}

.health-card.warning .health-card-dot {
  background: var(--ui-status-warning-fg, #f59e0b);
}

.health-card.danger .health-card-dot {
  background: var(--ui-status-danger-fg, #ef4444);
}

.diagnostics-panel {
  min-width: 0;
  border-radius: 8px;
  background: transparent;
}

.diagnostics-domain[open] {
  padding: 0 10px 10px;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.5%, transparent);
}

.diagnostics-panel summary {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 2px;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  font-size: 12px;
}

.diagnostics-domain[open] summary {
  padding: 10px 0;
}

.diagnostics-panel summary em {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}

.diagnostics-panel.danger summary em {
  color: var(--ui-status-danger-fg, #ef4444);
}

.diagnostics-content {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.diagnostic-errors {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.diagnostics-panel .path-grid,
.diagnostic-errors {
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 55%, transparent);
}

.path-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 12px;
  align-items: start;
}

.path-grid span {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
  line-height: 1.45;
}

.path-grid code {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  line-height: 1.45;
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
  padding: 0;
  border-top: 0;
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
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
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

.primary-btn:not(:disabled),
.secondary-action:not(:disabled),
.memory-tab,
.segmented button,
.text-btn:not(:disabled),
.icon-btn:not(:disabled) {
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.primary-btn:hover:not(:disabled),
.secondary-action:hover:not(:disabled),
.text-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.append-box {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
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

.result-meta {
  grid-column: 1 / -1;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  overflow-wrap: anywhere;
}

.search-empty-state,
.review-empty {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 16px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 55%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  line-height: 1.45;
}

.search-empty-state strong,
.review-empty strong {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  line-height: 1.25;
}

.inline-feedback {
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
}

.panel-toolbar,
.profile-toolbar {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.toolbar-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-toolbar .search-row {
  margin-bottom: 0;
}

.task-surface {
  display: grid;
  gap: 8px;
  align-content: start;
}

.task-surface .section-head {
  padding: 0 0 2px;
}

.task-surface .search-row {
  margin-bottom: 0;
}

.search-workspace {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.search-surface {
  flex: 1 1 58%;
  align-self: start;
  height: max-content;
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 24%, transparent);
}

.capture-surface {
  flex: 0 1 42%;
  align-self: start;
  height: max-content;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.5%, transparent);
}

.search-workspace .memory-textarea {
  min-height: 72px;
}

.results-surface {
  min-width: 0;
}

.results-surface .search-results {
  gap: 2px;
}

.profile-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 14px;
}

.graph-layout {
  align-items: start;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-height: 420px;
  overflow: auto;
}

.profile-row {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 0;
  border-radius: 8px;
  padding: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.profile-row:hover,
.profile-row.active {
  background: var(--ui-state-active-bg, var(--active));
}

.profile-row:hover {
  transform: translateY(-1px);
}

.profile-row.active {
  box-shadow: inset 3px 0 0 var(--ui-accent-primary-fg, var(--accent));
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
  animation: memoryRiseIn 0.16s ease-out;
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
}

.profile-editor .action-row {
  margin-top: 2px;
}

.profile-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.profile-advanced {
  min-width: 0;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3%, transparent);
  padding: 8px;
}

.profile-advanced > summary,
.profile-advanced summary {
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
}

.profile-advanced[open],
.profile-advanced details[open] {
  display: grid;
  gap: 9px;
}

.profile-id-row {
  min-width: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-size: 12px;
}

.profile-id-row code {
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  overflow-wrap: anywhere;
}

.compact-area {
  min-height: 76px;
}

.export-area {
  min-height: 140px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.audit-list {
  display: block;
}

.memory-section {
  min-width: 0;
  max-width: 100%;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4%, transparent);
  overflow: hidden;
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

.segmented.graph-tabs button,
.segmented.notes-tabs button {
  min-height: 28px;
  padding: 0 4px;
}

.segmented.notes-tabs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.notes-intro .notes-tabs,
.search-intro .tab-intro-main {
  grid-column: 1 / -1;
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

@media (max-width: 720px) {
  .profile-layout,
  .notes-workspace,
  .search-workspace,
  .memory-tab-intro,
  .tab-intro-actions {
    grid-template-columns: 1fr;
  }

  .memory-hero-highlights,
  .memory-hero-stats,
  .tab-intro-stats,
  .recent-memory-list,
  .health-cards {
    grid-template-columns: 1fr;
  }

  .search-workspace {
    flex-direction: column;
  }

  .search-surface,
  .capture-surface {
    width: 100%;
    flex-basis: auto;
  }
}

@media (max-width: 640px) {
  .grid-two,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .segmented.notes-tabs,
  .segmented.graph-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .memory-tabs {
    gap: 12px;
    overflow-x: auto;
  }

  .search-row {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
</style>
