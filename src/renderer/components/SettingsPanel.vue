<template>
  <div class="settings-panel">
    <header class="settings-header">
      <div class="header-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <h2>Settings</h2>
      </div>
      <button class="close-btn" @click="handleClose" title="Close settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </header>

    <!-- Unsaved Changes Dialog -->
    <UnsavedChangesDialog
      :visible="showUnsavedDialog"
      @discard="discardAndClose"
      @cancel="showUnsavedDialog = false"
      @save="saveAndClose"
    />

    <!-- Add/Edit Custom Provider Dialog -->
    <CustomProviderDialog
      :visible="showCustomProviderDialog"
      :is-editing="!!editingCustomProvider"
      :initial-data="customProviderFormData"
      :error="customProviderError"
      @close="closeCustomProviderDialog"
      @save="handleSaveCustomProvider"
      @delete="confirmDeleteCustomProvider"
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteConfirmDialog
      :visible="showDeleteConfirmDialog"
      :provider-name="customProviderFormData.name"
      @cancel="showDeleteConfirmDialog = false"
      @confirm="deleteCustomProvider"
    />

    <!-- Tab Navigation -->
    <div class="tabs-nav">
      <button
        :class="['tab-btn', { active: activeTab === 'general' }]"
        @click="activeTab = 'general'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        General
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'ai' }]"
        @click="activeTab = 'ai'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
          <circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>
        </svg>
        AI Provider
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'tools' }]"
        @click="activeTab = 'tools'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        Tools
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'mcp' }]"
        @click="activeTab = 'mcp'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        MCP
      </button>
    </div>

    <div class="settings-content" ref="settingsContentRef">
      <!-- General Tab -->
      <div v-show="activeTab === 'general'" class="tab-content">
        <!-- Appearance -->
        <section class="settings-section">
          <h3 class="section-title">Appearance</h3>

          <div class="theme-cards">
            <div
              :class="['theme-card', { active: localSettings.theme === 'system' }]"
              @click="localSettings.theme = 'system'"
            >
              <div class="theme-preview system">
                <div class="preview-half light">
                  <div class="preview-sidebar"></div>
                  <div class="preview-content">
                    <div class="preview-line"></div>
                  </div>
                </div>
                <div class="preview-half dark">
                  <div class="preview-sidebar"></div>
                  <div class="preview-content">
                    <div class="preview-line"></div>
                  </div>
                </div>
              </div>
              <span>System</span>
            </div>
            <div
              :class="['theme-card', { active: localSettings.theme === 'light' }]"
              @click="localSettings.theme = 'light'"
            >
              <div class="theme-preview light">
                <div class="preview-sidebar"></div>
                <div class="preview-content">
                  <div class="preview-line"></div>
                  <div class="preview-line short"></div>
                </div>
              </div>
              <span>Light</span>
            </div>
            <div
              :class="['theme-card', { active: localSettings.theme === 'dark' }]"
              @click="localSettings.theme = 'dark'"
            >
              <div class="theme-preview dark">
                <div class="preview-sidebar"></div>
                <div class="preview-content">
                  <div class="preview-line"></div>
                  <div class="preview-line short"></div>
                </div>
              </div>
              <span>Dark</span>
            </div>
          </div>
        </section>

        <!-- Animation -->
        <section class="settings-section">
          <h3 class="section-title">Animation</h3>

          <div class="form-group">
            <label class="form-label">
              Expand/Collapse Speed
              <span class="label-value">{{ localSettings.general.animationSpeed.toFixed(2) }}s</span>
            </label>
            <input
              v-model.number="localSettings.general.animationSpeed"
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              class="form-slider"
            />
            <div class="slider-labels">
              <span>Fast</span>
              <span>Slow</span>
            </div>
          </div>
        </section>
      </div>

      <!-- AI Provider Tab -->
      <div v-show="activeTab === 'ai'" class="tab-content">
        <!-- Provider Section -->
        <section class="settings-section">
          <h3 class="section-title">Configure Provider</h3>

          <div class="form-group">
            <label class="form-label">Select Provider to Configure</label>
            <div class="custom-select" ref="providerSelectRef">
              <button class="custom-select-trigger" @click="toggleProviderDropdown">
                <span class="select-icon">
                  <!-- OpenAI Logo -->
                  <svg v-if="viewingProvider === 'openai'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z"/>
                  </svg>
                  <!-- Claude Logo -->
                  <svg v-else-if="viewingProvider === 'claude'" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                    <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
                  </svg>
                  <!-- DeepSeek Logo -->
                  <svg v-else-if="viewingProvider === 'deepseek'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-3.07c-1.25-.27-2.36-.93-3.18-1.82l1.42-1.42c.59.59 1.35 1 2.18 1.14V9.5c-1.68-.46-3-1.95-3-3.75 0-2.07 1.68-3.75 3.75-3.75S15.92 3.68 15.92 5.75c0 1.8-1.32 3.29-3 3.75v2.83c.83-.14 1.59-.55 2.18-1.14l1.42 1.42c-.82.89-1.93 1.55-3.18 1.82v3.07h-2.34z"/>
                  </svg>
                  <!-- Kimi Logo -->
                  <svg v-else-if="viewingProvider === 'kimi'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-9.5c.83 0 1.5-.67 1.5-1.5S10.83 7.5 10 7.5 8.5 8.17 8.5 9s.67 1.5 1.5 1.5zm4 0c.83 0 1.5-.67 1.5-1.5S14.83 7.5 14 7.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-2 5.5c2.21 0 4-1.34 4-3h-8c0 1.66 1.79 3 4 3z"/>
                  </svg>
                  <!-- Zhipu Logo -->
                  <svg v-else-if="viewingProvider === 'zhipu'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  <!-- Custom Icon -->
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                  </svg>
                </span>
                <span class="select-text">{{ providers.find(p => p.id === viewingProvider)?.name }}</span>
                <span v-if="isViewingActiveProvider" class="select-badge">Active</span>
                <svg class="select-chevron" :class="{ open: showProviderDropdown }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div v-if="showProviderDropdown" class="custom-select-dropdown">
                <div
                  v-for="provider in providers"
                  :key="provider.id"
                  :class="['custom-select-option', {
                    selected: viewingProvider === provider.id,
                    active: localSettings.ai.provider === provider.id
                  }]"
                  @click="selectProviderOption(provider.id)"
                >
                  <span class="option-icon">
                    <!-- OpenAI Logo -->
                    <svg v-if="provider.id === 'openai'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z"/>
                    </svg>
                    <!-- Claude Logo -->
                    <svg v-else-if="provider.id === 'claude'" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                      <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
                    </svg>
                    <!-- DeepSeek Logo -->
                    <svg v-else-if="provider.id === 'deepseek'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-3.07c-1.25-.27-2.36-.93-3.18-1.82l1.42-1.42c.59.59 1.35 1 2.18 1.14V9.5c-1.68-.46-3-1.95-3-3.75 0-2.07 1.68-3.75 3.75-3.75S15.92 3.68 15.92 5.75c0 1.8-1.32 3.29-3 3.75v2.83c.83-.14 1.59-.55 2.18-1.14l1.42 1.42c-.82.89-1.93 1.55-3.18 1.82v3.07h-2.34z"/>
                    </svg>
                    <!-- Kimi Logo -->
                    <svg v-else-if="provider.id === 'kimi'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-9.5c.83 0 1.5-.67 1.5-1.5S10.83 7.5 10 7.5 8.5 8.17 8.5 9s.67 1.5 1.5 1.5zm4 0c.83 0 1.5-.67 1.5-1.5S14.83 7.5 14 7.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-2 5.5c2.21 0 4-1.34 4-3h-8c0 1.66 1.79 3 4 3z"/>
                    </svg>
                    <!-- Zhipu Logo -->
                    <svg v-else-if="provider.id === 'zhipu'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <!-- Custom Icon -->
                    <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                  </span>
                  <div class="option-content">
                    <span class="option-name">{{ provider.name }}</span>
                    <span class="option-desc">{{ provider.description }}</span>
                  </div>
                  <!-- Enable toggle for chat model selector -->
                  <label
                    class="option-enable-toggle"
                    :title="isProviderEnabled(provider.id) ? 'Shown in chat' : 'Hidden in chat'"
                    @click.stop
                  >
                    <input
                      type="checkbox"
                      :checked="isProviderEnabled(provider.id)"
                      @change="toggleProviderEnabled(provider.id)"
                    />
                    <span class="mini-toggle-switch"></span>
                  </label>
                  <!-- Edit button for custom providers -->
                  <button
                    v-if="isUserCustomProvider(provider.id)"
                    class="option-edit-btn"
                    @click.stop="openEditCustomProvider(provider.id)"
                    title="Edit provider"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <span v-if="localSettings.ai.provider === provider.id" class="option-active-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    Active
                  </span>
                </div>

                <!-- Add Custom Provider Button -->
                <div class="dropdown-divider"></div>
                <button class="add-provider-btn" @click.stop="openAddCustomProvider">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  <span>Add Custom Provider</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Active Provider Toggle -->
          <div class="active-provider-toggle">
            <label class="toggle-label">
              <input
                type="checkbox"
                :checked="isViewingActiveProvider"
                @change="setActiveProvider(viewingProvider)"
                :disabled="isViewingActiveProvider"
              />
              <span class="toggle-switch"></span>
              <span class="toggle-text">
                {{ isViewingActiveProvider ? 'Active provider for chat' : 'Set as active provider' }}
              </span>
            </label>
            <p v-if="!isViewingActiveProvider" class="form-hint" style="margin-top: 4px;">
              Currently using: {{ providers.find(p => p.id === localSettings.ai.provider)?.name }}
            </p>
          </div>
        </section>

        <!-- API Configuration -->
        <section class="settings-section">
          <h3 class="section-title">API Configuration</h3>

          <div class="form-group">
            <label class="form-label">
              API Key
              <span class="label-hint">Required for {{ currentProviderName }}</span>
            </label>
            <div class="input-wrapper">
              <input
                v-model="localSettings.ai.providers[viewingProvider].apiKey"
                :type="showApiKey ? 'text' : 'password'"
                class="form-input"
                :placeholder="`Enter your ${currentProviderName} API key...`"
              />
              <button class="input-action" @click="showApiKey = !showApiKey" type="button">
                <svg v-if="showApiKey" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Base URL</label>
            <input
              v-model="localSettings.ai.providers[viewingProvider].baseUrl"
              type="text"
              class="form-input"
              :placeholder="getDefaultBaseUrl()"
            />
            <p class="form-hint">Leave empty to use default endpoint</p>
          </div>
        </section>

        <!-- Model Selection -->
        <section class="settings-section" ref="modelSectionRef">
          <h3 class="section-title collapsible" @click="toggleModelSection">
            <div class="title-left">
              <svg
                class="collapse-chevron"
                :class="{ expanded: isModelSectionExpanded }"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span>Models</span>
              <span class="selected-count">({{ currentSelectedModels.length }} selected)</span>
            </div>
            <div class="title-actions" @click.stop>
              <span v-if="modelInfo" class="model-info">{{ modelInfo }}</span>
              <button
                class="refresh-btn"
                @click="fetchModels(true)"
                :disabled="isLoadingModels"
                title="Refresh models from API"
              >
                <svg
                  :class="{ spinning: isLoadingModels }"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                {{ isLoadingModels ? 'Loading...' : 'Refresh' }}
              </button>
            </div>
          </h3>

          <div class="collapsible-wrapper" :class="{ expanded: isModelSectionExpanded }">
          <div class="collapsible-inner">
            <p class="section-hint">Select models to enable for quick switching in chat. Click to toggle.</p>

          <div v-if="modelError" class="error-message">
            {{ modelError }}
          </div>

          <!-- Search box -->
          <div v-if="availableModels.length > 0" class="model-search">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              v-model="modelSearchQuery"
              type="text"
              class="search-input"
              placeholder="Search models..."
            />
            <button
              v-if="modelSearchQuery"
              class="search-clear"
              @click="modelSearchQuery = ''"
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- No search results message -->
          <div v-if="modelSearchQuery && filteredModels.length === 0" class="no-results">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <span>No models match "{{ modelSearchQuery }}"</span>
          </div>

          <div v-if="filteredModels.length > 0" class="model-grid">
            <div
              v-for="model in filteredModels"
              :key="model.id"
              :class="['model-card', 'selectable', {
                selected: isModelSelected(model.id),
                active: localSettings.ai.providers[viewingProvider].model === model.id
              }]"
              @click="toggleModelSelection(model.id)"
            >
              <div class="model-check">
                <svg v-if="isModelSelected(model.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <div class="model-info-content">
                <div class="model-name">{{ model.name || model.id }}</div>
                <div v-if="model.description" class="model-desc">{{ model.description }}</div>
              </div>
              <div v-if="localSettings.ai.providers[viewingProvider].model === model.id" class="model-active-badge">
                Active
              </div>
            </div>
          </div>

          <div v-else class="form-group">
            <label class="form-label">Add Model</label>
            <div class="add-model-row">
              <input
                v-model="newModelInput"
                type="text"
                class="form-input"
                placeholder="e.g., gpt-4, claude-3-opus"
                @keydown.enter="addCustomModel"
              />
              <button class="add-model-btn" @click="addCustomModel" :disabled="!newModelInput.trim()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
            <p class="form-hint">Enter model name or click Refresh to fetch available models</p>
          </div>

          <!-- Selected models list when no available models -->
          <div v-if="availableModels.length === 0 && currentSelectedModels.length > 0" class="selected-models-list">
            <div class="form-label">Selected Models</div>
            <div class="selected-model-chips">
              <div
                v-for="model in currentSelectedModels"
                :key="model"
                :class="['model-chip', { active: localSettings.ai.providers[viewingProvider].model === model }]"
              >
                <span>{{ model }}</span>
                <button class="chip-remove" @click="removeSelectedModel(model)" title="Remove">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          </div><!-- end collapsible-inner -->
          </div><!-- end collapsible-wrapper -->
        </section>

        <!-- Advanced Settings -->
        <section class="settings-section">
          <h3 class="section-title">Advanced</h3>

          <div class="form-group">
            <label class="form-label">
              Temperature
              <span class="label-value">{{ localSettings.ai.temperature.toFixed(1) }}</span>
            </label>
            <input
              v-model.number="localSettings.ai.temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              class="form-slider"
            />
            <div class="slider-labels">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Tools Tab -->
      <div v-show="activeTab === 'tools'" class="tab-content">
        <!-- Enable Tool Calls -->
        <section class="settings-section">
          <h3 class="section-title">Tool Settings</h3>

          <div class="form-group">
            <div class="toggle-row">
              <label class="form-label">Enable Tool Calls</label>
              <label class="toggle">
                <input
                  type="checkbox"
                  v-model="localSettings.tools.enableToolCalls"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <p class="form-hint">Allow AI to use tools during conversations</p>
          </div>
        </section>

        <!-- Available Tools -->
        <section class="settings-section" v-if="localSettings.tools.enableToolCalls">
          <h3 class="section-title">Available Tools</h3>

          <div v-if="availableTools.length === 0" class="empty-state">
            <p>No tools available</p>
          </div>

          <div v-else class="tools-list">
            <div
              v-for="tool in availableTools"
              :key="tool.id"
              class="tool-item"
            >
              <div class="tool-info">
                <div class="tool-header">
                  <span class="tool-name">{{ tool.name }}</span>
                  <span :class="['tool-category', tool.category]">{{ tool.category }}</span>
                </div>
                <p class="tool-description">{{ tool.description }}</p>
              </div>
              <div class="tool-controls">
                <div class="toggle-row">
                  <span class="control-label">Enabled</span>
                  <label class="toggle small">
                    <input
                      type="checkbox"
                      :checked="getToolEnabled(tool.id)"
                      @change="setToolEnabled(tool.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="toggle-row">
                  <span class="control-label">Auto Execute</span>
                  <label class="toggle small">
                    <input
                      type="checkbox"
                      :checked="getToolAutoExecute(tool.id)"
                      @change="setToolAutoExecute(tool.id, ($event.target as HTMLInputElement).checked)"
                      :disabled="!getToolEnabled(tool.id)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- MCP Tab -->
      <div v-show="activeTab === 'mcp'" class="tab-content">
        <MCPSettingsPanel
          :settings="localSettings.mcp || { enabled: true, servers: [] }"
          @update:settings="handleMCPSettingsUpdate"
        />
      </div>
    </div>

    <footer class="settings-footer">
      <div v-if="hasUnsavedChanges" class="unsaved-indicator">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Unsaved changes</span>
      </div>
      <div class="footer-actions">
        <button class="btn secondary" @click="handleClose">Cancel</button>
        <button
          :class="['btn', hasUnsavedChanges ? 'primary highlight' : 'primary']"
          @click="saveSettings"
          :disabled="isSaving"
        >
          <span v-if="isSaving">Saving...</span>
          <span v-else>{{ hasUnsavedChanges ? 'Save Changes' : 'Save' }}</span>
        </button>
      </div>
    </footer>

    <!-- Save Success Toast -->
    <Transition name="toast">
      <div v-if="showSaveSuccess" class="save-toast">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Settings saved</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, toRaw, onMounted, onUnmounted, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { AppSettings, AIProvider, ModelInfo, ProviderInfo, CustomProviderConfig, ToolDefinition } from '@/types'
import { AIProvider as AIProviderEnum } from '../../shared/ipc'
import { v4 as uuidv4 } from 'uuid'
import CustomProviderDialog, { type CustomProviderForm } from './settings/CustomProviderDialog.vue'
import UnsavedChangesDialog from './settings/UnsavedChangesDialog.vue'
import DeleteConfirmDialog from './settings/DeleteConfirmDialog.vue'
import MCPSettingsPanel from './settings/MCPSettingsPanel.vue'

const emit = defineEmits<{
  close: []
}>()

const settingsStore = useSettingsStore()

// Active tab
const activeTab = ref<'general' | 'ai' | 'tools' | 'mcp'>('general')

// Deep clone settings, ensuring providers object exists
const localSettings = ref<AppSettings>(
  JSON.parse(JSON.stringify(toRaw(settingsStore.settings))) as AppSettings
)

// Ensure providers object exists (for migration from old settings)
if (!localSettings.value.ai.providers) {
  localSettings.value.ai.providers = {
    [AIProviderEnum.OpenAI]: { apiKey: '', model: 'gpt-4', selectedModels: ['gpt-4'] },
    [AIProviderEnum.Claude]: { apiKey: '', model: 'claude-sonnet-4-5-20250929', selectedModels: ['claude-sonnet-4-5-20250929'] },
    [AIProviderEnum.DeepSeek]: { apiKey: '', model: 'deepseek-chat', selectedModels: ['deepseek-chat', 'deepseek-reasoner'] },
    [AIProviderEnum.Kimi]: { apiKey: '', model: 'moonshot-v1-8k', selectedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
    [AIProviderEnum.Zhipu]: { apiKey: '', model: 'glm-4-flash', selectedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'] },
    [AIProviderEnum.Custom]: { apiKey: '', baseUrl: '', model: '', selectedModels: [] },
  }
}

// Ensure all built-in providers have config (for migration when new providers are added)
const defaultProviderConfigs: Record<string, { apiKey: string; model: string; selectedModels: string[]; baseUrl?: string }> = {
  [AIProviderEnum.OpenAI]: { apiKey: '', model: 'gpt-4', selectedModels: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'] },
  [AIProviderEnum.Claude]: { apiKey: '', model: 'claude-sonnet-4-5-20250929', selectedModels: ['claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'] },
  [AIProviderEnum.DeepSeek]: { apiKey: '', model: 'deepseek-chat', selectedModels: ['deepseek-chat', 'deepseek-reasoner'] },
  [AIProviderEnum.Kimi]: { apiKey: '', model: 'moonshot-v1-8k', selectedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  [AIProviderEnum.Zhipu]: { apiKey: '', model: 'glm-4-flash', selectedModels: ['glm-4-flash', 'glm-4-plus', 'glm-4'] },
  [AIProviderEnum.Custom]: { apiKey: '', baseUrl: '', model: '', selectedModels: [] },
}

for (const [providerId, defaultConfig] of Object.entries(defaultProviderConfigs)) {
  if (!localSettings.value.ai.providers[providerId]) {
    localSettings.value.ai.providers[providerId] = { ...defaultConfig }
  }
}

// Ensure selectedModels exists for each provider
for (const providerKey of Object.keys(localSettings.value.ai.providers)) {
  const provider = localSettings.value.ai.providers[providerKey as AIProvider]
  if (!provider.selectedModels) {
    provider.selectedModels = provider.model ? [provider.model] : []
  }
}

// Ensure general settings exist
if (!localSettings.value.general) {
  localSettings.value.general = {
    animationSpeed: 0.25,
  }
}

// Ensure customProviders array exists
if (!localSettings.value.ai.customProviders) {
  localSettings.value.ai.customProviders = []
}

// Ensure tools settings exist
if (!localSettings.value.tools) {
  localSettings.value.tools = {
    enableToolCalls: true,
    tools: {},
  }
}

// Ensure MCP settings exist
if (!localSettings.value.mcp) {
  localSettings.value.mcp = {
    enabled: true,
    servers: [],
  }
}

const showApiKey = ref(false)
const isSaving = ref(false)
const showSaveSuccess = ref(false)
const isLoadingModels = ref(false)
const modelError = ref('')
const modelInfo = ref('')  // Shows cache info or other messages
const showProviderDropdown = ref(false)
const providerSelectRef = ref<HTMLElement | null>(null)
const availableModels = ref<ModelInfo[]>([])

// Separate "viewing/editing provider" from "active provider in settings"
// This allows users to browse different provider configs without changing the active one
const viewingProvider = ref<AIProvider>(localSettings.value.ai.provider)
const newModelInput = ref('')
const showUnsavedDialog = ref(false)
const isModelSectionExpanded = ref(false)
const modelSectionRef = ref<HTMLElement | null>(null)
const settingsContentRef = ref<HTMLElement | null>(null)
const modelSearchQuery = ref('')

// Custom provider dialog state
const showCustomProviderDialog = ref(false)
const editingCustomProvider = ref<string | null>(null)  // ID of provider being edited, null for adding new
const showDeleteConfirmDialog = ref(false)
const customProviderError = ref('')
const customProviderFormData = ref<CustomProviderForm>({
  name: '',
  description: '',
  apiType: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
})

// Tools state
const availableTools = ref<ToolDefinition[]>([])

// Load available tools
async function loadAvailableTools() {
  try {
    const response = await window.electronAPI.getTools()
    if (response.success && response.tools) {
      availableTools.value = response.tools
    }
  } catch (error) {
    console.error('Failed to load tools:', error)
  }
}

// Get tool enabled state
function getToolEnabled(toolId: string): boolean {
  const settings = localSettings.value.tools.tools[toolId]
  if (settings !== undefined) {
    return settings.enabled
  }
  // Default to the tool's default setting
  const tool = availableTools.value.find(t => t.id === toolId)
  return tool?.enabled ?? true
}

// Set tool enabled state
function setToolEnabled(toolId: string, enabled: boolean) {
  if (!localSettings.value.tools.tools[toolId]) {
    localSettings.value.tools.tools[toolId] = { enabled, autoExecute: true }
  } else {
    localSettings.value.tools.tools[toolId].enabled = enabled
  }
}

// Get tool auto-execute state
function getToolAutoExecute(toolId: string): boolean {
  const settings = localSettings.value.tools.tools[toolId]
  if (settings !== undefined) {
    return settings.autoExecute
  }
  // Default to the tool's default setting
  const tool = availableTools.value.find(t => t.id === toolId)
  return tool?.autoExecute ?? true
}

// Set tool auto-execute state
function setToolAutoExecute(toolId: string, autoExecute: boolean) {
  if (!localSettings.value.tools.tools[toolId]) {
    localSettings.value.tools.tools[toolId] = { enabled: true, autoExecute }
  } else {
    localSettings.value.tools.tools[toolId].autoExecute = autoExecute
  }
}

// Handle MCP settings update from child component
function handleMCPSettingsUpdate(mcpSettings: { enabled: boolean; servers: any[] }) {
  localSettings.value.mcp = mcpSettings
}

// Store original settings for comparison (use localSettings after migration to avoid false positives)
const originalSettings = ref<string>(JSON.stringify(localSettings.value))

// Computed: check if there are unsaved changes
const hasUnsavedChanges = computed(() => {
  return JSON.stringify(localSettings.value) !== originalSettings.value
})

// Computed: current provider's selected models
const currentSelectedModels = computed(() => {
  return localSettings.value.ai.providers[viewingProvider.value].selectedModels || []
})

// Computed: filtered models based on search query
const filteredModels = computed(() => {
  if (!modelSearchQuery.value.trim()) {
    return availableModels.value
  }
  const query = modelSearchQuery.value.toLowerCase()
  return availableModels.value.filter(model =>
    model.id.toLowerCase().includes(query) ||
    (model.name && model.name.toLowerCase().includes(query)) ||
    (model.description && model.description.toLowerCase().includes(query))
  )
})

// Get providers from settings store (loaded from backend provider registry)
const providers = computed<ProviderInfo[]>(() => {
  // Use available providers from settings store, with fallback for initial load
  if (settingsStore.availableProviders.length > 0) {
    return settingsStore.availableProviders
  }
  // Fallback providers (shown while loading)
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      icon: 'openai',
      description: 'GPT-4, GPT-3.5 and other OpenAI models',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    },
    {
      id: 'claude',
      name: 'Claude',
      icon: 'claude',
      description: 'Claude 3.5, Claude 3 and other Anthropic models',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-5-sonnet-20241022',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      icon: 'deepseek',
      description: 'DeepSeek-V3, DeepSeek-R1 and other DeepSeek models',
      defaultBaseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    },
    {
      id: 'kimi',
      name: 'Kimi',
      icon: 'kimi',
      description: 'Moonshot AI Kimi models with long context support',
      defaultBaseUrl: 'https://api.moonshot.cn/v1',
      defaultModel: 'moonshot-v1-8k',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    },
    {
      id: 'zhipu',
      name: '智谱 GLM',
      icon: 'zhipu',
      description: 'GLM-4, GLM-3 and other Zhipu AI models',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4-flash',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    },
    {
      id: 'custom',
      name: 'Custom',
      icon: 'custom',
      description: 'OpenAI-compatible API endpoint',
      defaultBaseUrl: '',
      defaultModel: '',
      supportsCustomBaseUrl: true,
      requiresApiKey: true,
    },
  ]
})

// Computed for display (read-only)
const currentProviderConfig = computed(() => {
  const provider = localSettings.value.ai.provider
  return localSettings.value.ai.providers[provider]
})

// Computed property to get current provider name
const currentProviderName = computed(() => {
  return providers.value.find(p => p.id === viewingProvider.value)?.name || viewingProvider.value
})

// Check if viewing provider is the active one
const isViewingActiveProvider = computed(() => {
  return viewingProvider.value === localSettings.value.ai.provider
})

function getDefaultBaseUrl(): string {
  const provider = providers.value.find(p => p.id === viewingProvider.value)
  return provider?.defaultBaseUrl || 'https://api.example.com/v1'
}

// Switch which provider we're viewing/editing (doesn't change active provider)
async function switchViewingProvider(provider: AIProvider) {
  viewingProvider.value = provider
  availableModels.value = []
  modelError.value = ''
  modelInfo.value = ''
  modelSearchQuery.value = ''

  // Load cached models for the selected provider
  await loadCachedModels()
}

// Toggle provider dropdown
function toggleProviderDropdown() {
  showProviderDropdown.value = !showProviderDropdown.value
}

// Select provider from custom dropdown
async function selectProviderOption(provider: AIProvider) {
  showProviderDropdown.value = false
  await switchViewingProvider(provider)
}

// Handle click outside provider dropdown
function handleProviderDropdownClickOutside(event: MouseEvent) {
  if (providerSelectRef.value && !providerSelectRef.value.contains(event.target as Node)) {
    showProviderDropdown.value = false
  }
}

// Set a provider as the active one for chat
function setActiveProvider(provider: AIProvider) {
  localSettings.value.ai.provider = provider
}

function selectModel(modelId: string) {
  localSettings.value.ai.providers[viewingProvider.value].model = modelId
}

// Toggle model section with smooth scroll
function toggleModelSection() {
  const wasCollapsed = !isModelSectionExpanded.value
  const container = settingsContentRef.value
  const section = modelSectionRef.value

  if (wasCollapsed && container && section) {
    // Check if we're currently scrolled to the bottom (or very close)
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 10

    // Remember current scroll position before expanding
    const currentScrollTop = container.scrollTop

    isModelSectionExpanded.value = true

    if (isAtBottom) {
      // If we were at the bottom, stay at the bottom after expansion
      // Use requestAnimationFrame to wait for the DOM update
      requestAnimationFrame(() => {
        // After expansion starts, scroll to bottom to follow the content
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        })
      })
    } else {
      // If we weren't at the bottom, maintain current scroll position
      // This prevents the browser from jumping to a previous position
      requestAnimationFrame(() => {
        container.scrollTop = currentScrollTop
      })
    }
  } else {
    // Just toggle when collapsing
    isModelSectionExpanded.value = !isModelSectionExpanded.value
  }
}

// Check if a model is in the selected list
function isModelSelected(modelId: string): boolean {
  const selectedModels = localSettings.value.ai.providers[viewingProvider.value].selectedModels || []
  return selectedModels.includes(modelId)
}

// Toggle model selection
function toggleModelSelection(modelId: string) {
  const providerConfig = localSettings.value.ai.providers[viewingProvider.value]

  if (!providerConfig.selectedModels) {
    providerConfig.selectedModels = []
  }

  const index = providerConfig.selectedModels.indexOf(modelId)
  if (index === -1) {
    // Add to selected
    providerConfig.selectedModels.push(modelId)
    // If this is the first selected model, make it active
    if (providerConfig.selectedModels.length === 1) {
      providerConfig.model = modelId
    }
  } else {
    // Remove from selected (but keep at least one if it's the active model)
    if (providerConfig.selectedModels.length > 1 || providerConfig.model !== modelId) {
      providerConfig.selectedModels.splice(index, 1)
      // If we removed the active model, switch to another selected one
      if (providerConfig.model === modelId && providerConfig.selectedModels.length > 0) {
        providerConfig.model = providerConfig.selectedModels[0]
      }
    }
  }
}

// Add a custom model
function addCustomModel() {
  const modelId = newModelInput.value.trim()
  if (!modelId) return

  const provider = localSettings.value.ai.provider
  const providerConfig = localSettings.value.ai.providers[provider]

  if (!providerConfig.selectedModels) {
    providerConfig.selectedModels = []
  }

  if (!providerConfig.selectedModels.includes(modelId)) {
    providerConfig.selectedModels.push(modelId)
  }

  // Set as active if it's the first one
  if (!providerConfig.model) {
    providerConfig.model = modelId
  }

  newModelInput.value = ''
}

// Remove a selected model
function removeSelectedModel(modelId: string) {
  const providerConfig = localSettings.value.ai.providers[viewingProvider.value]

  if (!providerConfig.selectedModels) return

  const index = providerConfig.selectedModels.indexOf(modelId)
  if (index !== -1) {
    providerConfig.selectedModels.splice(index, 1)
    // If we removed the active model, switch to another
    if (providerConfig.model === modelId && providerConfig.selectedModels.length > 0) {
      providerConfig.model = providerConfig.selectedModels[0]
    }
  }
}

// Check if a provider is a user-defined custom provider
function isUserCustomProvider(providerId: string): boolean {
  return settingsStore.isCustomProvider(providerId)
}

// Check if a provider is enabled for the chat model selector
function isProviderEnabled(providerId: string): boolean {
  const config = localSettings.value.ai.providers[providerId]
  // Default to enabled if the property doesn't exist
  return config?.enabled !== false
}

// Toggle provider enabled state for the chat model selector
function toggleProviderEnabled(providerId: string) {
  const config = localSettings.value.ai.providers[providerId]
  if (config) {
    config.enabled = !isProviderEnabled(providerId)
  }
}

// Open dialog to add a new custom provider
function openAddCustomProvider() {
  showProviderDropdown.value = false
  editingCustomProvider.value = null
  customProviderError.value = ''
  customProviderFormData.value = {
    name: '',
    description: '',
    apiType: 'openai',
    baseUrl: '',
    apiKey: '',
    model: '',
  }
  showCustomProviderDialog.value = true
}

// Open dialog to edit an existing custom provider
function openEditCustomProvider(providerId: string) {
  showProviderDropdown.value = false
  const provider = settingsStore.getCustomProvider(providerId)
  if (!provider) return

  editingCustomProvider.value = providerId
  customProviderError.value = ''
  customProviderFormData.value = {
    name: provider.name,
    description: provider.description || '',
    apiType: provider.apiType,
    baseUrl: provider.baseUrl || '',
    apiKey: provider.apiKey,
    model: provider.model,
  }
  showCustomProviderDialog.value = true
}

// Close custom provider dialog
function closeCustomProviderDialog() {
  showCustomProviderDialog.value = false
  editingCustomProvider.value = null
  customProviderError.value = ''
}

// Handle save from CustomProviderDialog component
async function handleSaveCustomProvider(formData: CustomProviderForm) {
  // Validate required fields
  if (!formData.name.trim()) {
    customProviderError.value = 'Provider name is required'
    return
  }
  if (!formData.baseUrl.trim()) {
    customProviderError.value = 'Base URL is required'
    return
  }

  try {
    if (editingCustomProvider.value) {
      // Update existing provider
      settingsStore.updateCustomProvider(editingCustomProvider.value, {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        apiType: formData.apiType,
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey,
        model: formData.model.trim(),
      })

      // Also update localSettings to keep them in sync
      const providerId = editingCustomProvider.value
      if (localSettings.value.ai.providers[providerId]) {
        localSettings.value.ai.providers[providerId].apiKey = formData.apiKey
        localSettings.value.ai.providers[providerId].baseUrl = formData.baseUrl.trim()
        localSettings.value.ai.providers[providerId].model = formData.model.trim()
      }
    } else {
      // Add new provider
      const newProviderId = `custom-${uuidv4().slice(0, 8)}`
      const newProvider: CustomProviderConfig = {
        id: newProviderId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        apiType: formData.apiType,
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey,
        model: formData.model.trim(),
        selectedModels: formData.model.trim() ? [formData.model.trim()] : [],
      }
      settingsStore.addCustomProvider(newProvider)

      // Add to localSettings as well
      localSettings.value.ai.providers[newProviderId] = {
        apiKey: newProvider.apiKey,
        baseUrl: newProvider.baseUrl,
        model: newProvider.model,
        selectedModels: newProvider.selectedModels,
      }

      // Switch to view the new provider
      await switchViewingProvider(newProviderId as AIProvider)
    }

    // Save settings to persist changes
    await saveSettings()

    closeCustomProviderDialog()
  } catch (err: any) {
    customProviderError.value = err.message || 'Failed to save provider'
  }
}

// Show delete confirmation dialog
function confirmDeleteCustomProvider() {
  showDeleteConfirmDialog.value = true
}

// Delete custom provider
async function deleteCustomProvider() {
  if (!editingCustomProvider.value) return

  const providerId = editingCustomProvider.value

  // Delete from store
  settingsStore.deleteCustomProvider(providerId)

  // Remove from localSettings
  delete localSettings.value.ai.providers[providerId]

  // If we were viewing this provider, switch to OpenAI
  if (viewingProvider.value === providerId) {
    await switchViewingProvider('openai' as AIProvider)
  }

  // Save settings to persist changes
  await saveSettings()

  showDeleteConfirmDialog.value = false
  closeCustomProviderDialog()
}

// Load cached models from local storage
async function loadCachedModels() {
  try {
    const response = await window.electronAPI.getCachedModels(viewingProvider.value)
    if (response.success && response.models && response.models.length > 0) {
      availableModels.value = response.models
      if (response.cachedAt) {
        const cachedDate = new Date(response.cachedAt)
        modelInfo.value = `Cached: ${cachedDate.toLocaleDateString()} ${cachedDate.toLocaleTimeString()}`
      }
    }
  } catch (err) {
    console.error('Failed to load cached models:', err)
  }
}

// Fetch models from API (force refresh)
async function fetchModels(forceRefresh = true) {
  const providerConfig = localSettings.value.ai.providers[viewingProvider.value]
  const apiKey = providerConfig.apiKey

  // For non-Claude providers, API key is required
  if (viewingProvider.value !== 'claude' && !apiKey) {
    modelError.value = 'Please enter an API key first'
    return
  }

  isLoadingModels.value = true
  modelError.value = ''
  modelInfo.value = ''

  try {
    const baseUrl = providerConfig.baseUrl || getDefaultBaseUrl()
    const response = await window.electronAPI.fetchModels(viewingProvider.value, apiKey, baseUrl, forceRefresh)

    if (response.success && response.models) {
      availableModels.value = response.models

      if (response.fromCache) {
        const cached = await window.electronAPI.getCachedModels(viewingProvider.value)
        if (cached.cachedAt) {
          const cachedDate = new Date(cached.cachedAt)
          modelInfo.value = `From cache: ${cachedDate.toLocaleDateString()} ${cachedDate.toLocaleTimeString()}`
        }
      } else {
        modelInfo.value = 'Fetched from API'
      }

      if (response.error) {
        // This means we got data but there was a warning (e.g., using cache due to network error)
        modelError.value = response.error
      }
    } else {
      modelError.value = response.error || 'Failed to fetch models'
    }

    if (availableModels.value.length === 0) {
      modelError.value = 'No models found'
    }
  } catch (err: any) {
    modelError.value = err.message || 'Failed to fetch models'
  } finally {
    isLoadingModels.value = false
  }
}

async function saveSettings() {
  isSaving.value = true
  try {
    await settingsStore.saveSettings(localSettings.value)
    // Update original settings to reflect saved state
    originalSettings.value = JSON.stringify(localSettings.value)
    // Show success toast
    showSaveSuccess.value = true
    setTimeout(() => {
      showSaveSuccess.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to save settings:', err)
  } finally {
    isSaving.value = false
  }
}

// Handle close button click
function handleClose() {
  if (hasUnsavedChanges.value) {
    showUnsavedDialog.value = true
  } else {
    emit('close')
  }
}

// Discard changes and close
function discardAndClose() {
  showUnsavedDialog.value = false
  emit('close')
}

// Save changes and close
async function saveAndClose() {
  await saveSettings()
  showUnsavedDialog.value = false
  emit('close')
}

onMounted(async () => {
  // Load cached models on mount
  await loadCachedModels()

  // Load available tools
  await loadAvailableTools()

  // Add click outside listener for provider dropdown
  document.addEventListener('click', handleProviderDropdownClickOutside)
})

onUnmounted(() => {
  // Cleanup click outside listener
  document.removeEventListener('click', handleProviderDropdownClickOutside)
})
</script>

<style scoped>
.settings-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  user-select: none;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.08);
}

html[data-theme='light'] .settings-header {
  background: rgba(0, 0, 0, 0.02);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}

.header-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

/* Tab Navigation */
.tabs-nav {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.04);
}

html[data-theme='light'] .tabs-nav {
  background: rgba(0, 0, 0, 0.01);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.tab-btn.active {
  background: var(--accent);
  color: white;
}

.tab-btn svg {
  flex-shrink: 0;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-content {
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

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title.collapsible {
  cursor: pointer;
  padding: 8px 10px;
  margin: -8px -10px 16px -10px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.section-title.collapsible:hover {
  background: var(--hover);
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.collapse-chevron.expanded {
  transform: rotate(90deg);
}

.selected-count {
  font-size: 11px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
}

/* Smooth collapse using CSS Grid technique */
.collapsible-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s ease-out, opacity 0.3s ease-out;
  opacity: 0;
}

.collapsible-wrapper.expanded {
  grid-template-rows: 1fr;
  opacity: 1;
}

.collapsible-inner {
  overflow: hidden;
  min-height: 0; /* Required for grid collapse to work */
  padding-top: 4px; /* Prevent content clipping at top */
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-info {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
  text-transform: none;
  letter-spacing: normal;
}

/* Provider Select */
.provider-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.form-select {
  width: 100%;
  padding: 12px 40px 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: all 0.15s ease;
}

.form-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-select:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.form-select option {
  background: var(--bg);
  color: var(--text);
  padding: 8px;
}

.select-chevron {
  position: absolute;
  right: 12px;
  pointer-events: none;
  color: var(--muted);
}

/* Custom Select Dropdown */
.custom-select {
  position: relative;
  width: 100%;
}

.custom-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.custom-select-trigger:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: var(--hover);
}

.custom-select-trigger:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.select-icon svg {
  width: 20px;
  height: 20px;
}

.select-text {
  flex: 1;
  font-weight: 500;
}

.select-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(59, 130, 246, 0.15);
  padding: 3px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-right: 4px;
}

.custom-select-trigger .select-chevron {
  position: static;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--muted);
  transition: transform 0.2s ease;
  pointer-events: auto;
}

.select-chevron.open {
  transform: rotate(180deg);
}

.custom-select-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  padding: 6px;
  animation: dropdownSlideIn 0.15s ease;
  max-height: 280px;
  overflow-y: auto;
}

html[data-theme='light'] .custom-select-dropdown {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

@keyframes dropdownSlideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-select-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.custom-select-option:hover {
  background: var(--hover);
}

.custom-select-option.selected {
  background: rgba(59, 130, 246, 0.08);
}

.custom-select-option.active {
  background: rgba(59, 130, 246, 0.12);
}

.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  flex-shrink: 0;
}

.option-icon svg {
  width: 20px;
  height: 20px;
}

.option-content {
  flex: 1;
  min-width: 0;
}

.option-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.option-desc {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.option-active-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(59, 130, 246, 0.15);
  padding: 4px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.option-active-badge svg {
  flex-shrink: 0;
}

/* Active Provider Toggle */
.active-provider-toggle {
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--panel-2);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-label input {
  display: none;
}

.toggle-switch {
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: all 0.2s ease;
}

.toggle-label input:checked + .toggle-switch {
  background: var(--accent);
}

.toggle-label input:checked + .toggle-switch::after {
  left: 18px;
}

.toggle-label input:disabled + .toggle-switch {
  opacity: 0.7;
  cursor: not-allowed;
}

.toggle-text {
  font-size: 13px;
  color: var(--text);
}

/* Legacy provider card styles - keeping for backwards compatibility */
.provider-desc {
  font-size: 12px;
  color: var(--muted);
}

.provider-check {
  color: var(--accent);
}

/* Form Elements */
.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.label-hint {
  font-size: 11px;
  color: var(--muted);
  font-weight: 400;
}

.label-value {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: var(--panel-2);
  color: var(--text);
  transition: all 0.15s ease;
  user-select: text;
}

.input-wrapper .form-input {
  padding-right: 44px;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder {
  color: var(--muted);
}

.input-action {
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.input-action:hover {
  background: var(--hover);
  color: var(--text);
}

.form-hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: var(--muted);
}

.form-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  cursor: pointer;
  -webkit-appearance: none;
}

.form-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid var(--bg);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}

/* Refresh Button */
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Section hint */
.section-hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 16px 0;
}

/* Model Grid */
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.model-card {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--panel-2);
}

.model-card.selectable {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.model-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: var(--hover);
}

.model-card.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
}

.model-card.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.15);
}

.model-check {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
  transition: all 0.15s ease;
}

.model-card.selected .model-check {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.model-info-content {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 13px;
  font-weight: 500;
}

.model-desc {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.model-active-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(59, 130, 246, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Add model row */
.add-model-row {
  display: flex;
  gap: 8px;
}

.add-model-row .form-input {
  flex: 1;
}

.add-model-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.add-model-btn:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.add-model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Selected models list */
.selected-models-list {
  margin-top: 16px;
}

.selected-model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.model-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
}

.model-chip.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

.chip-remove {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.chip-remove:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.error-message {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 12px;
}

/* Model Search */
.model-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.model-search .search-icon {
  position: absolute;
  left: 12px;
  color: var(--muted);
  pointer-events: none;
}

.model-search .search-input {
  width: 100%;
  padding: 10px 36px 10px 38px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  background: var(--panel-2);
  color: var(--text);
  transition: all 0.15s ease;
  user-select: text;
}

.model-search .search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.model-search .search-input::placeholder {
  color: var(--muted);
}

.model-search .search-clear {
  position: absolute;
  right: 8px;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.model-search .search-clear:hover {
  background: var(--hover);
  color: var(--text);
}

/* No results message */
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 20px;
  color: var(--muted);
  font-size: 13px;
}

.no-results svg {
  opacity: 0.5;
}

/* Theme Cards */
.theme-cards {
  display: flex;
  gap: 12px;
}

.theme-card {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.theme-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.theme-card.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

.theme-card span {
  font-size: 13px;
  font-weight: 500;
}

.theme-preview {
  height: 60px;
  border-radius: 8px;
  margin-bottom: 10px;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--border);
}

.theme-preview.light {
  background: #ffffff;
}

.theme-preview.dark {
  background: #0f1117;
}

.theme-preview.system {
  background: transparent;
}

.preview-half {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.preview-half.light {
  background: #ffffff;
}

.preview-half.dark {
  background: #0f1117;
}

.preview-half .preview-sidebar {
  width: 30%;
  background: rgba(128, 128, 128, 0.15);
}

.preview-half .preview-content {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
}

.preview-half .preview-line {
  height: 4px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.2);
}

.preview-sidebar {
  width: 30%;
  background: rgba(128, 128, 128, 0.15);
}

.preview-content {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.preview-line {
  height: 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.2);
}

.preview-line.short {
  width: 60%;
}

/* Footer */
.settings-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.05);
}

.unsaved-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #f59e0b;
  margin-right: auto;
}

.unsaved-indicator svg {
  color: #f59e0b;
}

.footer-actions {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

.btn {
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.primary {
  background: var(--accent);
  border: none;
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.primary.highlight {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

.dialog {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.dialog-header svg {
  color: #f59e0b;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.dialog-message {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: var(--muted);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.dialog-actions .btn {
  flex: none;
  padding: 10px 16px;
}

/* Custom Provider Dialog */
.custom-provider-dialog {
  max-width: 480px;
}

.custom-provider-dialog .dialog-header svg {
  color: var(--accent);
}

.dialog-body {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.dialog-body .form-group {
  margin-bottom: 16px;
}

.dialog-body .form-group:last-of-type {
  margin-bottom: 0;
}

.required {
  color: #ef4444;
}

/* API Type Selector */
.api-type-selector {
  display: flex;
  gap: 8px;
}

.api-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.api-type-btn:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.api-type-btn.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
  color: var(--text);
}

.api-type-btn svg {
  flex-shrink: 0;
}

/* Dropdown divider and add button */
.dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}

.add-provider-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-provider-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

.add-provider-btn svg {
  flex-shrink: 0;
}

/* Enable toggle in dropdown option */
.option-enable-toggle {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.option-enable-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.mini-toggle-switch {
  width: 32px;
  height: 18px;
  background: var(--border);
  border-radius: 9px;
  position: relative;
  transition: background 0.2s ease;
}

.mini-toggle-switch::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.option-enable-toggle input:checked + .mini-toggle-switch {
  background: var(--accent);
}

.option-enable-toggle input:checked + .mini-toggle-switch::after {
  transform: translateX(14px);
}

/* Edit button in dropdown option */
.option-edit-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
  flex-shrink: 0;
  opacity: 0;
}

.custom-select-option:hover .option-edit-btn {
  opacity: 1;
}

.option-edit-btn:hover {
  background: var(--hover);
  color: var(--text);
}

/* Danger button */
.btn.danger {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}

/* Dialog actions with left/right split */
.custom-provider-dialog .dialog-actions {
  justify-content: space-between;
}

.dialog-actions-right {
  display: flex;
  gap: 10px;
}

/* Save Success Toast */
.save-toast {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--accent);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
  z-index: 100;
}

.save-toast svg {
  flex-shrink: 0;
}

/* Toast transition */
.toast-enter-active {
  animation: toast-in 0.3s ease;
}

.toast-leave-active {
  animation: toast-out 0.3s ease;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
}

/* Tools Tab Styles */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  background-color: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 24px;
  transition: all 0.2s ease;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.toggle.small .toggle-slider::before {
  height: 14px;
  width: 14px;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
  border-color: var(--accent);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background-color: white;
}

.toggle.small input:checked + .toggle-slider::before {
  transform: translateX(16px);
}

.toggle input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-hint {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  background: var(--surface-hover);
  border-radius: 8px;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: var(--surface-hover);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tool-name {
  font-weight: 500;
  color: var(--text);
}

.tool-category {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.tool-category.custom {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.tool-description {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  line-height: 1.4;
}

.tool-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.tool-controls .toggle-row {
  gap: 8px;
}

.control-label {
  font-size: 12px;
  color: var(--muted);
  min-width: 80px;
}
</style>
