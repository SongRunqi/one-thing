#!/usr/bin/env node
/**
 * Settings Migration Script
 *
 * Migrates old settings.json format to the new format with modelRegistry support.
 * Run this script once after upgrading to the new version.
 *
 * Usage:
 *   node scripts/migrate-settings.mjs
 *
 * What this does:
 * 1. Reads old settings.json (from {userData}/data/settings.json)
 * 2. Reads old models-dev-cache.json and models-cache.json
 * 3. Merges model data into settings.json under ai.modelRegistry
 * 4. Optionally fetches fresh model data from models.dev API
 * 5. Writes back the updated settings.json
 */

import { homedir } from 'os';
import { join, dirname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

// Resolve settings path — uses ~/.onething
function getSettingsPath() {
  return join(homedir(), '.onething', 'settings.json');
}

function getModelsDevCachePath() {
  return join(dirname(getSettingsPath()), 'models-dev-cache.json');
}

function getModelsCachePath() {
  return join(dirname(getSettingsPath()), 'models-cache.json');
}

async function main() {
  const settingsPath = getSettingsPath();
  console.log(`Settings path: ${settingsPath}`);

  // Read current settings
  let settings;
  try {
    const content = readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(content);
    console.log('✓ Read settings.json');
  } catch (e) {
    console.error('✗ Could not read settings.json. Nothing to migrate.');
    process.exit(1);
  }

  // Check if already migrated
  if (settings.ai?.modelRegistry?.lastFetched) {
    console.log('✓ Settings already have modelRegistry. No migration needed.');
    return;
  }

  // Try to read old models-dev-cache.json
  let modelsDevCache = null;
  const modelsDevCachePath = getModelsDevCachePath();
  try {
    const content = readFileSync(modelsDevCachePath, 'utf-8');
    modelsDevCache = JSON.parse(content);
    console.log('✓ Read models-dev-cache.json');
  } catch (e) {
    console.log('  (no models-dev-cache.json found)');
  }

  // Try to read old models-cache.json
  let modelsCache = null;
  const modelsCachePath = getModelsCachePath();
  try {
    const content = readFileSync(modelsCachePath, 'utf-8');
    modelsCache = JSON.parse(content);
    console.log('✓ Read models-cache.json');
  } catch (e) {
    console.log('  (no models-cache.json found)');
  }

  // Migrate models-dev-cache into modelRegistry
  if (modelsDevCache && modelsDevCache.allModels?.length > 0) {
    settings.ai = settings.ai || {};
    settings.ai.modelRegistry = {
      lastFetched: modelsDevCache.lastFetched || Date.now(),
      modelsByProvider: modelsDevCache.modelsByProvider || {},
      allModels: modelsDevCache.allModels || [],
      _rawModelsByProvider: modelsDevCache.rawModelsByProvider || undefined,
    };
    console.log(`✓ Migrated ${modelsDevCache.allModels.length} models from models-dev-cache.json`);
  } else {
    console.log('  No models-dev-cache data to migrate.');
  }

  // Write back
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  console.log('✓ Saved migrated settings.json');

  console.log('\nMigration complete!');
  console.log('You can now delete the old cache files if they still exist:');
  console.log(`  rm ${modelsDevCachePath}`);
  console.log(`  rm ${modelsCachePath}`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
