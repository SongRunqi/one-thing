<template>
  <PageShell :no-padding="activeTab === 'profile' || activeTab === 'notes'">
    <template #header>
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
    </template>

    <template #tabs>
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
    </template>

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
        <!-- Premium Hero Section -->
        <section class="memory-hero">
          <div class="memory-hero-main">
            <span class="section-kicker">What AI knows</span>
            <strong>{{ memoryHeroTitle }}</strong>
            <span>{{ memoryHeroSubtitle }}</span>
          </div>
            
          <!-- Elevated Stats Cards Grid -->
          <div
            class="memory-hero-stats"
            aria-label="Memory summary stats"
          >
            <div
              v-for="stat in memoryHeroStats"
              :key="stat.id"
              class="stat-dashboard-card"
            >
              <div class="stat-card-glow" />
              <span class="stat-card-number">{{ stat.value }}</span>
              <span class="stat-card-label">{{ stat.label }}</span>
            </div>
          </div>

          <!-- Highlights Grid -->
          <div class="memory-highlights-section">
            <div class="section-subheader">
              <span class="section-kicker">Key Insights</span>
              <strong>Pinned memory elements</strong>
            </div>
            <div class="memory-hero-highlights">
              <div
                v-for="highlight in memoryHeroHighlights"
                :key="highlight.id"
                class="memory-highlight-card"
              >
                <span class="highlight-tag">{{ highlight.label }}</span>
                <strong class="highlight-title">{{ highlight.title }}</strong>
                <p class="highlight-body">
                  {{ highlight.body }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Chronological Activity Timeline Feed -->
        <section
          class="memory-activity-section memory-activity"
          aria-labelledby="memory-activity-title"
        >
          <div class="section-subheader padding-x">
            <span class="section-kicker">Updates Feed</span>
            <strong id="memory-activity-title">What AI learned recently</strong>
          </div>
            
          <div class="activity-timeline">
            <div
              v-for="(activity, idx) in recentMemoryActivity"
              :key="activity.id"
              class="timeline-item-row"
            >
              <div class="timeline-trail">
                <div class="timeline-dot" />
                <div
                  v-if="idx < recentMemoryActivity.length - 1"
                  class="timeline-line"
                />
              </div>
              <div class="timeline-card">
                <div class="timeline-card-header">
                  <strong class="timeline-card-title">{{ activity.title }}</strong>
                  <span class="timeline-card-time">{{ activity.meta }}</span>
                </div>
                <p class="timeline-card-body">
                  {{ activity.body }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Themed Collapsible Diagnostics Panel Card -->
        <div :class="['diagnostics-card', 'memory-surface', diagnosticsTone]">
          <div
            class="diagnostics-toggle-header"
            @click="diagnosticsOpen = !diagnosticsOpen"
          >
            <div class="diagnostics-summary-info diagnostics-domain">
              <Info
                :size="16"
                class="diagnostics-icon"
              />
              <span>Diagnostics</span>
              <small>How memory is operating & database paths</small>
            </div>
            <div class="diagnostics-state-pill">
              <span class="state-pill-text">{{ diagnosticsSummary }}</span>
              <ChevronDown
                :size="16"
                :class="['chevron-icon', { rotated: diagnosticsOpen }]"
              />
            </div>
          </div>
            
          <div
            v-show="diagnosticsOpen"
            class="diagnostics-expanded-body"
          >
            <div class="health-cards">
              <div
                v-for="card in healthCards"
                :key="card.id"
                :class="['health-card-widget', card.tone]"
              >
                <span class="health-indicator-dot" />
                <div class="health-card-main">
                  <span class="health-card-title">{{ card.title }}</span>
                  <span class="health-card-detail">{{ card.detail }}</span>
                </div>
                <em class="health-card-status">{{ card.status }}</em>
              </div>
            </div>

            <!-- Inline Errors -->
            <div
              v-if="hasMemoryErrors"
              class="diagnostic-errors-block"
            >
              <div
                v-if="overview?.status.lastError"
                class="inline-error-badge"
              >
                <span>Index Error:</span> {{ overview.status.lastError }}
              </div>
              <div
                v-if="overview?.status.lastCaptureError"
                class="inline-error-badge"
              >
                <span>Capture Error:</span> {{ overview.status.lastCaptureError }}
              </div>
              <div
                v-if="overview?.status.lastFlushError"
                class="inline-error-badge"
              >
                <span>Flush Error:</span> {{ overview.status.lastFlushError }}
              </div>
              <div
                v-if="overview?.dreaming.lastError"
                class="inline-error-badge"
              >
                <span>Dreaming Error:</span> {{ overview.dreaming.lastError }}
              </div>
            </div>

            <!-- Truncated Paths Grid with Tooltips and Quick Action buttons -->
            <div class="path-grid-container">
              <div
                v-for="path in pathsInfo"
                :key="path.label"
                class="path-info-row"
              >
                <span class="path-info-label">{{ path.label }}</span>
                <div class="path-info-value-block">
                  <code
                    class="path-code-display"
                    :title="path.value"
                  >{{ path.truncatedValue }}</code>
                  <button
                    class="path-copy-button"
                    type="button"
                    title="Copy full path"
                    @click="copyText(path.value)"
                  >
                    <Copy :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="activeTab === 'profile'">
      <div class="memory-tab-page profile-page">
        <div
          class="profile-layout graph-layout memory-workspace"
          :class="{ 'detail-active': profileDetailActive }"
        >
          <section class="profile-list-surface memory-surface">
            <div class="workspace-head">
              <div class="workspace-head-title-select">
                <select
                  v-model="graphView"
                  class="view-select"
                >
                  <option value="observations">
                    Facts ({{ graphObservations.length }})
                  </option>
                  <option value="relations">
                    Connections ({{ graphRelations.length }})
                  </option>
                  <option value="entities">
                    Entities ({{ graphEntities.length }})
                  </option>
                  <option value="duplicates">
                    Duplicates ({{ graphDuplicates.length }})
                  </option>
                </select>
              </div>
              <div class="toolbar-actions">
                <button
                  class="toolbar-action-btn"
                  type="button"
                  title="Create new record"
                  @click="newGraphRecord"
                >
                  <Plus :size="15" />
                </button>
                <button
                  class="toolbar-action-btn"
                  type="button"
                  title="Refresh"
                  :disabled="profileLoading"
                  @click="loadGraph"
                >
                  <RefreshCw
                    :size="14"
                    :class="{ spinning: profileLoading }"
                  />
                </button>
              </div>
            </div>
            <div class="list-search-bar">
              <Search
                :size="14"
                class="search-bar-icon"
              />
              <input
                v-model="graphSearch"
                class="search-bar-input"
                type="text"
                placeholder="Search profile..."
                spellcheck="false"
                @keydown.enter="loadGraph"
              >
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
                    <span class="confidence-badge">{{ memory.confidence.toFixed(2) }}</span>
                  </span>
                  <strong>{{ memory.text }}</strong>
                  <span class="profile-row-foot">{{ memory.kind }} · {{ memory.status }} · {{ formatMaybeDate(memory.updatedAt) }}</span>
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
                    <span class="confidence-badge">{{ relation.confidence.toFixed(2) }}</span>
                  </span>
                  <strong>{{ relation.relationType }}</strong>
                  <span class="profile-row-foot">{{ relation.text }}</span>
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
                    <span class="confidence-badge">{{ entity.confidence.toFixed(2) }}</span>
                  </span>
                  <strong>{{ entity.displayName }}</strong>
                  <span class="profile-row-foot">{{ entity.entityType }} · {{ formatMaybeDate(entity.updatedAt) }}</span>
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
                    <span class="confidence-badge">{{ duplicate.score.toFixed(2) }}</span>
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
              <button
                class="back-btn icon-btn"
                type="button"
                title="Back to list"
                @click="profileDetailActive = false"
              >
                <ArrowLeft :size="16" />
              </button>
              <span>
                <strong>{{ profileEditorTitle }}</strong>
                <small>{{ profileEditorSubtitle }}</small>
              </span>
            </div>
            <template v-if="graphView === 'entities'">
              <div class="editor-scroll-container">
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
                  <div class="advanced-wrapper">
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
                  </div>
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
              </div>
            </template>

            <template v-else-if="graphView === 'relations'">
              <div class="editor-scroll-container">
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
                  <div class="advanced-wrapper">
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
                  </div>
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
              </div>
            </template>

            <template v-else-if="graphView === 'duplicates'">
              <div class="editor-scroll-container">
                <div class="review-empty">
                  <strong>Possible duplicates are review-only here.</strong>
                  <span>Use Merge or Ignore from the review list. New facts are created from the Facts tab.</span>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="editor-scroll-container">
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
                  <div class="advanced-wrapper">
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
                  </div>
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
        <div
          class="notes-workspace memory-workspace"
          :class="{ 'detail-active': notesDetailActive }"
        >
          <section class="notes-list-surface memory-surface">
            <div class="workspace-head">
              <div class="workspace-head-title-select">
                <select
                  v-model="noteFilter"
                  class="view-select"
                >
                  <option value="all">
                    All notes ({{ noteCount('all') }})
                  </option>
                  <option value="ai">
                    AI notes ({{ noteCount('ai') }})
                  </option>
                  <option value="daily">
                    Daily captures ({{ noteCount('daily') }})
                  </option>
                  <option value="dreams">
                    Reflection reports ({{ noteCount('dreams') }})
                  </option>
                </select>
              </div>
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
              <button
                class="back-btn icon-btn"
                type="button"
                title="Back to list"
                @click="notesDetailActive = false"
              >
                <ArrowLeft :size="16" />
              </button>
              <span>
                <strong>{{ selectedFileDisplayTitle }}</strong>
                <small>{{ selectedFile.relativePath }}:{{ selectedFile.startLine }}-{{ selectedFile.endLine }}</small>
              </span>
                
              <div class="save-status-indicator">
                <span :class="['status-dot', selectedFileIsDirty ? 'dirty' : 'saved', { pulsing: savingFile }]" />
                <span>{{ selectedFileStatus }}</span>
              </div>

              <div class="notes-editor-tabs segmented">
                <button
                  :class="{ active: notesMode === 'edit' }"
                  type="button"
                  @click="notesMode = 'edit'"
                >
                  Edit
                </button>
                <button
                  :class="{ active: notesMode === 'preview' }"
                  type="button"
                  @click="notesMode = 'preview'"
                >
                  Preview
                </button>
              </div>

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

            <!-- Toggleable Editor / Preview Mode -->
            <div class="notes-viewer-body">
              <textarea
                v-if="notesMode === 'edit'"
                v-model="selectedFileText"
                class="memory-editor"
                spellcheck="true"
                placeholder="Start typing memory notes..."
              />
              <div
                v-else
                class="memory-preview-container md-body"
              >
                <StaticMarkdown :content="selectedFileText" />
              </div>
            </div>

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
        <div class="search-workspace memory-workspace">
          <section class="task-surface search-surface memory-surface">
            <div class="workspace-head borderless">
              <span class="workspace-head-title">Recall memory</span>
            </div>
            <form
              class="search-bar-form"
              @submit.prevent="runSearch"
            >
              <div class="search-bar-container">
                <Search
                  :size="14"
                  class="search-bar-icon"
                />
                <input
                  v-model="searchQuery"
                  class="search-bar-input"
                  type="text"
                  placeholder="Search memory..."
                  spellcheck="false"
                >
              </div>
            </form>
          </section>

          <section class="task-surface capture-surface memory-surface">
            <div class="workspace-head borderless">
              <span class="workspace-head-title">Append note</span>
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
          <div class="workspace-head borderless">
            <div class="workspace-head-title-select">
              <span class="workspace-head-title">Review: {{ searchStatusLabel }}</span>
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
              <span :class="['strength-badge', searchHitStrength(hit.score).tone]">
                {{ searchHitStrength(hit.score).label }}
              </span>
              <span class="result-meta">{{ searchHitMeta(hit) }}</span>
              <span class="result-content">{{ hit.content }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>
  </PageShell>
</template>

<script setup lang="ts">
import PageShell from '../common/PageShell.vue'
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
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  Info
} from 'lucide-vue-next'
import StaticMarkdown from '../chat/message/StaticMarkdown.vue'
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

const profileDetailActive = ref(false)
const notesDetailActive = ref(false)
const notesMode = ref<'edit' | 'preview'>('edit')
const autoSaveTimer = ref<NodeJS.Timeout | null>(null)

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
  () => graphView.value,
  () => {
    profileDetailActive.value = false
  }
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

function scheduleAutoSave() {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }
  autoSaveTimer.value = setTimeout(async () => {
    if (selectedFileIsDirty.value && !savingFile.value) {
      await saveSelectedFile()
    }
  }, 1500)
}

watch(
  () => selectedFileText.value,
  (newText) => {
    if (selectedFile.value && newText !== selectedFile.value.text) {
      scheduleAutoSave()
    }
  }
)

const diagnosticsOpen = ref(false)

const pathsInfo = computed(() => {
  const items = [
    { label: 'Root', value: overview.value?.root },
    { label: 'Memory Dir', value: overview.value?.memoryDir },
    { label: 'Profile', value: overview.value?.soulPath },
    { label: 'AI Notes', value: overview.value?.memoryPath },
    { label: 'Dreams', value: overview.value?.dreamsPath },
    { label: 'Today', value: overview.value?.todayPath },
    { label: 'Index DB', value: overview.value?.dbPath }
  ]
  return items.map(item => {
    const val = item.value || '...'
    const truncatedValue = val.length > 35 
      ? val.slice(0, 15) + '...' + val.slice(-20)
      : val
    return {
      label: item.label,
      value: val,
      truncatedValue
    }
  })
})

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

onMounted(async () => {
  await loadOverview()
})

onBeforeUnmount(() => {
  if (dreamingPollTimer) {
    window.clearTimeout(dreamingPollTimer)
    dreamingPollTimer = null
  }
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
    autoSaveTimer.value = null
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
  notesDetailActive.value = true
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
  profileDetailActive.value = true
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
  profileDetailActive.value = true
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
  profileDetailActive.value = true
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
  profileDetailActive.value = true
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

function searchHitStrength(score: number): { label: string; tone: string } {
  if (score > 0.8) return { label: 'Strong Match', tone: 'strong' }
  if (score > 0.5) return { label: 'Good Match', tone: 'good' }
  return { label: 'Match', tone: 'weak' }
}
</script>

<style scoped>
.memory-title-block {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.memory-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.2px;
}

.memory-state-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.state-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ui-status-success-fg, #10b981);
  font-weight: 600;
}

.state-indicator.off {
  color: var(--ui-text-muted-fg, var(--muted));
}

.state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.memory-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.icon-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Beautiful Rounded Capsule Segments */
.memory-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--ui-state-hover-bg, var(--hover));
  padding: 3px;
  border-radius: 8px;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  width: fit-content;
  align-self: flex-start;
  margin-top: 4px;
}

.memory-tab {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  padding: 0 14px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.memory-tab:hover:not(.active) {
  color: var(--ui-text-primary-fg, var(--text));
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4%, transparent);
}

.memory-tab.active {
  color: var(--ui-accent-primary-fg, var(--accent));
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 4px 8px rgba(0, 0, 0, 0.02);
}

/* Dropdown Selector styling */
.workspace-head-title-select {
  display: flex;
  align-items: center;
}

.view-select {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--ui-text-primary-fg, var(--text));
  background: transparent;
  border: none;
  padding-right: 20px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 11px;
}

.view-select:hover {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.workspace-head-title {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--ui-text-primary-fg, var(--text));
}

.workspace-head.borderless {
  border-bottom: none;
  padding-bottom: 4px;
}

/* Embedded List Search Bar */
.list-search-bar {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
}

.search-bar-icon {
  position: absolute;
  left: 20px;
  color: var(--ui-text-muted-fg, var(--muted));
  pointer-events: none;
}

.search-bar-input {
  width: 100%;
  height: 30px;
  padding: 0 10px 0 28px;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  border-radius: 6px;
  background: var(--ui-surface-input-bg, var(--bg-input));
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 11.5px;
  outline: none;
  transition: all 0.2s ease;
}

.search-bar-input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

/* Embedded Search Bar in Search Tab */
.search-bar-form {
  width: 100%;
}

.search-bar-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.search-bar-container .search-bar-icon {
  position: absolute;
  left: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
  pointer-events: none;
}

.search-bar-container .search-bar-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 32px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-input-bg, var(--bg-input));
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  outline: none;
  transition: all 0.2s ease;
}

.search-bar-container .search-bar-input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

/* Toolbar buttons */
.toolbar-action-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-action-btn:hover:not(:disabled) {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  color: var(--ui-accent-primary-fg, var(--accent));
  background: var(--ui-state-hover-bg, var(--hover));
}

.toolbar-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.loading-state {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  gap: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Overview Stack Layout */
.overview-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Premium Dashboard Widgets */
.memory-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 12px;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
}

.memory-hero-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-kicker {
  color: var(--ui-accent-primary-fg, var(--accent));
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.memory-hero-main strong {
  font-size: 20px;
  font-weight: 800;
  color: var(--ui-text-primary-fg, var(--text));
  line-height: 1.2;
}

.memory-hero-main span {
  font-size: 12px;
  color: var(--ui-text-secondary-fg, var(--muted));
  line-height: 1.45;
}

/* Stat Cards Grid */
.memory-hero-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.stat-dashboard-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.stat-card-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: transparent;
  transition: background-color 0.25s ease;
}

.stat-dashboard-card:hover {
  transform: translateY(-2px);
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
}

.stat-dashboard-card:hover .stat-card-glow {
  background: var(--ui-accent-primary-fg, var(--accent));
}

.stat-card-number {
  font-size: 24px;
  font-weight: 800;
  color: var(--ui-accent-primary-fg, var(--accent));
  line-height: 1.1;
}

.stat-card-label {
  font-size: 11px;
  font-weight: 550;
  color: var(--ui-text-secondary-fg, var(--muted));
}

/* Highlights Section */
.memory-highlights-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.section-subheader {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-subheader strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text-primary-fg);
}

.memory-hero-highlights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.memory-highlight-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 10px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  min-height: 120px;
}

.memory-highlight-card:hover {
  transform: translateY(-2px);
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
}

.highlight-tag {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--ui-accent-primary-fg, var(--accent));
  letter-spacing: 0.5px;
}

.highlight-title {
  font-size: 12px;
  font-weight: 650;
  color: var(--ui-text-primary-fg);
}

.highlight-body {
  font-size: 11px;
  line-height: 1.4;
  color: var(--ui-text-muted-fg, var(--muted));
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Activity Feed Timeline */
.memory-activity-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 12px;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
}

.padding-x {
  padding: 0 4px;
}

.activity-timeline {
  display: flex;
  flex-direction: column;
  position: relative;
}

.timeline-item-row {
  display: flex;
  gap: 16px;
}

.timeline-trail {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  position: relative;
  width: 12px;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg, var(--accent));
  margin-top: 18px;
  z-index: 2;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

.timeline-line {
  flex: 1;
  width: 2px;
  background: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 60%, transparent);
  z-index: 1;
}

.timeline-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.timeline-card:hover {
  border-color: var(--ui-border-default-border);
}

.timeline-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.timeline-card-title {
  font-size: 12px;
  font-weight: 650;
  color: var(--ui-text-primary-fg);
}

.timeline-card-time {
  font-size: 10px;
  color: var(--ui-text-muted-fg);
}

.timeline-card-body {
  font-size: 11px;
  line-height: 1.45;
  color: var(--ui-text-secondary-fg, var(--muted));
  margin: 0;
}

/* Collapsible Diagnostics Card */
.diagnostics-card {
  border-radius: 12px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border: 1px solid var(--ui-border-default-border, var(--border));
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.diagnostics-card.danger {
  border-color: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 30%, var(--ui-border-default-border));
}

.diagnostics-toggle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease;
}

.diagnostics-toggle-header:hover {
  background: color-mix(in srgb, var(--ui-text-primary-fg) 2%, transparent);
}

.diagnostics-summary-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diagnostics-summary-info span {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text-primary-fg);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.diagnostics-icon {
  color: var(--ui-text-muted-fg);
}

.diagnostics-summary-info small {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
}

.diagnostics-state-pill {
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-pill-text {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-text-muted-fg) 10%, transparent);
  color: var(--ui-text-muted-fg);
}

.danger .state-pill-text {
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 12%, transparent);
  color: var(--ui-status-danger-fg, #ef4444);
}

.chevron-icon {
  color: var(--ui-text-muted-fg);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.chevron-icon.rotated {
  transform: rotate(180deg);
}

.diagnostics-expanded-body {
  padding: 16px 18px;
  border-top: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Health Cards Widgets */
.health-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.health-card-widget {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  font-size: 11px;
}

.health-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg);
  margin-top: 4px;
}

.healthy .health-indicator-dot { background: var(--ui-status-success-fg, #10b981); }
.warning .health-indicator-dot { background: var(--ui-status-warning-fg, #f59e0b); }
.danger .health-indicator-dot { background: var(--ui-status-danger-fg, #ef4444); }

.health-card-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.health-card-title {
  font-weight: 700;
  color: var(--ui-text-primary-fg);
}

.health-card-detail {
  color: var(--ui-text-muted-fg);
  font-size: 10px;
}

.health-card-status {
  font-style: normal;
  font-weight: 600;
  font-size: 10px;
  color: var(--ui-text-secondary-fg);
}

/* Errors Area */
.diagnostic-errors-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inline-error-badge {
  padding: 8px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 18%, transparent);
  color: var(--ui-status-danger-fg, #ef4444);
  font-size: 11px;
}

.inline-error-badge span {
  font-weight: 700;
  margin-right: 4px;
}

/* Truncated Path Layout */
.path-grid-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--ui-surface-panel-bg);
  border: 1px solid var(--ui-border-subtle-border);
}

.path-info-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 12px;
}

.path-info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-secondary-fg);
}

.path-info-value-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg) 60%, transparent);
  border: 1px solid var(--ui-border-subtle-border);
  padding: 3px 8px;
  border-radius: 6px;
  min-width: 0;
}

.path-code-display {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-primary-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-copy-button {
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.path-copy-button:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

/* Shared Adaptiveness Workspace (Profile & Notes) */
.profile-layout,
.notes-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  gap: 0;
}

.notes-list-surface,
.profile-list-surface {
  flex: 0 0 35%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 250px;
  overflow: hidden;
  background: transparent;
  border-right: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
}

.profile-editor,
.viewer {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: transparent;
}

.editor-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-scroll-container label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-scroll-container label .setting-label {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.profile-advanced {
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg);
  overflow: hidden;
  margin: 8px 0;
  transition: all 0.2s ease;
}

.profile-advanced summary {
  padding: 10px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ui-text-primary-fg);
  background: color-mix(in srgb, var(--ui-surface-panel-bg) 96%, transparent);
  cursor: pointer;
  outline: none;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid transparent;
}

.profile-advanced summary::-webkit-details-marker {
  display: none;
}

.profile-advanced summary::after {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 18 15 12 9 6'></polyline></svg>");
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  transition: transform 0.2s ease;
}

.profile-advanced[open] summary::after {
  transform: rotate(90deg);
}

.profile-advanced[open] summary {
  border-bottom-color: var(--ui-border-subtle-border);
}

.advanced-wrapper {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--ui-state-hover-bg);
  border-radius: 6px;
  font-size: 11px;
}

.profile-id-row code {
  color: var(--ui-accent-primary-fg);
  font-family: var(--font-mono);
}

.action-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-border-subtle-border);
  flex-shrink: 0;
}

.workspace-head .back-btn {
  display: none; /* Hidden on wide splits */
}

/* Narrow Stacked layouts for Sidebars (Specifically targeting mode-side class) */
.mode-side :deep(.profile-layout),
.mode-side :deep(.notes-workspace) {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mode-side :deep(.notes-list-surface),
.mode-side :deep(.profile-list-surface) {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(0);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}

.mode-side :deep(.profile-editor),
.mode-side :deep(.viewer) {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

/* Active slide-in states */
.mode-side :deep(.detail-active .notes-list-surface),
.mode-side :deep(.detail-active .profile-list-surface) {
  transform: translateX(-20%);
}

.mode-side :deep(.detail-active .profile-editor),
.mode-side :deep(.detail-active .viewer) {
  transform: translateX(0);
}

/* Show Back button in stacked details drawer */
.mode-side :deep(.workspace-head .back-btn),
.mode-side :deep(.viewer-header .back-btn) {
  display: inline-flex;
  margin-right: 8px;
}

.viewer-header .back-btn {
  display: none;
}

/* File and Profile List Rows Styling */
.profile-list,
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row,
.profile-row {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 12px;
  background: transparent;
  color: var(--ui-text-primary-fg);
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.file-row:hover,
.profile-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-subtle-border, var(--border-subtle));
}

.file-row.active,
.profile-row.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 6%, var(--ui-surface-elevated-bg));
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.confidence-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent);
  color: var(--ui-accent-primary-fg);
}

.profile-row-foot {
  font-size: 10px;
  color: var(--ui-text-muted-fg);
}

/* Notes Editor tab toggle bar */
.notes-editor-tabs {
  margin: 0 8px;
}

/* Rich Preview for Markdown notes */
.notes-viewer-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-surface-panel-bg);
}

.memory-editor {
  flex: 1;
  width: 100%;
  padding: 16px;
  border: 0;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary-fg);
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
}

.memory-preview-container {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
  line-height: 1.6;
  font-size: 13px;
  color: var(--ui-text-primary-fg);
}

/* Auto-save pulse visual states */
.save-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  margin-left: auto;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg);
}

.status-dot.saved {
  background: var(--ui-status-success-fg, #10b981);
}

.status-dot.dirty {
  background: var(--ui-status-warning-fg, #f59e0b);
}

.status-dot.pulsing {
  animation: pulse-opacity 1s infinite alternate;
}

@keyframes pulse-opacity {
  from { opacity: 0.3; }
  to { opacity: 1; }
}

/* Search Tab Improvements */
.search-workspace {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.search-surface,
.capture-surface {
  padding: 16px;
  border-radius: 12px;
  background: var(--ui-surface-panel-bg);
  border: 1px solid var(--ui-border-default-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-surface:hover,
.capture-surface:hover {
  border-color: var(--ui-border-default-border);
}

.search-surface {
  flex: 1;
}

.capture-surface {
  flex: 1;
}

.section-head {
  margin-bottom: 12px;
}

.strength-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.strength-badge.strong {
  background: color-mix(in srgb, var(--ui-status-success-fg, #10b981) 12%, transparent);
  color: var(--ui-status-success-fg, #10b981);
}

.strength-badge.good {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.strength-badge.weak {
  background: color-mix(in srgb, var(--ui-text-muted-fg) 12%, transparent);
  color: var(--ui-text-muted-fg);
}

.memory-input,
.memory-select,
.memory-textarea {
  width: 100%;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-input-bg, var(--bg-input));
  color: var(--ui-text-primary-fg);
  font-size: 13px;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.memory-input {
  height: 36px;
  padding: 0 12px;
}

.memory-select {
  height: 36px;
  padding: 0 12px;
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px;
  padding-right: 32px;
  cursor: pointer;
}

.memory-textarea {
  min-height: 80px;
  padding: 10px 12px;
  resize: vertical;
}

.memory-input:focus,
.memory-select:focus,
.memory-textarea:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent);
}

.primary-btn {
  height: 36px;
  border-radius: 8px;
  background: var(--ui-action-primary-bg, var(--accent));
  color: var(--ui-action-primary-fg, white);
  border: none;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.secondary-action {
  height: 36px;
  border-radius: 8px;
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg);
  border: 1px solid var(--ui-border-default-border);
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.secondary-action:hover:not(:disabled) {
  background: var(--ui-state-active-bg);
}

.secondary-action.inline {
  width: auto;
}

.secondary-action.danger {
  color: var(--ui-status-danger-fg, #ef4444);
}

.secondary-action.danger:hover {
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 12%, transparent);
  border-color: var(--ui-status-danger-fg, #ef4444);
}

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.segmented {
  display: flex;
  background: var(--ui-state-hover-bg, var(--hover));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  padding: 2px;
  border-radius: 6px;
  width: fit-content;
}

.segmented button {
  min-height: 24px;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s ease;
}

.segmented button.active {
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.text-btn {
  height: 28px;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  border: 1px solid transparent;
  padding: 0 8px;
  font-size: 11.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.text-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.text-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--ui-text-primary-fg, var(--text));
  line-height: 1.4;
}

.file-meta {
  font-size: 10.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  margin: 2px 0 4px;
}

.file-preview {
  font-size: 11px;
  line-height: 1.4;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-date {
  font-size: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  align-self: flex-start;
  margin-top: 2px;
}

/* Adaptiveness overrides for wide vs narrow viewports */
@media (max-width: 1024px) {
  .memory-hero-stats,
  .memory-hero-highlights {
    grid-template-columns: 1fr;
  }
  .health-cards {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .search-workspace {
    flex-direction: column;
  }
  .health-cards {
    grid-template-columns: 1fr;
  }
  .profile-layout,
  .notes-workspace {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .notes-list-surface,
  .profile-list-surface {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }
  .profile-editor,
  .viewer {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
    background: var(--ui-surface-panel-bg, var(--bg-panel));
  }
  .detail-active .notes-list-surface,
  .detail-active .profile-list-surface {
    transform: translateX(-20%);
  }
  .detail-active .profile-editor,
  .detail-active .viewer {
    transform: translateX(0);
  }
  .workspace-head .back-btn,
  .viewer-header .back-btn {
    display: inline-flex;
    margin-right: 8px;
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
