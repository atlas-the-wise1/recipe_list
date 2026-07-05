#!/usr/bin/env node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const RECIPE_ROOT = path.join(ROOT, 'recipes');
const RECIPE_INDEX = path.join(ROOT, 'indexes', 'recipes.json');
const PLANNER_CONFIG = path.join(ROOT, 'config', 'healthy-chef.json');
const MEAL_PLAN_ROOT = path.join(ROOT, 'meal-plans');
const SHOPPING_ROOT = path.join(ROOT, 'shopping-lists');

const args = process.argv.slice(2);
const mode = args[0] || 'all';

function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function loadPlannerConfig() {
  const fallback = {
    version: 1,
    signal_rules: {
      healthy: [7, 10],
      balanced: [5, 6],
      treat: [0, 4],
    },
    slot_constraints: {
      snack_1: {
        exclude_tags: ['alcohol', 'condiment', 'sauce', 'component'],
        calories_kcal: { min: 100, max: 300 },
      },
      lunch: {
        protein_g: { min: 25 },
        calories_kcal: { min: 350, max: 700 },
      },
      snack_2: {
        exclude_tags: ['alcohol', 'condiment', 'sauce', 'component'],
        protein_g: { min: 5 },
      },
      dinner: {
        protein_g: { min: 30 },
      },
      dessert: {
        max_days_per_week: 4,
      },
    },
    daily_targets: {
      calories_kcal: { min: 1800, max: 2200 },
      protein_g: { min: 120 },
      fiber_g: { min: 25 },
      sodium_mg: { max: 2300 },
    },
    leftovers: {
      enabled: true,
      batch_lunch_days: ['Tuesday', 'Friday'],
      batch_dinner_days: ['Monday', 'Thursday'],
    },
    inventory: {
      alias_groups: [
        { canonical: 'olive-oil', aliases: ['extra-virgin-olive-oil'] },
        { canonical: 'salt', aliases: ['kosher-salt'] },
        { canonical: 'black-pepper', aliases: ['freshly-ground-black-pepper', 'freshly-cracked-black-pepper', 'peppercorns'] },
      ],
      feedback: {
        path: 'meal-plans/healthy-chef-feedback.jsonl',
        weights: {
          liked: 1,
          too_much_work: -1.5,
          skip_tonight: -2,
          swap_meal: -1,
          too_expensive: -1,
          ingredient_unavailable: -0.5,
          portion_too_small: -0.5,
          portion_too_large: -0.5,
        },
      },
      pantry: {},
      freezer: {},
      use_soon_days: 7,
      stale_after_days: 14,
    },
  };

  if (!fs.existsSync(PLANNER_CONFIG)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(PLANNER_CONFIG, 'utf8'));
    return {
      ...fallback,
      ...parsed,
      signal_rules: { ...fallback.signal_rules, ...(parsed.signal_rules || {}) },
      slot_constraints: { ...fallback.slot_constraints, ...(parsed.slot_constraints || {}) },
      daily_targets: { ...fallback.daily_targets, ...(parsed.daily_targets || {}) },
      leftovers: { ...fallback.leftovers, ...(parsed.leftovers || {}) },
      inventory: {
        ...fallback.inventory,
        ...(parsed.inventory || {}),
        pantry: {
          ...(parsed.pantry_inventory || {}),
          ...((parsed.inventory && parsed.inventory.pantry) || {}),
        },
        freezer: {
          ...((parsed.inventory && parsed.inventory.freezer) || {}),
          ...(parsed.freezer_inventory || {}),
        },
      },
    };
  } catch (error) {
    return fallback;
  }
}

function walkMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(fullPath));
    } else if (
      entry.isFile() &&
      fullPath.endsWith('.md') &&
      path.basename(fullPath).toLowerCase() !== 'readme.md'
    ) {
      out.push(fullPath);
    }
  }
  return out;
}

function clean(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weekLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const week = Math.floor((date.getDate() - 1) / 7) + 1;
  return `${year}-${month}-week${week}`;
}

function scoreSignal(score) {
  if (score == null || Number.isNaN(score)) {
    return { label: 'unscored', emoji: '⬜', bucket: 'unscored' };
  }
  if (score >= 7) {
    return { label: 'healthy', emoji: '✅', bucket: 'healthy' };
  }
  if (score >= 5) {
    return { label: 'balanced', emoji: '⚖️', bucket: 'balanced' };
  }
  return { label: 'treat', emoji: '🍰', bucket: 'treat' };
}

function normalizeCategory(raw, filePath) {
  const fallback = path.basename(path.dirname(filePath)).toLowerCase();
  const source = clean(raw || fallback).toLowerCase();
  if (source.includes('breakfast')) return 'breakfast';
  if (source.includes('lunch')) return 'lunch';
  if (source.includes('dinner')) return 'dinner';
  if (source.includes('meal-prep')) return 'meal-prep';
  if (source.includes('snack')) return 'snacks';
  if (source.includes('drink')) return 'drinks';
  return fallback;
}

function asNumber(value) {
  return value == null || value === '' ? null : Number(value);
}

function isTruthyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function recipeScore(recipe) {
  const score = recipe?.adjustedScore ?? recipe?.score ?? null;
  return score == null || Number.isNaN(Number(score)) ? null : Number(score);
}

function parseInventoryKey(key) {
  const [ingredientId = '', unit = ''] = String(key || '').split('|');
  return {
    ingredientId: clean(ingredientId) || '',
    unit: clean(unit) || '',
  };
}

function buildAliasLookup(aliasGroups = []) {
  const lookup = new Map();
  for (const group of aliasGroups || []) {
    let canonical = null;
    let aliases = [];

    if (Array.isArray(group)) {
      [canonical, ...aliases] = group;
    } else if (group && typeof group === 'object') {
      canonical = group.canonical || group.id || group.name || null;
      aliases = Array.isArray(group.aliases) ? group.aliases : Array.isArray(group.ingredients) ? group.ingredients : [];
    }

    canonical = slugify(canonical || '');
    if (!canonical) continue;

    const entries = [canonical, ...aliases.map((alias) => slugify(alias)).filter(Boolean)];
    for (const alias of entries) {
      lookup.set(alias, canonical);
    }
  }
  return lookup;
}

function canonicalIngredientId(value, aliasLookup = new Map()) {
  const key = slugify(value || '');
  if (!key) return '';
  return aliasLookup.get(key) || key;
}

function canonicalInventoryKey(key, aliasLookup = new Map()) {
  const { ingredientId, unit } = parseInventoryKey(key);
  return pantryKey(canonicalIngredientId(ingredientId, aliasLookup), unit);
}

function mergeInventoryEntry(target, entry) {
  const merged = { ...target };
  merged.quantity = (Number(merged.quantity) || 0) + (Number(entry.quantity) || 0);
  merged.unit = merged.unit || entry.unit || null;

  if (!merged.expires_on || (entry.expires_on && merged.expires_on > entry.expires_on)) {
    merged.expires_on = entry.expires_on || merged.expires_on || null;
  }
  if (!merged.last_checked || (entry.last_checked && merged.last_checked > entry.last_checked)) {
    merged.last_checked = entry.last_checked || merged.last_checked || null;
  }
  if (merged.checked == null) {
    merged.checked = entry.checked == null ? null : Boolean(entry.checked);
  } else if (entry.checked != null) {
    merged.checked = Boolean(merged.checked && entry.checked);
  }
  if (!merged.notes) {
    merged.notes = entry.notes || null;
  }
  return merged;
}

function formatNutritionValue(value, unit) {
  if (value == null || Number.isNaN(Number(value))) return 'TBD';
  const rounded = Math.round(Number(value));
  return `${rounded}${unit}`;
}

function mealNutrition(recipe, servings = 1) {
  const nutrition = recipe.nutrition || {};
  const scale = servings || 1;
  return {
    calories_kcal: nutrition.calories_kcal == null ? null : nutrition.calories_kcal * scale,
    protein_g: nutrition.protein_g == null ? null : nutrition.protein_g * scale,
    fiber_g: nutrition.fiber_g == null ? null : nutrition.fiber_g * scale,
    sodium_mg: nutrition.sodium_mg == null ? null : nutrition.sodium_mg * scale,
  };
}

function sumNutrition(values) {
  const totals = {
    calories_kcal: 0,
    protein_g: 0,
    fiber_g: 0,
    sodium_mg: 0,
  };
  const presentCounts = {
    calories_kcal: 0,
    protein_g: 0,
    fiber_g: 0,
    sodium_mg: 0,
  };
  const missing = new Set();
  for (const item of values) {
    for (const field of Object.keys(totals)) {
      if (item[field] == null || Number.isNaN(Number(item[field]))) {
        missing.add(field);
      } else {
        totals[field] += Number(item[field]);
        presentCounts[field] += 1;
      }
    }
  }
  return {
    totals,
    presentCounts,
    missing: [...missing].sort(),
  };
}

function formatTotals(totals, presentCounts = {}) {
  return {
    calories_kcal: presentCounts.calories_kcal ? formatNutritionValue(totals.calories_kcal, ' kcal') : 'TBD',
    protein_g: presentCounts.protein_g ? formatNutritionValue(totals.protein_g, ' g') : 'TBD',
    fiber_g: presentCounts.fiber_g ? formatNutritionValue(totals.fiber_g, ' g') : 'TBD',
    sodium_mg: presentCounts.sodium_mg ? formatNutritionValue(totals.sodium_mg, ' mg') : 'TBD',
  };
}

function hasCompleteNutrition(recipe) {
  const nutrition = recipe.nutrition || {};
  return ['calories_kcal', 'protein_g', 'fiber_g', 'sodium_mg'].every((field) => nutrition[field] != null);
}

function missingNutritionFields(recipe) {
  const nutrition = recipe.nutrition || {};
  return ['calories_kcal', 'protein_g', 'fiber_g', 'sodium_mg'].filter((field) => nutrition[field] == null);
}

function slotMatchesConstraints(recipe, slotConstraints = {}) {
  const nutrition = recipe.nutrition || {};
  const tags = `${recipe.name} ${recipe.category} ${(recipe.tags || []).join(' ')} ${(recipe.meal_types || []).join(' ')} ${(recipe.ingredients || [])
    .map((item) => `${item.display || item.name || ''} ${item.grocery_department || ''}`)
    .join(' ')}`.toLowerCase();

  const excludeTags = slotConstraints.exclude_tags || [];
  for (const tag of excludeTags) {
    if (
      (tag === 'alcohol' && isAlcoholRecipe(recipe)) ||
      (tag === 'condiment' && isCondimentRecipe(recipe)) ||
      (tag === 'sauce' && isCondimentRecipe(recipe)) ||
      (tag === 'component' && isComponentRecipe(recipe)) ||
      (isTruthyString(tag) && tags.includes(tag.toLowerCase()))
    ) {
      return false;
    }
  }

  for (const [field, range] of Object.entries(slotConstraints)) {
    if (field === 'exclude_tags' || field === 'max_days_per_week') continue;
    const value = nutrition[field];
    if (range && typeof range === 'object') {
      if (range.min != null && (value == null || value < range.min)) return false;
      if (range.max != null && (value == null || value > range.max)) return false;
    }
  }

  return true;
}

function pantryKey(ingredientId, unit) {
  return `${ingredientId || ''}|${unit || ''}`;
}

function normalizeInventoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const quantity = Number(entry.quantity);
  return {
    quantity: Number.isNaN(quantity) ? 0 : quantity,
    unit: entry.unit || null,
    expires_on: isTruthyString(entry.expires_on) ? clean(entry.expires_on) : null,
    last_checked: isTruthyString(entry.last_checked) ? clean(entry.last_checked) : null,
    checked: entry.checked == null ? null : Boolean(entry.checked),
    notes: isTruthyString(entry.notes) ? clean(entry.notes) : null,
  };
}

function normalizeInventoryMap(rawInventory, aliasLookup = new Map()) {
  const out = {};
  for (const [key, value] of Object.entries(rawInventory || {})) {
    const normalized = normalizeInventoryEntry(value);
    if (normalized) {
      const canonicalKey = canonicalInventoryKey(key, aliasLookup);
      out[canonicalKey] = out[canonicalKey] ? mergeInventoryEntry(out[canonicalKey], normalized) : normalized;
    }
  }
  return out;
}

function lookupInventoryQuantity(inventory, ingredient) {
  const entry = inventory[pantryKey(ingredient.ingredient_id, ingredient.unit)];
  if (!entry) return { pantryQuantity: 0, pantryUnit: ingredient.unit || null };
  const pantryQuantity = Number(entry.quantity);
  if (Number.isNaN(pantryQuantity)) return { pantryQuantity: 0, pantryUnit: entry.unit || ingredient.unit || null };
  return {
    pantryQuantity,
    pantryUnit: entry.unit || ingredient.unit || null,
    expires_on: entry.expires_on || null,
    last_checked: entry.last_checked || null,
    checked: entry.checked,
    notes: entry.notes || null,
  };
}

function parseIsoDate(value) {
  if (!isTruthyString(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date, reference = new Date()) {
  const parsed = parseIsoDate(date);
  if (!parsed) return null;
  const diff = parsed.getTime() - reference.getTime();
  return Math.ceil(diff / 86400000);
}

function formatInventoryDate(date) {
  const parsed = parseIsoDate(date);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildInventoryViews(config) {
  const inventory = config.inventory || {};
  const aliasLookup = buildAliasLookup(inventory.alias_groups || []);
  return {
    pantry: normalizeInventoryMap(inventory.pantry || {}, aliasLookup),
    freezer: normalizeInventoryMap(inventory.freezer || {}, aliasLookup),
    useSoonDays: Number.isFinite(Number(inventory.use_soon_days)) ? Number(inventory.use_soon_days) : 7,
    staleAfterDays: Number.isFinite(Number(inventory.stale_after_days)) ? Number(inventory.stale_after_days) : 14,
    aliasLookup,
    feedback: inventory.feedback || {},
  };
}

function selectInventoryMatch(inventories, ingredient) {
  const canonicalIngredient = {
    ...ingredient,
    ingredient_id: canonicalIngredientId(ingredient.ingredient_id, inventories.aliasLookup),
  };
  const pantry = lookupInventoryQuantity(inventories.pantry, canonicalIngredient);
  const freezer = lookupInventoryQuantity(inventories.freezer, canonicalIngredient);
  return { pantry, freezer };
}

function inventoryStatusLabel(entry, now = new Date(), staleAfterDays = 14) {
  const expiresIn = daysUntil(entry.expires_on, now);
  const lastChecked = daysUntil(entry.last_checked, now);
  const stale = lastChecked != null && lastChecked > staleAfterDays;
  const soon = expiresIn != null && expiresIn <= 0 ? 'expired' : expiresIn != null && expiresIn <= 7 ? 'use soon' : null;
  const fragments = [];
  if (entry.expires_on) fragments.push(`expires ${formatInventoryDate(entry.expires_on)}`);
  if (expiresIn != null) fragments.push(`${expiresIn}d`);
  if (stale) fragments.push('stale');
  if (soon) fragments.push(soon);
  return fragments.join(', ');
}

function buildIngredientUsageMap(selectedMeals, aliasLookup = new Map()) {
  const usage = new Map();
  for (const meal of selectedMeals) {
    for (const ingredient of meal.recipe.ingredients || []) {
      const key = pantryKey(canonicalIngredientId(ingredient.ingredient_id, aliasLookup), ingredient.unit);
      if (!usage.has(key)) usage.set(key, []);
      usage.get(key).push(meal.label || meal.sourceLabel || `${meal.dayName} ${meal.slot}: ${meal.recipe.name}`);
    }
  }
  return usage;
}

function buildUseSoonItems(selectedMeals, config) {
  const inventories = buildInventoryViews(config);
  const ingredientUsage = buildIngredientUsageMap(selectedMeals, inventories.aliasLookup);
  const useSoonItems = [];

  for (const [key, entry] of Object.entries(inventories.pantry)) {
    const expiresIn = daysUntil(entry.expires_on);
    if (expiresIn == null || expiresIn > inventories.useSoonDays) continue;
    const { ingredientId, unit } = parseInventoryKey(key);
    const refs = ingredientUsage.get(key) || [];
    useSoonItems.push({
      ingredient_id: ingredientId || null,
      name: ingredientId ? ingredientId.replace(/-/g, ' ') : key,
      quantity: entry.quantity,
      unit: entry.unit || unit || null,
      expires_on: formatInventoryDate(entry.expires_on),
      expires_in: expiresIn,
      refs: [...new Set(refs)],
    });
  }

  return useSoonItems.sort((a, b) => (a.expires_in - b.expires_in) || a.name.localeCompare(b.name));
}

function parseRecipe(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const name = clean(text.match(/^#\s+(.+)$/m)?.[1] || path.basename(filePath, '.md'));
  const category = normalizeCategory(text.match(/^\*\*Category:\*\*\s*(.+)$/m)?.[1], filePath);
  const scoreMatch = text.match(/^\*\*Health Score:\*\*\s*(\d+)\/10$/m);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  const tagLine = clean(text.match(/^\*\*Tags:\*\*\s*(.+)$/m)?.[1] || '');
  const tags = tagLine
    ? tagLine
        .split(/\s+/)
        .map((item) => item.trim().replace(/[`,]/g, ''))
        .filter(Boolean)
    : [];
  const ingredientsBlock = text.match(/## Ingredients\s*\n([\s\S]*?)(?:\n## |\n---|\n$)/m)?.[1] || '';
  const ingredients = ingredientsBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => clean(line.replace(/^-+\s*/, '')));
  return {
    filePath,
    name,
    slug: path.basename(filePath, '.md'),
    category,
    score,
    signal: scoreSignal(score),
    tags,
    ingredients,
  };
}

function normalizeIngredientRecord(ingredient) {
  return {
    display: clean(ingredient.display || ingredient.name || ''),
    name: clean(ingredient.name || ingredient.display || ''),
    ingredient_id: clean(ingredient.ingredient_id || slugify(ingredient.name || ingredient.display || '')),
    quantity: ingredient.quantity == null ? null : Number(ingredient.quantity),
    unit: ingredient.unit == null ? null : clean(ingredient.unit) || null,
    preparation: ingredient.preparation == null ? null : clean(ingredient.preparation) || null,
    optional: Boolean(ingredient.optional),
    grocery_department: clean(ingredient.grocery_department || 'uncategorized') || 'uncategorized',
  };
}

function normalizeRecipeFromIndex(entry) {
  const filePath = path.join(ROOT, entry.path || `recipes/${entry.id}.md`);
  const score = entry.health_score == null ? null : Number(entry.health_score);
  return {
    filePath,
    name: clean(entry.title || entry.id),
    slug: entry.id,
    category: normalizeCategory(entry.category, filePath),
    score,
    signal: scoreSignal(score),
    tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
    meal_types: Array.isArray(entry.meal_types) ? entry.meal_types.slice() : [],
    servings: entry.servings == null ? 1 : Number(entry.servings) || 1,
    ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map(normalizeIngredientRecord) : [],
    mealPrepFriendly: Boolean(entry.meal_prep_friendly),
    nutrition_verified: Boolean(entry.nutrition_verified),
    nutrition: {
      calories_kcal: entry.calories_kcal ?? null,
      protein_g: entry.protein_g ?? null,
      fiber_g: entry.fiber_g ?? null,
      sodium_mg: entry.sodium_mg ?? null,
    },
    raw: entry,
  };
}

function loadRecipes() {
  if (fs.existsSync(RECIPE_INDEX)) {
    try {
      const index = JSON.parse(fs.readFileSync(RECIPE_INDEX, 'utf8'));
      if (Array.isArray(index)) {
        return index.map(normalizeRecipeFromIndex).sort(sortByScoreThenName);
      }
    } catch (error) {
      // Fall back to markdown parsing if the committed index is unavailable or malformed.
    }
  }

  const files = walkMarkdownFiles(RECIPE_ROOT);
  return files.map(parseRecipe).sort(sortByScoreThenName);
}

function loadFeedbackState(config) {
  const inventory = config.inventory || {};
  const feedbackConfig = inventory.feedback || {};
  const feedbackPath = feedbackConfig.path ? path.join(ROOT, feedbackConfig.path) : null;
  const weights = feedbackConfig.weights || {};
  const adjustments = new Map();
  const notes = [];

  if (!feedbackPath || !fs.existsSync(feedbackPath)) {
    return { adjustments, notes, path: feedbackPath, weights };
  }

  const lines = fs.readFileSync(feedbackPath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const recipeId = clean(event.recipe_id || event.recipeId || event.target?.recipe_id || '');
      if (!recipeId) continue;
      const type = clean(event.type || event.feedback || '').toLowerCase().replace(/\s+/g, '_');
      const weight = Number(event.weight);
      const delta = Number.isFinite(weight) ? weight : Number(weights[type] ?? 0);
      if (!Number.isFinite(delta) || delta === 0) continue;
      adjustments.set(recipeId, (adjustments.get(recipeId) || 0) + delta);
      if (isTruthyString(event.note || event.notes)) {
        notes.push({ recipeId, note: clean(event.note || event.notes), type, delta });
      }
    } catch (error) {
      continue;
    }
  }

  return { adjustments, notes, path: feedbackPath, weights };
}

function applyFeedbackAdjustments(recipes, feedbackState) {
  const adjustments = feedbackState?.adjustments || new Map();
  return recipes.map((recipe) => {
    const delta = adjustments.get(recipe.slug) || 0;
    const adjustedScore = recipe.score == null ? null : Math.max(0, Math.min(10, recipe.score + delta));
    return {
      ...recipe,
      feedbackDelta: delta,
      adjustedScore,
    };
  });
}

function sortByScoreThenName(a, b) {
  const aScore = recipeScore(a);
  const bScore = recipeScore(b);
  const aValue = aScore == null ? -1 : aScore;
  const bValue = bScore == null ? -1 : bScore;
  if (aValue !== bValue) return bValue - aValue;
  return a.name.localeCompare(b.name);
}

function groupRecipes(recipes) {
  const groups = new Map();
  for (const recipe of recipes) {
    const key = recipe.signal.bucket;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(recipe);
  }
  return groups;
}

function buildSignalIndex(recipes) {
  const groups = groupRecipes(recipes);
  const order = ['healthy', 'balanced', 'treat', 'unscored'];
  const summary = order
    .map((bucket) => `${bucket}: ${groups.get(bucket)?.length || 0}`)
    .join(' | ');

  const lines = [];
  lines.push('# Health Signal Index');
  lines.push('');
  lines.push('Generated by `scripts/healthy-chef.mjs`.');
  lines.push('');
  lines.push('## Signal Rules');
  lines.push('- `7-10` = healthy');
  lines.push('- `5-6` = balanced');
  lines.push('- `0-4` = treat');
  lines.push('- missing score = unscored');
  lines.push('');
  lines.push(`**Summary:** ${summary}`);
  lines.push('');

  const titles = {
    healthy: 'Healthy',
    balanced: 'Balanced',
    treat: 'Treat',
    unscored: 'Unscored',
  };

  for (const bucket of order) {
    const items = (groups.get(bucket) || []).slice().sort(sortByScoreThenName);
    lines.push(`## ${titles[bucket]} (${items.length})`);
    lines.push('');
    lines.push('| Score | Signal | Recipe | Category | Use |');
    lines.push('|---|---|---|---|---|');
    for (const recipe of items) {
      const scoreText = recipeScore(recipe) == null ? 'TBD' : `${recipeScore(recipe)}/10`;
      const use =
        bucket === 'healthy'
          ? 'weekly staple'
          : bucket === 'balanced'
            ? 'rotate in'
            : bucket === 'treat'
              ? 'limit / occasional'
              : 'needs scoring';
      lines.push(
        `| ${scoreText} | ${recipe.signal.emoji} ${recipe.signal.label} | ${recipe.name} | ${recipe.category} | ${use} |`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function recipeLabel(recipe) {
  const score = recipeScore(recipe);
  return `${recipe.name} (${score == null ? 'TBD' : `${score}/10`}, ${recipe.signal.emoji} ${recipe.signal.label})`;
}

function takeTop(recipes, count, predicate = () => true) {
  return recipes
    .filter((recipe) => predicate(recipe))
    .slice()
    .sort(sortByScoreThenName)
    .slice(0, count);
}

function sortByScoreAscendingThenName(a, b) {
  const aScore = recipeScore(a);
  const bScore = recipeScore(b);
  const aValue = aScore == null ? -1 : aScore;
  const bValue = bScore == null ? -1 : bScore;
  if (aValue !== bValue) return aValue - bValue;
  return a.name.localeCompare(b.name);
}

function recipeSearchText(recipe) {
  const parts = [
    recipe.name,
    recipe.category,
    ...(recipe.tags || []),
    ...(recipe.meal_types || []),
    ...(recipe.ingredients || []),
  ];

  return parts
    .flatMap((part) => {
      if (!part) return [];
      if (typeof part === 'string') return [part];
      return [part.display, part.name, part.ingredient_id, part.preparation, part.grocery_department];
    })
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isAlcoholRecipe(recipe) {
  const text = recipeSearchText(recipe);
  return (
    recipe.category === 'drinks' ||
    /\b(vodka|rum|tequila|sake|sak[eé]|liqueur|margarita|martini|screwdriver|colada|wine|beer|bourbon|whiskey|gin|cocktail)\b/.test(
      text,
    )
  );
}

function isCondimentRecipe(recipe) {
  const text = recipeSearchText(recipe);
  return /\b(pesto|salsa|dip|dressing|sauce|marinade|aioli|vinaigrette|relish|spread|condiment|tapenade|chutney|glaze|seasoning|rub)\b/.test(
    text,
  );
}

function isComponentRecipe(recipe) {
  const text = recipeSearchText(recipe);
  return /\b(rotation|mix|base|starter|prep|batch|batter|dough|filling|topping|crust|frosting|icing|assembly|kit|board|bundle|set)\b/.test(
    text,
  );
}

function isDessertCandidate(recipe) {
  if (recipe.category !== 'snacks') return false;
  const text = recipeSearchText(recipe);
  return /dessert|ice cream|sorbet|granita|cake|cookie|cookies|pudding|brulee|split|crisp|treat|mousse|shake|smoothie/.test(
    text,
  );
}

function isSnackCandidate(recipe) {
  return recipe.category === 'snacks' && !isAlcoholRecipe(recipe) && !isCondimentRecipe(recipe) && !isComponentRecipe(recipe);
}

function lunchPreferenceScore(recipe) {
  const protein = recipe.nutrition?.protein_g;
  const calories = recipe.nutrition?.calories_kcal;
  const scoreValue = recipeScore(recipe);
  let score = 0;

  if (scoreValue != null) score += scoreValue * 10;
  if (recipe.signal.bucket === 'healthy') score += 40;
  if (recipe.signal.bucket === 'balanced') score += 15;

  if (protein != null) {
    score += Math.min(protein, 30) * 4;
    if (protein >= 15) score += 180;
    else if (protein >= 10) score += 140;
    else score -= 420;
  } else {
    score -= 160;
  }

  if (calories != null) {
    if (calories >= 250 && calories <= 700) score += 120;
    if (calories >= 300 && calories <= 650) score += 40;
    if (calories < 250) score -= 80;
    if (calories > 700) score -= 80;
  } else {
    score -= 60;
  }

  return score;
}

function sortLunchCandidates(a, b) {
  const aScore = lunchPreferenceScore(a);
  const bScore = lunchPreferenceScore(b);
  if (aScore !== bScore) return bScore - aScore;
  return sortByScoreThenName(a, b);
}

function buildCookbook(recipes) {
  const healthy = recipes.filter((recipe) => recipe.signal.bucket === 'healthy');
  const balanced = recipes.filter((recipe) => recipe.signal.bucket === 'balanced');

  const byCategory = {
    breakfast: healthy.filter((recipe) => recipe.category === 'breakfast'),
    lunch: healthy.filter((recipe) => recipe.category === 'lunch'),
    dinner: healthy.filter((recipe) => recipe.category === 'dinner'),
    snacks: healthy.filter((recipe) => recipe.category === 'snacks'),
    mealPrep: healthy.filter((recipe) => recipe.category === 'meal-prep'),
  };

  const quickDinnerKeywords = [
    'air-fryer',
    'air fryer',
    'bowl',
    'grilled',
    'one-pan',
    'one-pot',
    'sheet-pan',
    'sheet pan',
    'skillet',
    'soup',
    'stir fry',
    'teriyaki',
    'tilapia',
    'salmon',
    'meatballs',
    'chicken breast',
  ];

  const quickDinnerPool = takeTop(healthy, 12, (recipe) => {
    if (recipe.category !== 'dinner') return false;
    const lower = recipe.name.toLowerCase();
    return quickDinnerKeywords.some((keyword) => lower.includes(keyword));
  });

  const lines = [];
  lines.push('# Wedding Cut Cookbook');
  lines.push('');
  lines.push('Curated from the highest-signal recipes in the library.');
  lines.push('');
  lines.push('## Rules');
  lines.push('');
  lines.push('- `healthy` recipes are the default weekly picks.');
  lines.push('- `balanced` recipes are fallback options when a slot needs variety.');
  lines.push('- `treat` recipes stay out of the default rotation.');
  lines.push('- The planner can randomize by day or by week, then generate groceries automatically.');
  lines.push('');
  lines.push('## Core Healthy Picks');
  lines.push('');
  for (const category of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    const items = takeTop(byCategory[category], category === 'dinner' ? 12 : category === 'lunch' ? 8 : 5);
    if (!items.length) continue;
    lines.push(`### ${category[0].toUpperCase()}${category.slice(1)}`);
    lines.push('');
    for (const recipe of items) {
      lines.push(`- ${recipeLabel(recipe)}`);
    }
    lines.push('');
  }

  if (byCategory.mealPrep.length) {
    lines.push('### Meal Prep Anchors');
    lines.push('');
    for (const recipe of takeTop(byCategory.mealPrep, 4)) {
      lines.push(`- ${recipeLabel(recipe)}`);
    }
    lines.push('');
  }

  if (quickDinnerPool.length) {
    lines.push('## Quick Dinner Pool');
    lines.push('');
    lines.push('Use these when the goal is a fast, low-friction dinner on a cut.');
    lines.push('');
    for (const recipe of quickDinnerPool) {
      lines.push(`- ${recipeLabel(recipe)}`);
    }
    lines.push('');
  }

  if (balanced.length) {
    lines.push('## Balanced Backups');
    lines.push('');
    for (const recipe of takeTop(balanced, 8, (item) => item.category === 'dinner')) {
      lines.push(`- ${recipeLabel(recipe)}`);
    }
    lines.push('');
  }

  lines.push('## Weekly Use');
  lines.push('');
  lines.push('- Pick one breakfast anchor, one lunch anchor, and two or three quick dinners for the week.');
  lines.push('- Let the weekly planner generate the full day-by-day menu and grocery list from the selected pool.');
  lines.push('- If a dinner needs to be especially fast, prefer the quick-dinner pool first.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function chooseRecipe(pool, used, rand, options = {}) {
  const minScore = options.minScore ?? 0;
  const maxScore = options.maxScore ?? 10;
  const preferredBuckets = options.preferredBuckets || ['healthy', 'balanced', 'treat'];
  const candidates = pool.filter((recipe) => {
    if (used.has(recipe.filePath)) return false;
    const score = recipeScore(recipe);
    if (score == null) return false;
    if (score < minScore || score > maxScore) return false;
    return preferredBuckets.includes(recipe.signal.bucket);
  });

  if (!candidates.length) return null;

  const weighted = candidates.map((recipe) => {
    const bucketWeight =
      recipe.signal.bucket === 'healthy' ? 3 : recipe.signal.bucket === 'balanced' ? 1.5 : 0.6;
    const score = recipeScore(recipe) ?? 0;
    return { recipe, weight: Math.max(0.1, score * bucketWeight) };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) {
      used.add(item.recipe.filePath);
      return item.recipe;
    }
  }

  const fallback = weighted[weighted.length - 1].recipe;
  used.add(fallback.filePath);
  return fallback;
}

function chooseRecipeWithFallback(pool, used, rand, options = {}) {
  const thresholds = options.thresholds || [7, 5, 0];
  for (const minScore of thresholds) {
    const pick = chooseRecipe(pool, used, rand, { ...options, minScore });
    if (pick) return pick;
  }
  return null;
}

function sectionForDepartment(department, ingredientText = '') {
  const dep = clean(department || '').toLowerCase();
  if (dep === 'produce') return 'Produce';
  if (dep === 'meat' || dep === 'seafood' || dep === 'proteins') return 'Proteins';
  if (dep === 'dairy') return 'Dairy';
  if (dep === 'frozen') return 'Frozen';
  if (dep === 'beverages') return 'Beverages';
  if (dep === 'spices') return 'Spices';
  if (dep === 'condiments' || dep === 'pantry' || dep === 'grains' || dep === 'uncategorized') {
    return 'Pantry';
  }

  const lower = ingredientText.toLowerCase();
  if (
    /\b(chicken|turkey|beef|pork|lamb|fish|salmon|cod|tilapia|tuna|swordfish|shrimp|steak|tofu|eggs?|egg whites?|rotisserie chicken|deli turkey|sausage|ham|bacon|cottage cheese|greek yogurt|yogurt|cheese|mozzarella|feta|halloumi|ricotta|parmesan|goat cheese)\b/.test(
      lower,
    )
  ) {
    return 'Proteins';
  }
  if (
    /\b(butter|milk|cream|sour cream|cream cheese|yogurt|cottage cheese|cheese|mozzarella|feta|halloumi|ricotta|parmesan|goat cheese|half-and-half|whipping cream)\b/.test(
      lower,
    )
  ) {
    return 'Dairy';
  }
  if (
    /\b(salt|pepper|paprika|cumin|cinnamon|turmeric|chili|oregano|thyme|rosemary|cardamom|coriander|ginger powder|red pepper flakes|spice|seasoning|miso|sesame)\b/.test(
      lower,
    )
  ) {
    return 'Spices';
  }
  return 'Pantry';
}

function ingredientSortKey(item) {
  return `${item.name || item.display || item.ingredient_id}`.toLowerCase();
}

function formatQuantity(value) {
  if (value == null) return null;
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function formatQuantityWithUnit(value, unit, fallback = 'as needed') {
  if (value == null) return fallback;
  const amount = formatQuantity(value);
  return unit ? `${amount} ${unit}` : amount;
}

function ingredientKey(ingredient, aliasLookup = new Map()) {
  return [
    canonicalIngredientId(ingredient.ingredient_id || slugify(ingredient.name || ingredient.display || ''), aliasLookup),
    ingredient.unit || 'unitless',
    ingredient.preparation || '',
    ingredient.grocery_department || 'uncategorized',
  ].join('|');
}

function buildShoppingList(selectedMeals, config) {
  const sections = new Map([
    ['Produce', new Map()],
    ['Proteins', new Map()],
    ['Dairy', new Map()],
    ['Frozen', new Map()],
    ['Beverages', new Map()],
    ['Pantry', new Map()],
    ['Spices', new Map()],
  ]);
  const inventories = buildInventoryViews(config);
  const ingredientUsage = buildIngredientUsageMap(selectedMeals, inventories.aliasLookup);
  let requiredItemCount = 0;
  let pantryCoveredCount = 0;
  let freezerCoveredCount = 0;
  const inventoryWatch = [];
  const useSoonItems = [];

  for (const meal of selectedMeals) {
    const recipe = meal.recipe;
    const recipeServings = recipe.servings || 1;
    const plannedServings = meal.shoppingServings == null ? 1 : meal.shoppingServings;
    if (plannedServings <= 0) continue;
    const scale = plannedServings / recipeServings;

    for (const ingredient of recipe.ingredients || []) {
      const dept = sectionForDepartment(ingredient.grocery_department, ingredient.display || ingredient.name);
      const bucket = sections.get(dept) || sections.get('Pantry');
      const key = ingredientKey(ingredient, inventories.aliasLookup);
      const scaledQuantity = ingredient.quantity == null ? null : ingredient.quantity * scale;

      if (!bucket.has(key)) {
        requiredItemCount += 1;
        bucket.set(key, {
          ingredient_id: ingredient.ingredient_id,
          name: ingredient.name || ingredient.display,
          display: ingredient.display || ingredient.name,
          unit: ingredient.unit || null,
          required_quantity: scaledQuantity,
          pantry_quantity: null,
          freezer_quantity: null,
          purchase_quantity: scaledQuantity,
          checked: false,
          recipes: [meal.label || meal.sourceLabel || `${meal.dayName} ${meal.slot}: ${recipe.name}`],
          department: dept,
        });
      } else {
        const entry = bucket.get(key);
        if (entry.required_quantity == null || scaledQuantity == null) {
          entry.required_quantity = entry.required_quantity == null ? scaledQuantity : entry.required_quantity;
        } else {
          entry.required_quantity += scaledQuantity;
        }
        entry.recipes.push(meal.label || meal.sourceLabel || `${meal.dayName} ${meal.slot}: ${recipe.name}`);
      }
    }
  }

  for (const bucket of sections.values()) {
    for (const item of bucket.values()) {
      const { pantry, freezer } = selectInventoryMatch(inventories, item);
      const pantryQuantity = pantry.pantryQuantity || 0;
      const freezerQuantity = freezer.pantryQuantity || 0;
      if (item.required_quantity != null && pantryQuantity > 0) {
        item.pantry_quantity = Math.min(item.required_quantity, pantryQuantity);
        if (item.pantry_quantity > 0) pantryCoveredCount += 1;
      } else {
        item.pantry_quantity = 0;
      }
      const remainingAfterPantry = item.required_quantity == null ? null : Math.max(0, item.required_quantity - item.pantry_quantity);
      if (remainingAfterPantry != null && freezerQuantity > 0) {
        item.freezer_quantity = Math.min(remainingAfterPantry, freezerQuantity);
        if (item.freezer_quantity > 0) freezerCoveredCount += 1;
      } else {
        item.freezer_quantity = 0;
      }
      if (item.required_quantity != null) {
        item.purchase_quantity = Math.max(0, item.required_quantity - item.pantry_quantity - item.freezer_quantity);
      }

      if (item.purchase_quantity > 0) {
        item.checked = false;
      } else {
        item.checked = true;
      }

      const pantryStatus = inventoryStatusLabel(pantry, new Date(), inventories.staleAfterDays);
      const freezerStatus = inventoryStatusLabel(freezer, new Date(), inventories.staleAfterDays);
      if (pantryStatus) {
        inventoryWatch.push({
          kind: 'pantry',
          name: item.display || item.name || item.ingredient_id,
          status: pantryStatus,
          quantity: pantry.pantryQuantity,
          unit: pantry.pantryUnit || item.unit || null,
        });
      }
      if (freezerStatus) {
        inventoryWatch.push({
          kind: 'freezer',
          name: item.display || item.name || item.ingredient_id,
          status: freezerStatus,
          quantity: freezer.pantryQuantity,
          unit: freezer.pantryUnit || item.unit || null,
        });
      }

      const ingredientKeyText = pantryKey(item.ingredient_id, item.unit);
      const usageRefs = ingredientUsage.get(ingredientKeyText) || [];
      const expiresSoonDays = daysUntil(pantry.expires_on);
      if (expiresSoonDays != null && expiresSoonDays <= inventories.useSoonDays && pantry.pantryQuantity > 0) {
        useSoonItems.push({
          name: item.display || item.name || item.ingredient_id,
          quantity: pantry.pantryQuantity,
          unit: pantry.pantryUnit || item.unit || null,
          expires_on: formatInventoryDate(pantry.expires_on),
          expires_in: expiresSoonDays,
          refs: usageRefs,
        });
      }
    }
  }

  const lines = [];
  lines.push('# Shopping List');
  lines.push('');
  lines.push('Generated from the weekly meal plan.');
  lines.push('');
  lines.push(`**Items needing purchase:** ${requiredItemCount}`);
  lines.push(`**Items covered by pantry:** ${pantryCoveredCount}`);
  lines.push(`**Items covered by freezer:** ${freezerCoveredCount}`);
  lines.push('');

  if (useSoonItems.length) {
    lines.push('## Use Soon');
    lines.push('');
    lines.push('| Item | Quantity | Expires On | Days Left | Recipes |');
    lines.push('|---|---:|---|---:|---|');
    for (const item of useSoonItems.sort((a, b) => (a.expires_in - b.expires_in) || a.name.localeCompare(b.name))) {
      lines.push(
        `| ${item.name} | ${formatQuantityWithUnit(item.quantity, item.unit)} | ${item.expires_on || 'TBD'} | ${item.expires_in} | ${[...new Set(item.refs)].join(', ') || 'No direct overlap'} |`,
      );
    }
    lines.push('');
  }

  if (inventoryWatch.length) {
    lines.push('## Inventory Watch');
    lines.push('');
    lines.push('| Source | Item | Status |');
    lines.push('|---|---|---|');
    for (const item of inventoryWatch.slice(0, 12)) {
      lines.push(`| ${item.kind} | ${item.name} | ${item.status || 'ok'} |`);
    }
    if (inventoryWatch.length > 12) {
      lines.push(`| … | ${inventoryWatch.length - 12} more items | use the config inventory file for the rest |`);
    }
    lines.push('');
  }

  for (const [section, items] of sections.entries()) {
    if (!items.size) continue;
    lines.push(`## ${section}`);
    lines.push('');
    lines.push('| Item | Required | Pantry | Freezer | Buy | Checked | Recipes |');
    lines.push('|---|---:|---:|---:|---:|---|---|');
    const sorted = [...items.values()].sort((a, b) => ingredientSortKey(a).localeCompare(ingredientSortKey(b)));
    for (const item of sorted) {
      const refs = [...new Set(item.recipes)].join(', ');
      const display = item.display || item.name || item.ingredient_id;
      const requiredText = formatQuantityWithUnit(item.required_quantity, item.unit);
      const pantryText = formatQuantityWithUnit(item.pantry_quantity, item.unit, '0');
      const freezerText = formatQuantityWithUnit(item.freezer_quantity, item.unit, '0');
      const purchaseText = formatQuantityWithUnit(item.purchase_quantity, item.unit, '0');
      const checked = item.checked ? '☑' : '☐';
      lines.push(`| ${display} | ${requiredText} | ${pantryText} | ${freezerText} | ${purchaseText} | ${checked} | ${refs} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function chooseUnique(pool, count, used, comparator = sortByScoreThenName) {
  const chosen = [];
  const sorted = pool.slice().sort(comparator);
  for (const recipe of sorted) {
    if (used.has(recipe.filePath)) continue;
    chosen.push(recipe);
    used.add(recipe.filePath);
    if (chosen.length === count) break;
  }
  return chosen;
}

function chooseUniqueWithFallback(pool, count, used, comparator = sortByScoreThenName) {
  const chosen = chooseUnique(pool, count, used, comparator);
  if (chosen.length >= count) {
    return chosen;
  }

  const sorted = pool.slice().sort(comparator);
  for (const recipe of sorted) {
    if (chosen.length >= count) break;
    if (!chosen.includes(recipe)) {
      chosen.push(recipe);
    }
  }
  return chosen;
}

function buildWeeklyPlan(recipes, weekName, config) {
  const used = new Set();
  const clovis = recipes.find((recipe) => recipe.slug === 'clovis-farms-organic-super-smoothie');
  if (!clovis) {
    throw new Error('Missing required clovis-farms-organic-super-smoothie recipe');
  }
  used.add(clovis.filePath);

  const lunchConstraints = config.slot_constraints?.lunch || {};
  const dinnerConstraints = config.slot_constraints?.dinner || {};
  const snack1Constraints = config.slot_constraints?.snack_1 || {};
  const snack2Constraints = config.slot_constraints?.snack_2 || {};
  const dessertConstraints = config.slot_constraints?.dessert || {};

  const lunchPoolStrict = recipes.filter(
    (recipe) => recipe.category === 'lunch' && recipeScore(recipe) != null && slotMatchesConstraints(recipe, lunchConstraints),
  );
  const lunchPoolFallback = recipes.filter((recipe) => recipe.category === 'lunch' && recipeScore(recipe) != null);
  const lunchPool = lunchPoolStrict.length >= 5 ? lunchPoolStrict : lunchPoolFallback;

  const dinnerPoolStrict = recipes.filter(
    (recipe) => recipe.category === 'dinner' && recipeScore(recipe) != null && slotMatchesConstraints(recipe, dinnerConstraints),
  );
  const dinnerPoolFallback = recipes.filter((recipe) => recipe.category === 'dinner' && recipeScore(recipe) != null);
  const dinnerPool = dinnerPoolStrict.length >= 7 ? dinnerPoolStrict : dinnerPoolFallback;

  const snackPoolBase = recipes.filter((recipe) => isSnackCandidate(recipe) && recipeScore(recipe) != null);
  const snack1PoolStrict = snackPoolBase.filter((recipe) => slotMatchesConstraints(recipe, snack1Constraints));
  const snack2PoolStrict = snackPoolBase.filter((recipe) => slotMatchesConstraints(recipe, snack2Constraints));
  const snack1Pool = snack1PoolStrict.length >= 7 ? snack1PoolStrict : snackPoolBase;
  const snack2Pool = snack2PoolStrict.length >= 7 ? snack2PoolStrict : snackPoolBase;
  const dessertPool = recipes.filter(
    (recipe) =>
      isSnackCandidate(recipe) &&
      recipeScore(recipe) != null &&
      isDessertCandidate(recipe) &&
      slotMatchesConstraints(recipe, dessertConstraints),
  );
  const finishPool = recipes.filter(
    (recipe) => isSnackCandidate(recipe) && recipeScore(recipe) != null && !isDessertCandidate(recipe),
  );
  const mealPrepPool = recipes.filter(
    (recipe) => recipeScore(recipe) != null && (recipe.category === 'meal-prep' || recipe.tags.includes('#meal-prep')),
  );

  const batchDinnerPool = dinnerPool.filter(
    (recipe) =>
      recipe.mealPrepFriendly &&
      slotMatchesConstraints(recipe, lunchConstraints) &&
      slotMatchesConstraints(recipe, dinnerConstraints),
  );
  const batchDinners = chooseUnique(batchDinnerPool, 2, used, sortLunchCandidates);
  if (batchDinners.length < 2) {
    const supplemental = chooseUnique(
      dinnerPool.filter((recipe) => !batchDinners.includes(recipe)),
      2 - batchDinners.length,
      used,
      sortLunchCandidates,
    );
    batchDinners.push(...supplemental);
  }

  const dessertDays = new Set([0, 2, 4, 6]);
  const dessert = chooseUnique(dessertPool, dessertDays.size, new Set(used), sortByScoreAscendingThenName);
  const snack1 = chooseUnique(snack1Pool, 7, new Set(used), sortByScoreThenName);
  const snack2 = chooseUnique(snack2Pool, 7, new Set(used), sortByScoreAscendingThenName);
  for (const recipe of [...snack1, ...snack2]) {
    used.add(recipe.filePath);
  }
  for (const recipe of dessert) {
    used.add(recipe.filePath);
  }

  const regularLunches = chooseUnique(lunchPool, 5, used, sortLunchCandidates);
  const remainingDinners = chooseUnique(
    dinnerPool.filter((recipe) => !batchDinners.includes(recipe)),
    5,
    used,
    sortByScoreThenName,
  );
  const prepAnchors = chooseUnique(mealPrepPool, 2, used, sortByScoreThenName);

  if (
    snack1.length < 7 ||
    snack2.length < 7 ||
    regularLunches.length < 5 ||
    remainingDinners.length < 5 ||
    dessert.length < dessertDays.size
  ) {
    throw new Error('Unable to assemble a full 7-day weekly plan from the available recipe pools');
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const batchLunchDays = new Map([
    ['Tuesday', batchDinners[0] || null],
    ['Friday', batchDinners[1] || null],
  ]);
  const lunchSlots = new Map();
  let lunchIndex = 0;
  for (const dayName of days) {
    if (batchLunchDays.has(dayName)) {
      lunchSlots.set(dayName, { leftoverFrom: batchLunchDays.get(dayName) });
      continue;
    }
    lunchSlots.set(dayName, { recipe: regularLunches[lunchIndex] });
    lunchIndex += 1;
  }

  const dinnerSlots = new Map();
  let dinnerIndex = 0;
  for (const dayName of days) {
    if (dayName === 'Monday' && batchDinners[0]) {
      dinnerSlots.set(dayName, { recipe: batchDinners[0], shoppingServings: 2 });
      continue;
    }
    if (dayName === 'Thursday' && batchDinners[1]) {
      dinnerSlots.set(dayName, { recipe: batchDinners[1], shoppingServings: 2 });
      continue;
    }
    dinnerSlots.set(dayName, { recipe: remainingDinners[dinnerIndex], shoppingServings: 1 });
    dinnerIndex += 1;
  }

  const plan = days.map((dayName, index) => {
    const dessertSlot = dessertDays.has(index)
      ? { recipe: dessert[Math.floor(index / 2)], shoppingServings: 1 }
      : { recipe: finishPool[index % finishPool.length], shoppingServings: 1 };
    return {
      dayName,
      breakfast: { recipe: clovis, shoppingServings: 1 },
      snack1: { recipe: snack1[index], shoppingServings: 1 },
      lunch: lunchSlots.get(dayName),
      snack2: { recipe: snack2[index], shoppingServings: 1 },
      dinner: dinnerSlots.get(dayName),
      dessert: dessertSlot,
    };
  });

  const plannedMeals = [];
  for (const day of plan) {
    const dayLunch = day.lunch.leftoverFrom
      ? {
          dayName: day.dayName,
          slot: 'lunch',
          recipe: day.lunch.leftoverFrom,
          nutritionServings: 1,
          shoppingServings: 0,
          kind: 'leftover',
          sourceLabel: `${day.dayName} lunch: Leftover from ${day.lunch.leftoverFrom.name}`,
          leftoverFrom: day.lunch.leftoverFrom.name,
        }
      : {
          dayName: day.dayName,
          slot: 'lunch',
          recipe: day.lunch.recipe,
          nutritionServings: 1,
          shoppingServings: 1,
          kind: 'recipe',
          sourceLabel: `${day.dayName} lunch: ${day.lunch.recipe.name}`,
        };

    const dayDinner = {
      dayName: day.dayName,
      slot: 'dinner',
      recipe: day.dinner.recipe,
      nutritionServings: 1,
      shoppingServings: day.dinner.shoppingServings,
      kind: day.dinner.shoppingServings > 1 ? 'batch-recipe' : 'recipe',
      sourceLabel: `${day.dayName} dinner: ${day.dinner.recipe.name}`,
    };

    plannedMeals.push(
      {
        dayName: day.dayName,
        slot: 'breakfast',
        recipe: day.breakfast.recipe,
        nutritionServings: 1,
        shoppingServings: 1,
        kind: 'recipe',
        sourceLabel: `${day.dayName} breakfast: ${day.breakfast.recipe.name}`,
      },
      {
        dayName: day.dayName,
        slot: 'snack_1',
        recipe: day.snack1.recipe,
        nutritionServings: 1,
        shoppingServings: 1,
        kind: 'recipe',
        sourceLabel: `${day.dayName} snack 1: ${day.snack1.recipe.name}`,
      },
      dayLunch,
      {
        dayName: day.dayName,
        slot: 'snack_2',
        recipe: day.snack2.recipe,
        nutritionServings: 1,
        shoppingServings: 1,
        kind: 'recipe',
        sourceLabel: `${day.dayName} snack 2: ${day.snack2.recipe.name}`,
      },
      dayDinner,
      {
        dayName: day.dayName,
        slot: dessertDays.has(days.indexOf(day.dayName)) ? 'dessert' : 'finish',
        recipe: day.dessert.recipe,
        nutritionServings: 1,
        shoppingServings: 1,
        kind: 'recipe',
        sourceLabel: `${day.dayName} ${dessertDays.has(days.indexOf(day.dayName)) ? 'dessert' : 'finish'}: ${day.dessert.recipe.name}`,
      },
    );
  }

  const dailySummaries = days.map((dayName) => {
    const meals = plannedMeals.filter((meal) => meal.dayName === dayName);
    const mealNutritions = meals.map((meal) => mealNutrition(meal.recipe, meal.nutritionServings || 1));
    const rollup = sumNutrition(mealNutritions);
    const completeMeals = meals.filter((meal) => hasCompleteNutrition(meal.recipe)).length;
    const missing = meals
      .filter((meal) => !hasCompleteNutrition(meal.recipe))
      .map((meal) => `${meal.slot.replace('_', ' ')}: ${meal.recipe.name} (${missingNutritionFields(meal.recipe).join(', ') || 'nutrition TBD'})`);
    return {
      dayName,
      totals: rollup.totals,
      presentCounts: rollup.presentCounts,
      completeMeals,
      mealCount: meals.length,
      missing,
    };
  });

  const weeklyRollup = sumNutrition(
    plannedMeals.map((meal) => mealNutrition(meal.recipe, meal.nutritionServings || 1)),
  );
  const weeklyTotals = weeklyRollup.totals;
  const weeklyAverages = {
    calories_kcal: weeklyRollup.presentCounts.calories_kcal ? weeklyTotals.calories_kcal / 7 : null,
    protein_g: weeklyRollup.presentCounts.protein_g ? weeklyTotals.protein_g / 7 : null,
    fiber_g: weeklyRollup.presentCounts.fiber_g ? weeklyTotals.fiber_g / 7 : null,
    sodium_mg: weeklyRollup.presentCounts.sodium_mg ? weeklyTotals.sodium_mg / 7 : null,
  };
  const useSoonWindow = buildInventoryViews(config).useSoonDays;
  const useSoonItems = buildUseSoonItems(plannedMeals, config);
  const missingMealLines = plannedMeals
    .filter((meal) => !hasCompleteNutrition(meal.recipe))
    .map((meal) => `${meal.dayName} ${meal.slot.replace('_', ' ')}: ${meal.recipe.name} (${missingNutritionFields(meal.recipe).join(', ')})`);

  const counts = {
    healthy: 0,
    balanced: 0,
    treat: 0,
  };
  for (const meal of plannedMeals) {
    const bucket = meal.recipe.signal.bucket;
    if (bucket in counts) counts[bucket] += 1;
  }

  const lines = [];
  lines.push(`# Weekly Healthy Chef Plan - ${weekName}`);
  lines.push('');
  lines.push('**Goal:** high-signal meal prep for a leaner wedding-season cut');
  lines.push(`**Signal rules:** ` +
    `healthy = ${config.signal_rules?.healthy?.join('-') || '7-10'}, ` +
    `balanced = ${config.signal_rules?.balanced?.join('-') || '5-6'}, ` +
    `treat = ${config.signal_rules?.treat?.join('-') || '0-4'}`);
  lines.push('**Breakfast anchor:** Clovis Farms Organic Super Smoothie for all seven days');
  lines.push(`**Lunch rule:** at least ${lunchConstraints.protein_g?.min || 0}g protein and ${
    lunchConstraints.calories_kcal?.min || 0
  }-${lunchConstraints.calories_kcal?.max || 'TBD'} calories when metadata is available.`);
  lines.push('**Snack rule:** exclude alcohol, condiments, sauces, and component-style recipes.');
  lines.push(`**Dessert rule:** cap dessert-style picks at ${dessertConstraints.max_days_per_week || 4} days per week; use lighter finish options on the rest.`);
  lines.push('');

  if (prepAnchors.length) {
    lines.push('## Prep Anchors');
    lines.push('');
    for (const anchor of prepAnchors) {
      lines.push(`- ${anchor.name} (${recipeScore(anchor)}/10, ${anchor.signal.emoji} ${anchor.signal.label})`);
    }
    lines.push('');
  }

  lines.push('## Planned Leftovers');
  lines.push('');
  for (const [dayName, recipe] of batchLunchDays.entries()) {
    if (!recipe) continue;
    const sourceDay = dayName === 'Tuesday' ? 'Monday' : 'Thursday';
    lines.push(`- ${sourceDay} dinner -> ${dayName} lunch: ${recipe.name} (${recipeScore(recipe)}/10, ${recipe.signal.emoji} ${recipe.signal.label})`);
  }
  lines.push('');

  lines.push('## Daily Plan');
  lines.push('');
  for (const day of plan) {
    lines.push(`### ${day.dayName}`);
    lines.push('');
    const lunchText = day.lunch.leftoverFrom
      ? `Leftover from ${day.dayName === 'Tuesday' ? 'Monday' : 'Thursday'} dinner: ${day.lunch.leftoverFrom.name} (${recipeScore(day.lunch.leftoverFrom)}/10, ${day.lunch.leftoverFrom.signal.emoji} ${day.lunch.leftoverFrom.signal.label})`
      : `${day.lunch.recipe.name} (${recipeScore(day.lunch.recipe)}/10, ${day.lunch.recipe.signal.emoji} ${day.lunch.recipe.signal.label})`;
    const dessertText = `${day.dessert.recipe.name} (${recipeScore(day.dessert.recipe)}/10, ${day.dessert.recipe.signal.emoji} ${day.dessert.recipe.signal.label})`;
    lines.push(`- Breakfast: ${day.breakfast.recipe.name} (${recipeScore(day.breakfast.recipe)}/10, ${day.breakfast.recipe.signal.emoji} ${day.breakfast.recipe.signal.label})`);
    lines.push(`- Snack 1: ${day.snack1.recipe.name} (${recipeScore(day.snack1.recipe)}/10, ${day.snack1.recipe.signal.emoji} ${day.snack1.recipe.signal.label})`);
    lines.push(`- Lunch: ${lunchText}`);
    lines.push(`- Snack 2: ${day.snack2.recipe.name} (${recipeScore(day.snack2.recipe)}/10, ${day.snack2.recipe.signal.emoji} ${day.snack2.recipe.signal.label})`);
    lines.push(`- Dinner: ${day.dinner.recipe.name} (${recipeScore(day.dinner.recipe)}/10, ${day.dinner.recipe.signal.emoji} ${day.dinner.recipe.signal.label})`);
    lines.push(`- Dessert / Finish: ${dessertText}`);

    const summary = dailySummaries.find((item) => item.dayName === day.dayName);
    const totals = formatTotals(summary.totals, summary.presentCounts);
    lines.push('');
    lines.push(`#### ${day.dayName} Nutrition`);
    lines.push('');
    lines.push(`- Calories: ${totals.calories_kcal}`);
    lines.push(`- Protein: ${totals.protein_g}`);
    lines.push(`- Fiber: ${totals.fiber_g}`);
    lines.push(`- Sodium: ${totals.sodium_mg}`);
    lines.push(`- Coverage: ${summary.completeMeals} of ${summary.mealCount} meals have complete nutrition`);
    if (summary.missing.length) {
      lines.push(`- Missing nutrition: ${summary.missing.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('## Weekly Nutrition');
  lines.push('');
  lines.push(`- Average calories: ${formatNutritionValue(weeklyAverages.calories_kcal, ' kcal')}`);
  lines.push(`- Average protein: ${formatNutritionValue(weeklyAverages.protein_g, ' g')}`);
  lines.push(`- Average fiber: ${formatNutritionValue(weeklyAverages.fiber_g, ' g')}`);
  lines.push(`- Average sodium: ${formatNutritionValue(weeklyAverages.sodium_mg, ' mg')}`);
  lines.push(`- Healthy picks: ${counts.healthy}`);
  lines.push(`- Balanced picks: ${counts.balanced}`);
  lines.push(`- Treat picks: ${counts.treat}`);
  lines.push(`- Unique recipes: ${new Set(plannedMeals.map((item) => item.recipe.filePath)).size}`);
  lines.push('');

  if (useSoonItems.length) {
    lines.push('## Pantry Use Soon');
    lines.push('');
    for (const item of useSoonItems.sort((a, b) => (a.expires_in - b.expires_in) || a.name.localeCompare(b.name))) {
      lines.push(`- ${item.name}: ${formatQuantityWithUnit(item.quantity, item.unit)} expires on ${item.expires_on || 'TBD'} (${item.expires_in} days)`);
    }
    lines.push('');
  }

  if (missingMealLines.length) {
    lines.push('## Meals With Missing Nutrition');
    lines.push('');
    for (const line of missingMealLines) {
      lines.push(`- ${line}`);
    }
    lines.push('');
  }

  lines.push('## Prep Sessions');
  lines.push('');
  const breakfastBatchServings = 7;
  lines.push('### Sunday Meal Prep');
  lines.push('');
  lines.push(`- Prepare ${breakfastBatchServings} Clovis smoothie ingredient packs.`);
  for (const [dayName, recipe] of batchLunchDays.entries()) {
    if (!recipe) continue;
    const pairedDay = dayName === 'Tuesday' ? 'Monday' : 'Thursday';
    lines.push(`- Cook ${2} servings of ${recipe.name} for ${pairedDay} dinner and ${dayName} lunch.`);
  }
  lines.push('- Wash and chop shared produce for the first half of the week.');
  if (useSoonItems.length) {
    lines.push(`- Pull forward ${useSoonItems.length} pantry item${useSoonItems.length === 1 ? '' : 's'} that expire within ${useSoonWindow} days.`);
  }
  lines.push('');
  lines.push('### Midweek Refresh');
  lines.push('');
  lines.push('- Portion remaining snacks and produce for the back half of the week.');
  lines.push('- Refresh the leftover lunches already covered by the earlier batch dinners.');
  lines.push('');

  lines.push('## Weekly Balance');
  lines.push('');
  lines.push(`- Healthy picks: ${counts.healthy}`);
  lines.push(`- Balanced picks: ${counts.balanced}`);
  lines.push(`- Treat picks: ${counts.treat}`);
  lines.push(`- Unique recipes: ${new Set(plannedMeals.map((item) => item.recipe.filePath)).size}`);
  lines.push('');

  return {
    markdown: `${lines.join('\n')}\n`,
    selected: plannedMeals,
    dailySummaries,
    weeklyAverages,
  };
}

function defaultWeekDate() {
  const explicit = getFlag('date');
  const offset = Number(getFlag('week-offset', '0'));
  const base = explicit ? new Date(explicit) : new Date();
  if (!Number.isFinite(offset) || offset === 0) return base;
  return new Date(base.getTime() + offset * 7 * 86400000);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relativePath, content) {
  const fullPath = path.join(ROOT, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

function main() {
  const plannerConfig = loadPlannerConfig();
  const feedbackState = loadFeedbackState(plannerConfig);
  const recipes = applyFeedbackAdjustments(loadRecipes(), feedbackState);

  const commands = [];
  if (mode === 'all' || mode === 'index') commands.push('index');
  if (mode === 'all' || mode === 'plan') commands.push('plan');
  if (mode === 'all' || mode === 'cookbook') commands.push('cookbook');
  if (mode === 'week') commands.push('plan');
  if (commands.length === 0) {
    console.error(`Unknown mode: ${mode}`);
    process.exit(1);
  }

  const weekName = getFlag('week', weekLabel(defaultWeekDate()));
  if (commands.includes('index')) {
    const indexPath = writeFile('meal-plans/health-signal-index.md', buildSignalIndex(recipes));
    console.log(`wrote ${path.relative(ROOT, indexPath)}`);
  }

  if (commands.includes('plan')) {
    const { markdown, selected } = buildWeeklyPlan(recipes, weekName, plannerConfig);
    const planPath = writeFile(`meal-plans/${weekName}.md`, markdown);
    const shoppingPath = writeFile(`shopping-lists/${weekName}.md`, buildShoppingList(selected, plannerConfig));
    console.log(`wrote ${path.relative(ROOT, planPath)}`);
    console.log(`wrote ${path.relative(ROOT, shoppingPath)}`);
    try {
      execFileSync('node', ['scripts/healthy-chef-deliveries.mjs', 'week-dinner-cards', '--week=' + weekName], { cwd: ROOT, stdio: 'pipe' });
    } catch (error) {
      console.error(`failed to build dinner cards for ${weekName}`);
      throw error;
    }
  }

  if (commands.includes('cookbook')) {
    const cookbookPath = writeFile('meal-plans/wedding-cut-cookbook.md', buildCookbook(recipes));
    console.log(`wrote ${path.relative(ROOT, cookbookPath)}`);
  }
}

main();
