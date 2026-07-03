#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const RECIPE_ROOT = path.join(ROOT, 'recipes');
const RECIPE_INDEX = path.join(ROOT, 'indexes', 'recipes.json');
const MEAL_PLAN_ROOT = path.join(ROOT, 'meal-plans');
const SHOPPING_ROOT = path.join(ROOT, 'shopping-lists');

const args = process.argv.slice(2);
const mode = args[0] || 'all';

function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
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

function sortByScoreThenName(a, b) {
  const aScore = a.score == null ? -1 : a.score;
  const bScore = b.score == null ? -1 : b.score;
  if (aScore !== bScore) return bScore - aScore;
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
      const scoreText = recipe.score == null ? 'TBD' : `${recipe.score}/10`;
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
  return `${recipe.name} (${recipe.score}/10, ${recipe.signal.emoji} ${recipe.signal.label})`;
}

function takeTop(recipes, count, predicate = () => true) {
  return recipes
    .filter((recipe) => predicate(recipe))
    .slice()
    .sort(sortByScoreThenName)
    .slice(0, count);
}

function sortByScoreAscendingThenName(a, b) {
  const aScore = a.score == null ? -1 : a.score;
  const bScore = b.score == null ? -1 : b.score;
  if (aScore !== bScore) return aScore - bScore;
  return a.name.localeCompare(b.name);
}

function isDessertCandidate(recipe) {
  const text = `${recipe.name} ${recipe.tags.join(' ')}`.toLowerCase();
  return /dessert|ice cream|sorbet|granita|cake|cookie|cookies|pudding|brulee|split|crisp|treat|mousse|shake|smoothie|martini|colada|screwdriver/.test(
    text,
  );
}

function isSnackCandidate(recipe) {
  return recipe.category === 'snacks' || recipe.category === 'drinks';
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
    if (recipe.score == null) return false;
    if (recipe.score < minScore || recipe.score > maxScore) return false;
    return preferredBuckets.includes(recipe.signal.bucket);
  });

  if (!candidates.length) return null;

  const weighted = candidates.map((recipe) => {
    const bucketWeight =
      recipe.signal.bucket === 'healthy' ? 3 : recipe.signal.bucket === 'balanced' ? 1.5 : 0.6;
    return { recipe, weight: Math.max(0.1, recipe.score * bucketWeight) };
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

function ingredientKey(ingredient) {
  return [
    ingredient.ingredient_id || slugify(ingredient.name || ingredient.display || ''),
    ingredient.unit || 'unitless',
    ingredient.preparation || '',
    ingredient.grocery_department || 'uncategorized',
  ].join('|');
}

function buildShoppingList(selectedMeals) {
  const sections = new Map([
    ['Produce', new Map()],
    ['Proteins', new Map()],
    ['Dairy', new Map()],
    ['Frozen', new Map()],
    ['Beverages', new Map()],
    ['Pantry', new Map()],
    ['Spices', new Map()],
  ]);

  for (const meal of selectedMeals) {
    const recipe = meal.recipe;
    const recipeServings = recipe.servings || 1;
    const plannedServings = meal.servings || 1;
    const scale = plannedServings / recipeServings;

    for (const ingredient of recipe.ingredients || []) {
      const dept = sectionForDepartment(ingredient.grocery_department, ingredient.display || ingredient.name);
      const bucket = sections.get(dept) || sections.get('Pantry');
      const key = ingredientKey(ingredient);
      const scaledQuantity = ingredient.quantity == null ? null : ingredient.quantity * scale;

      if (!bucket.has(key)) {
        bucket.set(key, {
          ingredient_id: ingredient.ingredient_id,
          name: ingredient.name || ingredient.display,
          display: ingredient.display || ingredient.name,
          unit: ingredient.unit || null,
          quantity: scaledQuantity,
          recipes: [meal.label],
          department: dept,
        });
      } else {
        const entry = bucket.get(key);
        if (entry.quantity == null || scaledQuantity == null) {
          entry.quantity = entry.quantity == null ? scaledQuantity : entry.quantity;
        } else {
          entry.quantity += scaledQuantity;
        }
        entry.recipes.push(meal.label);
      }
    }
  }

  const lines = [];
  lines.push('# Shopping List');
  lines.push('');
  lines.push('Generated from the weekly meal plan.');
  lines.push('');

  for (const [section, items] of sections.entries()) {
    if (!items.size) continue;
    lines.push(`## ${section}`);
    lines.push('');
    const sorted = [...items.values()].sort((a, b) => ingredientSortKey(a).localeCompare(ingredientSortKey(b)));
    for (const item of sorted) {
      const refs = [...new Set(item.recipes)].join(', ');
      const amount = formatQuantity(item.quantity);
      const quantityText = amount == null ? item.display : `${amount} ${item.unit || ''} ${item.name || item.display}`.replace(/\s+/g, ' ').trim();
      lines.push(`- ${quantityText} (${item.ingredient_id}) [${refs}]`);
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

function buildWeeklyPlan(recipes, weekName) {
  const used = new Set();
  const clovis = recipes.find((recipe) => recipe.slug === 'clovis-farms-organic-super-smoothie');
  if (!clovis) {
    throw new Error('Missing required clovis-farms-organic-super-smoothie recipe');
  }
  used.add(clovis.filePath);

  const lunchPool = recipes.filter((recipe) => recipe.category === 'lunch' && recipe.score != null);
  const dinnerPool = recipes.filter((recipe) => recipe.category === 'dinner' && recipe.score != null);
  const snackPool = recipes.filter((recipe) => isSnackCandidate(recipe) && recipe.score != null);
  const dessertPool = recipes.filter((recipe) => isSnackCandidate(recipe) && recipe.score != null && isDessertCandidate(recipe));
  const mealPrepPool = recipes.filter(
    (recipe) => recipe.score != null && (recipe.category === 'meal-prep' || recipe.tags.includes('#meal-prep')),
  );

  const dessert = chooseUnique(dessertPool, 7, used, sortByScoreAscendingThenName);
  const snackEligible = snackPool.filter((recipe) => !used.has(recipe.filePath));
  const snack1 = chooseUnique(snackEligible, 7, used, sortByScoreThenName);
  const snack2 = chooseUnique(
    snackPool.filter((recipe) => !used.has(recipe.filePath)),
    7,
    used,
    sortByScoreThenName,
  );
  const lunch = chooseUnique(lunchPool, 7, used, sortByScoreThenName);
  const dinner = chooseUnique(dinnerPool, 7, used, sortByScoreThenName);
  const prepAnchors = chooseUnique(mealPrepPool, 2, used, sortByScoreThenName);

  if (snack1.length < 7 || lunch.length < 7 || snack2.length < 7 || dinner.length < 7 || dessert.length < 7) {
    throw new Error('Unable to assemble a full 7-day weekly plan from the available recipe pools');
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const plan = days.map((dayName, index) => ({
    dayName,
    breakfast: clovis,
    snack1: snack1[index],
    lunch: lunch[index],
    snack2: snack2[index],
    dinner: dinner[index],
    dessert: dessert[index],
  }));

  const selectedMeals = [];
  for (const day of plan) {
    for (const [slot, recipe] of [
      ['breakfast', day.breakfast],
      ['snack_1', day.snack1],
      ['lunch', day.lunch],
      ['snack_2', day.snack2],
      ['dinner', day.dinner],
      ['dessert', day.dessert],
    ]) {
      selectedMeals.push({
        dayName: day.dayName,
        slot,
        recipe,
        servings: 1,
        label: `${day.dayName} ${slot.replace('_', ' ')}: ${recipe.name}`,
      });
    }
  }

  const lines = [];
  lines.push(`# Weekly Healthy Chef Plan - ${weekName}`);
  lines.push('');
  lines.push('**Goal:** high-signal meal prep for a leaner wedding-season cut');
  lines.push('**Signal rules:** `healthy` = 7-10, `balanced` = 5-6, `treat` = 0-4');
  lines.push('**Breakfast anchor:** Clovis Farms Organic Super Smoothie for all seven days');
  lines.push('');

  if (prepAnchors.length) {
    lines.push('## Prep Anchors');
    lines.push('');
    for (const anchor of prepAnchors) {
      lines.push(
        `- ${anchor.name} (${anchor.score}/10, ${anchor.signal.emoji} ${anchor.signal.label})`,
      );
    }
    lines.push('');
  }

  lines.push('## Daily Plan');
  lines.push('');
  lines.push('| Day | Breakfast | Snack 1 | Lunch | Snack 2 | Dinner | Dessert |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const day of plan) {
    const mealText = (recipe) => `${recipe.name} (${recipe.score}/10, ${recipe.signal.emoji} ${recipe.signal.label})`;
    lines.push(
      `| ${day.dayName} | ${mealText(day.breakfast)} | ${mealText(day.snack1)} | ${mealText(day.lunch)} | ${mealText(day.snack2)} | ${mealText(day.dinner)} | ${mealText(day.dessert)} |`,
    );
  }
  lines.push('');

  const counts = {
    healthy: 0,
    balanced: 0,
    treat: 0,
  };
  for (const meal of selectedMeals) {
    const bucket = meal.recipe.signal.bucket;
    if (bucket in counts) counts[bucket] += 1;
  }

  lines.push('## Weekly Balance');
  lines.push('');
  lines.push(`- Healthy picks: ${counts.healthy}`);
  lines.push(`- Balanced picks: ${counts.balanced}`);
  lines.push(`- Treat picks: ${counts.treat}`);
  lines.push(`- Unique recipes: ${new Set(selectedMeals.map((item) => item.recipe.filePath)).size}`);
  lines.push('');

  return {
    markdown: `${lines.join('\n')}\n`,
    selected: selectedMeals,
  };
}

function defaultWeekDate() {
  const explicit = getFlag('date');
  return explicit ? new Date(explicit) : new Date();
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
  const recipes = loadRecipes();

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
    const { markdown, selected } = buildWeeklyPlan(recipes, weekName);
    const planPath = writeFile(`meal-plans/${weekName}.md`, markdown);
    const shoppingPath = writeFile(`shopping-lists/${weekName}.md`, buildShoppingList(selected));
    console.log(`wrote ${path.relative(ROOT, planPath)}`);
    console.log(`wrote ${path.relative(ROOT, shoppingPath)}`);
  }

  if (commands.includes('cookbook')) {
    const cookbookPath = writeFile('meal-plans/wedding-cut-cookbook.md', buildCookbook(recipes));
    console.log(`wrote ${path.relative(ROOT, cookbookPath)}`);
  }
}

main();
