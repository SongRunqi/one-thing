<template>
  <div class="mcp-settings">
    <!-- Global MCP Toggle -->
    <section class="settings-section">
      <h3 class="section-title">MCP Settings</h3>

      <div class="form-group">
        <div class="toggle-row">
          <label class="form-label">Enable MCP</label>
          <label class="toggle">
            <input
              type="checkbox"
              v-model="localMCPEnabled"
              @change="handleEnableChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="form-hint">Enable Model Context Protocol to connect to external tool servers</p>
      </div>
    </section>

    <!-- Server List -->
    <section class="settings-section" v-if="localMCPEnabled">
      <div class="section-header">
        <h3 class="section-title">MCP Servers</h3>
        <div class="header-actions">
          <button class="import-btn" @click="openImportDialog" title="Import servers">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
          <button class="add-server-btn" @click="openAddServerDialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add Server
          </button>
        </div>
      </div>

      <div v-if="servers.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>No MCP servers configured</p>
        <p class="hint">Add a server to connect to external tools</p>
      </div>

      <div v-else class="servers-list">
        <div
          v-for="server in servers"
          :key="server.config.id"
          :class="['server-item', { expanded: expandedServers.has(server.config.id) }]"
        >
          <div class="server-header" @click="toggleServerExpanded(server.config.id)">
            <div class="server-info">
              <div class="server-status" :class="server.status" :title="getStatusText(server.status)">
                <div class="status-dot"></div>
              </div>
              <div class="server-details">
                <div class="server-name">{{ server.config.name }}</div>
                <div class="server-meta">
                  <span class="transport-badge" :class="server.config.transport">
                    {{ server.config.transport.toUpperCase() }}
                  </span>
                  <span v-if="server.status === 'connected'" class="capability-count">
                    {{ server.tools.length }} tools
                  </span>
                </div>
              </div>
            </div>
            <div class="server-actions">
              <label class="toggle small" @click.stop title="Enable/Disable server">
                <input
                  type="checkbox"
                  :checked="server.config.enabled"
                  @change="toggleServerEnabled(server.config.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
              <button
                class="icon-btn small"
                :class="{ spinning: connectingServers.has(server.config.id) }"
                @click.stop="handleConnectToggle(server)"
                :title="server.status === 'connected' ? 'Disconnect' : 'Connect'"
                :disabled="!server.config.enabled || connectingServers.has(server.config.id)"
              >
                <svg v-if="server.status === 'connected'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18.36 6.64a9 9 0 11-12.73 0"/>
                  <line x1="12" y1="2" x2="12" y2="12"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12.55a11 11 0 0114.08 0"/>
                  <path d="M1.42 9a16 16 0 0121.16 0"/>
                  <path d="M8.53 16.11a6 6 0 016.95 0"/>
                  <circle cx="12" cy="20" r="1"/>
                </svg>
              </button>
              <button
                class="icon-btn small"
                @click.stop="openEditServerDialog(server.config)"
                title="Edit server"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                class="icon-btn small danger"
                @click.stop="confirmDeleteServer(server.config.id)"
                title="Delete server"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
              <svg
                class="expand-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          <!-- Expanded Content -->
          <div v-if="expandedServers.has(server.config.id)" class="server-expanded">
            <!-- Error Message -->
            <div v-if="server.error" class="server-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{{ server.error }}</span>
            </div>

            <!-- Connection Info -->
            <div class="connection-info">
              <div v-if="server.config.transport === 'stdio'" class="info-row">
                <span class="info-label">Command:</span>
                <code class="info-value">{{ server.config.command }} {{ (server.config.args || []).join(' ') }}</code>
              </div>
              <div v-else class="info-row">
                <span class="info-label">URL:</span>
                <code class="info-value">{{ server.config.url }}</code>
              </div>
              <div v-if="server.connectedAt" class="info-row">
                <span class="info-label">Connected:</span>
                <span class="info-value">{{ formatTime(server.connectedAt) }}</span>
              </div>
            </div>

            <!-- Tools List -->
            <div v-if="server.tools.length > 0" class="capabilities-section">
              <div class="capabilities-header">
                <span class="capabilities-title">Tools ({{ server.tools.length }})</span>
              </div>
              <div class="tools-list">
                <div v-for="tool in server.tools" :key="tool.name" class="tool-item">
                  <span class="tool-name">{{ tool.name }}</span>
                  <span v-if="tool.description" class="tool-desc">{{ tool.description }}</span>
                </div>
              </div>
            </div>

            <!-- Resources List -->
            <div v-if="server.resources.length > 0" class="capabilities-section">
              <div class="capabilities-header">
                <span class="capabilities-title">Resources ({{ server.resources.length }})</span>
              </div>
              <div class="resources-list">
                <div v-for="resource in server.resources" :key="resource.uri" class="resource-item">
                  <span class="resource-name">{{ resource.name }}</span>
                  <span class="resource-uri">{{ resource.uri }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Add/Edit Server Dialog -->
    <Teleport to="body">
      <div v-if="showServerDialog" class="dialog-overlay" @click.self="closeServerDialog">
        <div class="dialog">
          <div class="dialog-header">
            <h3>{{ editingServer ? 'Edit Server' : 'Add MCP Server' }}</h3>
            <button class="close-btn" @click="closeServerDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="dialog-content">
            <div class="form-group">
              <label class="form-label">Server Name</label>
              <input
                v-model="serverForm.name"
                type="text"
                class="form-input"
                placeholder="My MCP Server"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Transport Type</label>
              <div class="transport-selector">
                <button
                  :class="['transport-option', { active: serverForm.transport === 'stdio' }]"
                  @click="serverForm.transport = 'stdio'"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <line x1="9" y1="1" x2="9" y2="4"/>
                    <line x1="15" y1="1" x2="15" y2="4"/>
                    <line x1="9" y1="20" x2="9" y2="23"/>
                    <line x1="15" y1="20" x2="15" y2="23"/>
                  </svg>
                  <span>Stdio</span>
                  <span class="transport-desc">Local process</span>
                </button>
                <button
                  :class="['transport-option', { active: serverForm.transport === 'sse' }]"
                  @click="serverForm.transport = 'sse'"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                  </svg>
                  <span>SSE</span>
                  <span class="transport-desc">HTTP endpoint</span>
                </button>
              </div>
            </div>

            <!-- Stdio Configuration -->
            <template v-if="serverForm.transport === 'stdio'">
              <div class="form-group">
                <label class="form-label">Command</label>
                <input
                  v-model="serverForm.command"
                  type="text"
                  class="form-input"
                  placeholder="npx, python, node..."
                />
              </div>
              <div class="form-group">
                <label class="form-label">Arguments</label>
                <input
                  v-model="serverForm.argsString"
                  type="text"
                  class="form-input"
                  placeholder="-y @modelcontextprotocol/server-everything"
                />
                <p class="form-hint">Space-separated arguments</p>
              </div>
              <div class="form-group">
                <label class="form-label">Working Directory (optional)</label>
                <input
                  v-model="serverForm.cwd"
                  type="text"
                  class="form-input"
                  placeholder="/path/to/working/dir"
                />
              </div>
            </template>

            <!-- SSE Configuration -->
            <template v-else>
              <div class="form-group">
                <label class="form-label">Server URL</label>
                <input
                  v-model="serverForm.url"
                  type="text"
                  class="form-input"
                  placeholder="http://localhost:3000/sse"
                />
              </div>
            </template>

            <div v-if="serverDialogError" class="error-message">
              {{ serverDialogError }}
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn secondary" @click="closeServerDialog">Cancel</button>
            <button class="btn primary" @click="saveServer" :disabled="isSavingServer">
              {{ isSavingServer ? 'Saving...' : (editingServer ? 'Save Changes' : 'Add Server') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="dialog small">
          <div class="dialog-header">
            <h3>Delete Server</h3>
          </div>
          <div class="dialog-content">
            <p>Are you sure you want to delete this MCP server? This action cannot be undone.</p>
          </div>
          <div class="dialog-footer">
            <button class="btn secondary" @click="showDeleteDialog = false">Cancel</button>
            <button class="btn danger" @click="deleteServer">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Import Servers Dialog -->
    <Teleport to="body">
      <div v-if="showImportDialog" class="dialog-overlay" @click.self="closeImportDialog">
        <div class="dialog import-dialog">
          <div class="dialog-header">
            <h3>Import MCP Servers</h3>
            <button class="close-btn" @click="closeImportDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="dialog-content import-content">
            <!-- Tab selector -->
            <div class="import-tabs">
              <button
                :class="['import-tab', { active: importTab === 'file' }]"
                @click="switchImportTab('file')"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                  <polyline points="13 2 13 9 20 9"/>
                </svg>
                From File
              </button>
              <button
                :class="['import-tab', { active: importTab === 'paste' }]"
                @click="switchImportTab('paste')"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                </svg>
                Quick Paste
              </button>
              <button
                :class="['import-tab', { active: importTab === 'presets' }]"
                @click="switchImportTab('presets')"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Presets
              </button>
            </div>

            <!-- File Import Tab -->
            <div v-if="importTab === 'file'" class="import-tab-content">
              <p class="import-description">
                Import MCP configurations from a JSON file. Supports Claude Desktop format.
              </p>
              <button class="select-file-btn" @click="selectImportFile">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                Select JSON File
              </button>
              <div v-if="importFileInfo" class="file-info">
                <span class="file-name">{{ importFileInfo.name }}</span>
                <span class="server-count">{{ importFileInfo.serverCount }} server(s) found</span>
              </div>
            </div>

            <!-- Quick Paste Tab -->
            <div v-if="importTab === 'paste'" class="import-tab-content">
              <p class="import-description">
                Paste a JSON configuration or command line to add a server.
              </p>
              <textarea
                v-model="pasteContent"
                class="form-textarea"
                placeholder='Paste JSON config or command line:

{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]}

or:

npx -y @modelcontextprotocol/server-filesystem /path'
                rows="6"
                @input="parsePasteContent"
              ></textarea>
              <div v-if="pasteParseResult" class="parse-result">
                <div v-if="pasteParseResult.success" class="parse-success">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>{{ pasteParseResult.type }}</span>
                </div>
                <div v-else class="parse-error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>{{ pasteParseResult.error }}</span>
                </div>
              </div>
            </div>

            <!-- Presets Tab -->
            <div v-if="importTab === 'presets'" class="import-tab-content">
              <p class="import-description">
                Choose from popular MCP servers to quickly get started.
              </p>

              <!-- Category filter -->
              <div class="preset-categories">
                <button
                  v-for="cat in presetCategories"
                  :key="cat.id"
                  :class="['category-btn', { active: selectedCategory === cat.id }]"
                  @click="selectedCategory = cat.id"
                >
                  {{ cat.name }}
                </button>
              </div>

              <!-- Presets grid -->
              <div class="presets-grid">
                <div
                  v-for="preset in filteredPresets"
                  :key="preset.id"
                  :class="['preset-card', { selected: selectedPreset?.id === preset.id }]"
                  @click="selectPreset(preset)"
                >
                  <div class="preset-icon">
                    <svg v-if="preset.icon === 'folder'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'github'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'globe'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'database'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <ellipse cx="12" cy="5" rx="9" ry="3"/>
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'search'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'download'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'brain'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2a4 4 0 014 4c0 1.1-.9 2-2 2h-4a2 2 0 01-2-2 4 4 0 014-4z"/>
                      <path d="M20 12c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <svg v-else-if="preset.icon === 'lightbulb'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 18h6"/>
                      <path d="M10 22h4"/>
                      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>
                    </svg>
                    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </div>
                  <div class="preset-info">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-desc">{{ preset.description }}</span>
                  </div>
                  <svg v-if="selectedPreset?.id === preset.id" class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>

              <!-- Parameter configuration -->
              <div v-if="selectedPreset && selectedPreset.parameters && selectedPreset.parameters.length > 0" class="preset-params">
                <h4>Configuration</h4>
                <div
                  v-for="param in selectedPreset.parameters"
                  :key="param.key"
                  class="form-group"
                >
                  <label class="form-label">
                    {{ param.name }}
                    <span v-if="param.required" class="required">*</span>
                  </label>
                  <div v-if="param.type === 'path'" class="path-input-group">
                    <input
                      v-model="presetParams[param.key]"
                      type="text"
                      class="form-input"
                      :placeholder="param.placeholder"
                      @input="updatePresetServer"
                    />
                    <button class="browse-btn" @click="browseForPath(param.key)">
                      Browse
                    </button>
                  </div>
                  <input
                    v-else
                    v-model="presetParams[param.key]"
                    :type="param.isEnvVar ? 'password' : 'text'"
                    class="form-input"
                    :placeholder="param.placeholder"
                    @input="updatePresetServer"
                  />
                </div>
              </div>
            </div>

            <!-- Preview of servers to import -->
            <div v-if="serversToImport.length > 0" class="import-preview">
              <h4>Servers to Import ({{ serversToImport.length }})</h4>
              <div class="preview-list">
                <div
                  v-for="(server, index) in serversToImport"
                  :key="index"
                  :class="['preview-item', { selected: selectedServers.has(index) }]"
                  @click="toggleServerSelection(index)"
                >
                  <input type="checkbox" :checked="selectedServers.has(index)" @click.stop />
                  <div class="preview-info">
                    <span class="preview-name">{{ server.name }}</span>
                    <span class="preview-command">{{ getServerSummary(server) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="importError" class="error-message">
              {{ importError }}
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn secondary" @click="closeImportDialog">Cancel</button>
            <button
              class="btn primary"
              @click="importSelectedServers"
              :disabled="selectedServers.size === 0 || isImporting"
            >
              {{ isImporting ? 'Importing...' : `Import ${selectedServers.size} Server(s)` }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { MCPServerConfig, MCPServerState, MCPSettings } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { MCP_PRESETS, PRESET_CATEGORIES, type MCPPreset, type PresetCategory } from '@/data/mcpPresets'

interface Props {
  settings: MCPSettings
}

interface Emits {
  (e: 'update:settings', value: MCPSettings): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Local state
const localMCPEnabled = ref(props.settings?.enabled ?? true)
const servers = ref<MCPServerState[]>([])
const expandedServers = ref<Set<string>>(new Set())
const connectingServers = ref<Set<string>>(new Set())

// Dialog state
const showServerDialog = ref(false)
const showDeleteDialog = ref(false)
const editingServer = ref<MCPServerConfig | null>(null)
const deletingServerId = ref<string | null>(null)
const serverDialogError = ref('')
const isSavingServer = ref(false)

// Server form
const serverForm = ref({
  name: '',
  transport: 'stdio' as 'stdio' | 'sse',
  command: '',
  argsString: '',
  cwd: '',
  url: '',
})

// Import dialog state
const showImportDialog = ref(false)
const importTab = ref<'file' | 'paste' | 'presets'>('file')
const importError = ref('')
const isImporting = ref(false)
const importFileInfo = ref<{ name: string; serverCount: number } | null>(null)
const serversToImport = ref<MCPServerConfig[]>([])
const selectedServers = ref<Set<number>>(new Set())

// Paste tab state
const pasteContent = ref('')
const pasteParseResult = ref<{ success: boolean; type?: string; error?: string } | null>(null)

// Presets tab state
const selectedCategory = ref<PresetCategory>('all')
const selectedPreset = ref<MCPPreset | null>(null)
const presetParams = ref<Record<string, string>>({})
const presetCategories = PRESET_CATEGORIES

// Computed: filtered presets by category
const filteredPresets = computed(() => {
  if (selectedCategory.value === 'all') {
    return MCP_PRESETS
  }
  return MCP_PRESETS.filter(p => p.category === selectedCategory.value)
})

// Watch for settings changes
watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    localMCPEnabled.value = newSettings.enabled
  }
}, { deep: true })

// Load servers on mount
onMounted(async () => {
  await loadServers()
})

async function loadServers() {
  try {
    const response = await window.electronAPI.mcpGetServers()
    if (response.success && response.servers) {
      servers.value = response.servers
    }
  } catch (error) {
    console.error('Failed to load MCP servers:', error)
  }
}

function handleEnableChange() {
  emit('update:settings', {
    ...props.settings,
    enabled: localMCPEnabled.value,
  })
}

function getStatusText(status: string): string {
  switch (status) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'disconnected': return 'Disconnected'
    case 'error': return 'Error'
    default: return status
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function toggleServerExpanded(serverId: string) {
  if (expandedServers.value.has(serverId)) {
    expandedServers.value.delete(serverId)
  } else {
    expandedServers.value.add(serverId)
  }
  expandedServers.value = new Set(expandedServers.value)
}

async function toggleServerEnabled(serverId: string, enabled: boolean) {
  const server = servers.value.find(s => s.config.id === serverId)
  if (!server) return

  const updatedConfig = { ...server.config, enabled }
  try {
    const response = await window.electronAPI.mcpUpdateServer(updatedConfig)
    if (response.success) {
      await loadServers()
      // Update parent settings
      const updatedServers = props.settings.servers.map(s =>
        s.id === serverId ? updatedConfig : s
      )
      emit('update:settings', {
        ...props.settings,
        servers: updatedServers,
      })
    }
  } catch (error) {
    console.error('Failed to toggle server:', error)
  }
}

async function handleConnectToggle(server: MCPServerState) {
  const serverId = server.config.id
  connectingServers.value.add(serverId)

  try {
    if (server.status === 'connected') {
      await window.electronAPI.mcpDisconnectServer(serverId)
    } else {
      await window.electronAPI.mcpConnectServer(serverId)
    }
    await loadServers()
  } catch (error) {
    console.error('Failed to toggle connection:', error)
  } finally {
    connectingServers.value.delete(serverId)
  }
}

function openAddServerDialog() {
  editingServer.value = null
  serverDialogError.value = ''
  serverForm.value = {
    name: '',
    transport: 'stdio',
    command: '',
    argsString: '',
    cwd: '',
    url: '',
  }
  showServerDialog.value = true
}

function openEditServerDialog(config: MCPServerConfig) {
  editingServer.value = config
  serverDialogError.value = ''
  serverForm.value = {
    name: config.name,
    transport: config.transport,
    command: config.command || '',
    argsString: (config.args || []).join(' '),
    cwd: config.cwd || '',
    url: config.url || '',
  }
  showServerDialog.value = true
}

function closeServerDialog() {
  showServerDialog.value = false
  editingServer.value = null
  serverDialogError.value = ''
}

async function saveServer() {
  // Validate
  if (!serverForm.value.name.trim()) {
    serverDialogError.value = 'Server name is required'
    return
  }

  if (serverForm.value.transport === 'stdio') {
    if (!serverForm.value.command.trim()) {
      serverDialogError.value = 'Command is required'
      return
    }
  } else {
    if (!serverForm.value.url.trim()) {
      serverDialogError.value = 'Server URL is required'
      return
    }
  }

  isSavingServer.value = true
  serverDialogError.value = ''

  try {
    const config: MCPServerConfig = {
      id: editingServer.value?.id || uuidv4(),
      name: serverForm.value.name.trim(),
      transport: serverForm.value.transport,
      enabled: editingServer.value?.enabled ?? true,
    }

    if (serverForm.value.transport === 'stdio') {
      config.command = serverForm.value.command.trim()
      config.args = serverForm.value.argsString.trim().split(/\s+/).filter(Boolean)
      if (serverForm.value.cwd.trim()) {
        config.cwd = serverForm.value.cwd.trim()
      }
    } else {
      config.url = serverForm.value.url.trim()
    }

    let response
    if (editingServer.value) {
      response = await window.electronAPI.mcpUpdateServer(config)
    } else {
      response = await window.electronAPI.mcpAddServer(config)
    }

    if (response.success) {
      await loadServers()
      // Update parent settings
      const existingServers = props.settings.servers || []
      const updatedServers = editingServer.value
        ? existingServers.map(s => s.id === config.id ? config : s)
        : [...existingServers, config]
      emit('update:settings', {
        ...props.settings,
        servers: updatedServers,
      })
      closeServerDialog()
    } else {
      serverDialogError.value = response.error || 'Failed to save server'
    }
  } catch (error: any) {
    serverDialogError.value = error.message || 'Failed to save server'
  } finally {
    isSavingServer.value = false
  }
}

function confirmDeleteServer(serverId: string) {
  deletingServerId.value = serverId
  showDeleteDialog.value = true
}

async function deleteServer() {
  if (!deletingServerId.value) return

  try {
    const response = await window.electronAPI.mcpRemoveServer(deletingServerId.value)
    if (response.success) {
      await loadServers()
      // Update parent settings
      const updatedServers = props.settings.servers.filter(s => s.id !== deletingServerId.value)
      emit('update:settings', {
        ...props.settings,
        servers: updatedServers,
      })
    }
  } catch (error) {
    console.error('Failed to delete server:', error)
  } finally {
    showDeleteDialog.value = false
    deletingServerId.value = null
  }
}

// ==================== Import Functions ====================

function openImportDialog() {
  showImportDialog.value = true
  importTab.value = 'file'
  importError.value = ''
  serversToImport.value = []
  selectedServers.value = new Set()
  importFileInfo.value = null
  pasteContent.value = ''
  pasteParseResult.value = null
  selectedPreset.value = null
  presetParams.value = {}
}

function closeImportDialog() {
  showImportDialog.value = false
  importError.value = ''
  serversToImport.value = []
  selectedServers.value = new Set()
  importFileInfo.value = null
  pasteContent.value = ''
  pasteParseResult.value = null
  selectedPreset.value = null
  presetParams.value = {}
}

function switchImportTab(tab: 'file' | 'paste' | 'presets') {
  importTab.value = tab
  serversToImport.value = []
  selectedServers.value = new Set()
  importError.value = ''
  if (tab === 'file') {
    importFileInfo.value = null
  } else if (tab === 'paste') {
    pasteContent.value = ''
    pasteParseResult.value = null
  } else {
    selectedPreset.value = null
    presetParams.value = {}
  }
}

async function selectImportFile() {
  try {
    const result = await window.electronAPI.showOpenDialog({
      title: 'Select MCP Configuration File',
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) return

    const filePath = result.filePaths[0]
    const response = await window.electronAPI.mcpReadConfigFile(filePath)

    if (!response.success) {
      importError.value = response.error || 'Failed to read file'
      return
    }

    const servers = parseConfigFile(response.content)
    serversToImport.value = servers
    selectedServers.value = new Set(servers.map((_, i) => i))
    importFileInfo.value = {
      name: filePath.split('/').pop() || 'config.json',
      serverCount: servers.length,
    }
    importError.value = ''
  } catch (error: any) {
    importError.value = error.message || 'Failed to select file'
  }
}

function parseConfigFile(content: any): MCPServerConfig[] {
  const servers: MCPServerConfig[] = []

  // Format 1: Claude Desktop format { mcpServers: { name: config } }
  if (content.mcpServers && typeof content.mcpServers === 'object') {
    for (const [name, config] of Object.entries(content.mcpServers)) {
      servers.push(parseServerEntry(name, config as any))
    }
    return servers
  }

  // Format 2: Direct array of configs [{ name, command, args }]
  if (Array.isArray(content)) {
    for (const config of content) {
      if (config.name || config.command || config.url) {
        servers.push(parseServerEntry(config.name || 'Imported Server', config))
      }
    }
    return servers
  }

  // Format 3: Single server object { command, args }
  if (content.command || content.url) {
    servers.push(parseServerEntry('Imported Server', content))
    return servers
  }

  throw new Error('Unrecognized configuration format')
}

function parseServerEntry(name: string, config: any): MCPServerConfig {
  const isSSE = !!config.url && !config.command

  const server: MCPServerConfig = {
    id: uuidv4(),
    name: name,
    transport: isSSE ? 'sse' : 'stdio',
    enabled: true,
  }

  // Only add properties that have values (avoid undefined)
  if (config.command) server.command = config.command
  if (config.args && config.args.length > 0) server.args = config.args
  if (config.env && Object.keys(config.env).length > 0) server.env = config.env
  if (config.cwd) server.cwd = config.cwd
  if (config.url) server.url = config.url
  if (config.headers && Object.keys(config.headers).length > 0) server.headers = config.headers

  return server
}

function parsePasteContent() {
  const content = pasteContent.value.trim()
  if (!content) {
    pasteParseResult.value = null
    serversToImport.value = []
    selectedServers.value = new Set()
    return
  }

  try {
    // Try parsing as JSON first
    if (content.startsWith('{') || content.startsWith('[')) {
      const parsed = JSON.parse(content)
      const servers = parseConfigFile(parsed)
      serversToImport.value = servers
      selectedServers.value = new Set(servers.map((_, i) => i))
      pasteParseResult.value = {
        success: true,
        type: `JSON configuration (${servers.length} server${servers.length > 1 ? 's' : ''})`,
      }
      return
    }

    // Try parsing as command line
    const server = parseCommandLine(content)
    if (server) {
      serversToImport.value = [server]
      selectedServers.value = new Set([0])
      pasteParseResult.value = {
        success: true,
        type: `Command line: ${server.command}`,
      }
      return
    }

    throw new Error('Could not parse as JSON or command line')
  } catch (error: any) {
    pasteParseResult.value = { success: false, error: error.message }
    serversToImport.value = []
    selectedServers.value = new Set()
  }
}

function parseCommandLine(input: string): MCPServerConfig | null {
  const parts = parseCommandParts(input)
  if (parts.length === 0) return null

  const command = parts[0]
  const args = parts.slice(1)

  // Validate it looks like a command
  const validCommands = ['npx', 'node', 'python', 'python3', 'uvx', 'docker', 'deno', 'bun']
  const isAbsolutePath = command.startsWith('/') || command.startsWith('./')

  if (!validCommands.includes(command) && !isAbsolutePath) {
    return null
  }

  // Try to extract a name from the args
  let name = 'Imported Server'
  const packageArg = args.find(a => a.startsWith('@') || a.includes('server') || a.includes('mcp'))
  if (packageArg) {
    // Get the package name part after the last /
    let extracted = packageArg.split('/').pop() || ''
    // Remove common prefixes and suffixes
    extracted = extracted
      .replace(/^(server-|mcp-)/i, '')  // Remove prefix
      .replace(/(-server|-mcp)$/i, '')   // Remove suffix
      .replace(/-/g, ' ')                // Replace dashes with spaces
    // Capitalize each word
    name = extracted
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    // Fallback if empty
    if (!name.trim()) name = 'Imported Server'
  }

  const server: MCPServerConfig = {
    id: uuidv4(),
    name,
    transport: 'stdio',
    enabled: true,
    command,
  }

  if (args.length > 0) server.args = args

  return server
}

function parseCommandParts(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''

  for (const char of input) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true
      quoteChar = char
    } else if (char === quoteChar && inQuote) {
      inQuote = false
      quoteChar = ''
    } else if (char === ' ' && !inQuote) {
      if (current) {
        parts.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) parts.push(current)
  return parts
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function selectPreset(preset: MCPPreset) {
  selectedPreset.value = preset
  presetParams.value = {}

  // Set default values
  if (preset.parameters) {
    for (const param of preset.parameters) {
      if (param.default) {
        presetParams.value[param.key] = param.default
      }
    }
  }

  // Build server config from preset
  updatePresetServer()
}

function updatePresetServer() {
  if (!selectedPreset.value) return

  const preset = selectedPreset.value
  let args = preset.config.args ? [...preset.config.args] : []

  // Replace placeholders in args
  args = args.map(arg => {
    const match = arg.match(/\{(\w+)\}/)
    if (match) {
      const key = match[1]
      return presetParams.value[key] || arg
    }
    return arg
  })

  // Build env from parameters that look like env vars
  const env: Record<string, string> = {}
  if (preset.parameters) {
    for (const param of preset.parameters) {
      if (param.isEnvVar && presetParams.value[param.key]) {
        env[param.key] = presetParams.value[param.key]
      }
    }
  }

  const server: MCPServerConfig = {
    id: uuidv4(),
    name: preset.name,
    transport: preset.config.transport,
    enabled: true,
  }

  // Only add properties that have values (avoid undefined)
  if (preset.config.command) server.command = preset.config.command
  if (args.length > 0) server.args = args
  if (preset.config.url) server.url = preset.config.url
  if (Object.keys(env).length > 0) server.env = env

  serversToImport.value = [server]
  selectedServers.value = new Set([0])
}

async function browseForPath(paramKey: string) {
  const result = await window.electronAPI.showOpenDialog({
    title: 'Select Path',
    properties: ['openDirectory'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    presetParams.value[paramKey] = result.filePaths[0]
    updatePresetServer()
  }
}

function toggleServerSelection(index: number) {
  if (selectedServers.value.has(index)) {
    selectedServers.value.delete(index)
  } else {
    selectedServers.value.add(index)
  }
  selectedServers.value = new Set(selectedServers.value)
}

function getServerSummary(server: MCPServerConfig): string {
  if (server.transport === 'sse') {
    return server.url || ''
  }
  return `${server.command} ${(server.args || []).join(' ')}`
}

async function importSelectedServers() {
  isImporting.value = true
  importError.value = ''

  const toImport = serversToImport.value.filter((_, i) => selectedServers.value.has(i))
  let successCount = 0
  const errors: string[] = []

  for (const server of toImport) {
    try {
      // Create a clean copy to avoid IPC serialization issues
      const cleanServer = JSON.parse(JSON.stringify(server))
      const response = await window.electronAPI.mcpAddServer(cleanServer)
      if (response.success) {
        successCount++
      } else {
        errors.push(`${server.name}: ${response.error}`)
      }
    } catch (error: any) {
      errors.push(`${server.name}: ${error.message}`)
    }
  }

  await loadServers()

  // Update parent settings
  const existingServers = props.settings.servers || []
  const importedServers = toImport.filter((_, i) => {
    const originalIndex = [...selectedServers.value][i]
    return !errors.some(e => e.startsWith(serversToImport.value[originalIndex]?.name))
  })
  emit('update:settings', {
    ...props.settings,
    servers: [...existingServers, ...importedServers],
  })

  if (errors.length > 0) {
    importError.value = `Imported ${successCount}/${toImport.length}. Errors: ${errors.join('; ')}`
  } else {
    closeImportDialog()
  }

  isImporting.value = false
}
</script>

<style scoped>
.mcp-settings {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.section-header .section-title {
  margin-bottom: 0;
}

.add-server-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--accent);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-server-btn:hover {
  background: #2563eb;
}

/* Toggle styles */
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle.small {
  width: 36px;
  height: 20px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(120, 120, 128, 0.32);
  border-radius: 12px;
  transition: 0.2s;
}

.toggle.small .toggle-slider {
  border-radius: 10px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle.small .toggle-slider:before {
  height: 16px;
  width: 16px;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle.small input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--panel-2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.empty-state svg {
  color: var(--text-muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.empty-state .hint {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Server list */
.servers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.server-item {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.server-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.server-item.expanded {
  border-color: var(--accent);
}

.server-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.server-status {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-muted);
}

.server-status.connected .status-dot {
  background: #22c55e;
}

.server-status.connecting .status-dot {
  background: #f59e0b;
  animation: pulse 1s ease-in-out infinite;
}

.server-status.error .status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.server-details {
  min-width: 0;
}

.server-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.transport-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(120, 120, 128, 0.2);
  color: var(--text-muted);
}

.transport-badge.stdio {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.transport-badge.sse {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.capability-count {
  font-size: 12px;
  color: var(--text-muted);
}

.server-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn.small {
  width: 28px;
  height: 28px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text-primary);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.icon-btn.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.expand-chevron {
  transition: transform 0.2s ease;
  color: var(--text-muted);
}

.server-item.expanded .expand-chevron {
  transform: rotate(180deg);
}

/* Expanded content */
.server-expanded {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  margin-top: -1px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.server-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  margin-top: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
}

.server-error svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.connection-info {
  margin-top: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: 8px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
  width: 80px;
}

.info-value {
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}

code.info-value {
  font-family: 'SF Mono', 'Monaco', monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Capabilities sections */
.capabilities-section {
  margin-top: 16px;
}

.capabilities-header {
  margin-bottom: 8px;
}

.capabilities-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tools-list,
.resources-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-item,
.resource-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  background: var(--hover);
  border-radius: 6px;
}

.tool-name,
.resource-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.tool-desc,
.resource-uri {
  font-size: 12px;
  color: var(--text-muted);
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

.dialog {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s ease;
}

.dialog.small {
  max-width: 400px;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.dialog-content {
  padding: 24px;
}

.dialog-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* Form inputs */
.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--panel-2);
  color: var(--text-primary);
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder {
  color: var(--text-muted);
}

/* Transport selector */
.transport-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.transport-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.transport-option:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.transport-option.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--accent);
}

.transport-option span {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.transport-desc {
  font-size: 12px !important;
  font-weight: 400 !important;
  color: var(--text-muted) !important;
}

/* Error message */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
  margin-top: 16px;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: var(--panel-2);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.danger {
  background: #ef4444;
  color: white;
}

.btn.danger:hover {
  background: #dc2626;
}

/* Header actions */
.header-actions {
  display: flex;
  gap: 8px;
}

.import-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.import-btn:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

/* Import dialog */
.import-dialog {
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.import-content {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Import tabs */
.import-tabs {
  display: flex;
  gap: 4px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.import-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.import-tab:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.import-tab.active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

/* Tab content */
.import-tab-content {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.import-description {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px 0;
  line-height: 1.5;
}

/* File select button */
.select-file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 24px;
  border: 2px dashed var(--border);
  background: transparent;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.select-file-btn:hover {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.05);
  color: var(--accent);
}

/* File info */
.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  margin-top: 12px;
  background: var(--hover);
  border-radius: 8px;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.server-count {
  font-size: 12px;
  color: var(--accent);
  font-weight: 500;
}

/* Textarea */
.form-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: var(--panel-2);
  color: var(--text-primary);
  resize: vertical;
  line-height: 1.5;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-textarea::placeholder {
  color: var(--text-muted);
  font-family: 'SF Mono', 'Monaco', monospace;
}

/* Parse result */
.parse-result {
  margin-top: 12px;
}

.parse-success,
.parse-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
}

.parse-success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.parse-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Preset categories */
.preset-categories {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.category-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.category-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

/* Presets grid */
.presets-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.preset-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.preset-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-card.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
}

.preset-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 8px;
  color: var(--accent);
  flex-shrink: 0;
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.preset-desc {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.check-icon {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--accent);
}

/* Preset params */
.preset-params {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.preset-params h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.path-input-group .form-input {
  flex: 1;
}

.browse-btn {
  padding: 0 14px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text-primary);
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.browse-btn:hover {
  background: var(--hover);
}

.required {
  color: #ef4444;
}

/* Import preview */
.import-preview {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.import-preview h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.preview-item.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.05);
}

.preview-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.preview-command {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
