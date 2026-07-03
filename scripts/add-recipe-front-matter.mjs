#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const RECIPE_ROOT = path.join(ROOT, 'recipes');
const TODAY = '2026-07-03';

const TAG_TO_DIETARY = new Map([
  ['#vegetarian', 'vegetarian'],
  ['#vegan', 'vegan'],
  ['#gluten-free', 'gluten_free'],
  ['#dairy-free', 'dairy_free'],
  ['#keto', 'keto_friendly'],
]);

const TAG_TO_GOAL = new Map([
  ['#heart-healthy', 'heart_health'],
  ['#low-cholesterol', 'lower_cholesterol'],
  ['#high-protein', 'high_protein'],
  ['#meal-prep', 'meal_prep'],
  ['#fat-loss', 'fat_loss'],
  ['#quick', 'quick_preparation'],
]);

const UNIT_WORDS = new Set([
  'cup',
  'cups',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'teaspoon',
  'teaspoons',
  'tsp',
  'ounce',
  'ounces',
  'oz',
  'pound',
  'pounds',
  'lb',
  'lbs',
  'gram',
  'grams',
  'kilogram',
  'kilograms',
  'milliliter',
  'milliliters',
  'liter',
  'liters',
  'fluid_ounce',
  'fluid ounces',
  'can',
  'cans',
  'bottle',
  'bottles',
  'package',
  'packages',
  'pouch',
  'pouches',
  'slice',
  'slices',
  'clove',
  'cloves',
  'bunch',
  'bunches',
  'sprig',
  'sprigs',
  'stalk',
  'stalks',
  'leaf',
  'leaves',
  'each',
  'head',
  'jar',
  'jars',
  'container',
  'containers',
  'packet',
  'packets',
  'serving',
  'servings',
  'fillet',
  'fillets',
]);

const UNIT_CANONICAL = new Map([
  ['cup', 'cup'],
  ['cups', 'cup'],
  ['tablespoon', 'tablespoon'],
  ['tablespoons', 'tablespoon'],
  ['tbsp', 'tablespoon'],
  ['teaspoon', 'teaspoon'],
  ['teaspoons', 'teaspoon'],
  ['tsp', 'teaspoon'],
  ['ounce', 'ounce'],
  ['ounces', 'ounce'],
  ['oz', 'ounce'],
  ['pound', 'pound'],
  ['pounds', 'pound'],
  ['lb', 'pound'],
  ['lbs', 'pound'],
  ['gram', 'gram'],
  ['grams', 'gram'],
  ['kilogram', 'kilogram'],
  ['kilograms', 'kilogram'],
  ['milliliter', 'milliliter'],
  ['milliliters', 'milliliter'],
  ['liter', 'liter'],
  ['liters', 'liter'],
  ['fluid_ounce', 'fluid_ounce'],
  ['fluid ounce', 'fluid_ounce'],
  ['fluid ounces', 'fluid_ounce'],
  ['fl oz', 'fluid_ounce'],
  ['can', 'can'],
  ['cans', 'can'],
  ['bottle', 'bottle'],
  ['bottles', 'bottle'],
  ['package', 'package'],
  ['packages', 'package'],
  ['pouch', 'pouch'],
  ['pouches', 'pouch'],
  ['slice', 'slice'],
  ['slices', 'slice'],
  ['clove', 'clove'],
  ['cloves', 'clove'],
  ['bunch', 'bunch'],
  ['bunches', 'bunch'],
  ['sprig', 'sprig'],
  ['sprigs', 'sprig'],
  ['stalk', 'stalk'],
  ['stalks', 'stalk'],
  ['leaf', 'leaf'],
  ['leaves', 'leaf'],
  ['each', 'each'],
  ['head', 'head'],
  ['jar', 'jar'],
  ['jars', 'jar'],
  ['container', 'container'],
  ['containers', 'container'],
  ['packet', 'packet'],
  ['packets', 'packet'],
  ['serving', 'serving'],
  ['servings', 'serving'],
  ['fillet', 'fillet'],
  ['fillets', 'fillet'],
]);

const SIZE_WORDS = new Set(['small', 'medium', 'large', 'extra-large', 'xlarge']);

function walkMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.md') && path.basename(fullPath).toLowerCase() !== 'readme.md') {
      out.push(fullPath);
    }
  }
  return out;
}

function clean(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normalizeFractions(value) {
  return clean(value)
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8');
}

function canonicalUnit(value) {
  const normalized = clean(value).toLowerCase();
  return UNIT_CANONICAL.get(normalized) || normalized;
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/['""]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseNumber(text) {
  if (!text) return null;
  const cleaned = normalizeFractions(text);
  if (/^null$/i.test(cleaned)) return null;
  const fraction = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (fraction) {
    return Number(fraction[1]) + Number(fraction[2]) / Number(fraction[3]);
  }
  const simpleFraction = cleaned.match(/^(\d+)\/(\d+)$/);
  if (simpleFraction) {
    return Number(simpleFraction[1]) / Number(simpleFraction[2]);
  }
  const numeric = cleaned.match(/-?\d+(?:\.\d+)?/);
  return numeric ? Number(numeric[0]) : null;
}

function normalizeCategory(raw, filePath) {
  const fallback = path.basename(path.dirname(filePath)).toLowerCase();
  const source = clean(raw || fallback).toLowerCase();
  if (source.includes('breakfast')) return 'breakfast';
  if (source.includes('lunch')) return 'lunch';
  if (source.includes('dinner')) return 'dinner';
  if (source.includes('meal-prep')) return 'meal-prep';
  if (source.includes('dessert')) return 'dessert';
  if (source.includes('drink')) return 'drinks';
  if (source.includes('snack')) return 'snacks';
  return fallback;
}

function mealTypesForCategory(category) {
  switch (category) {
    case 'breakfast':
      return ['breakfast'];
    case 'lunch':
      return ['lunch'];
    case 'dinner':
      return ['dinner'];
    case 'meal-prep':
      return ['meal_prep'];
    case 'dessert':
      return ['dessert'];
    case 'drinks':
      return ['drink'];
    case 'snacks':
      return ['snack_1', 'snack_2'];
    default:
      return [category];
  }
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((part) => clean(part));
}

function stripFrontMatter(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return text;
  return text.slice(end + 5);
}

function parseNutrition(text) {
  const blockMatch = text.match(/^\*\*Nutrition(?:\s*\(per serving\))?:\*\*\s*\n([\s\S]*?)(?:\n\*\*Health Score:\*\*|\n---|\n## |\n$)/m);
  const block = blockMatch ? blockMatch[1] : '';
  const tableLines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|[-\s:]+\|?$/.test(line));

  const nutrition = {
    basis: 'per_serving',
    calories_kcal: null,
    protein_g: null,
    carbohydrate_g: null,
    net_carbohydrate_g: null,
    fat_g: null,
    saturated_fat_g: null,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    cholesterol_mg: null,
  };

  const labelMap = new Map([
    ['calories', 'calories_kcal'],
    ['protein', 'protein_g'],
    ['carbs', 'carbohydrate_g'],
    ['carbohydrate', 'carbohydrate_g'],
    ['carbohydrates', 'carbohydrate_g'],
    ['net carbs', 'net_carbohydrate_g'],
    ['net carbohydrate', 'net_carbohydrate_g'],
    ['fat', 'fat_g'],
    ['saturated fat', 'saturated_fat_g'],
    ['fiber', 'fiber_g'],
    ['sugar', 'sugar_g'],
    ['sodium', 'sodium_mg'],
    ['cholesterol', 'cholesterol_mg'],
  ]);

  if (tableLines.length >= 2) {
    const headers = splitTableRow(tableLines[0]).map((item) => item.toLowerCase());
    const values = splitTableRow(tableLines[tableLines.length - 1]);
    headers.forEach((header, index) => {
      const key = labelMap.get(header);
      if (!key) return;
      const value = values[index];
      const parsed = parseNumber(value);
      if (parsed != null) {
        nutrition[key] = parsed;
      }
    });
  }

  return nutrition;
}

function parseTimes(text) {
  const valueFor = (label) => {
    const match = text.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n|]+)`, 'i'));
    return match ? parseNumber(match[1]) : null;
  };

  return {
    prep_minutes: valueFor('Prep Time'),
    cook_minutes: valueFor('Cook Time'),
    total_minutes: valueFor('Total'),
  };
}

function parseTags(text) {
  const match = text.match(/^\*\*Tags:\*\*\s*(.+)$/m);
  if (!match) return [];
  return match[1]
    .split(/\s+/)
    .map((item) => item.trim().replace(/[`,]/g, ''))
    .filter(Boolean);
}

function parseHealthScore(text) {
  const match = text.match(/^\*\*Health Score:\*\*\s*(\d+)\/10$/m);
  return match ? Number(match[1]) : null;
}

function parseServings(text) {
  const match = text.match(/^\*\*Serv(?:es|ings):\*\*\s*([^\n|]+)$/m);
  return match ? parseNumber(match[1]) : null;
}

function normalizeIngredientText(line) {
  return clean(line.replace(/^[-*]\s*/, ''));
}

function stripConversionPrefix(text) {
  const tokens = clean(text).split(/\s+/).filter(Boolean);
  while (tokens.length) {
    const token = tokens[0].replace(/^\/+/, '').toLowerCase();
    if (!token) {
      tokens.shift();
      continue;
    }
    if (/^\d+(?:\.\d+)?(?:ml|mg|g|kg|oz|lb|lbs|l|cl)$/i.test(token)) {
      tokens.shift();
      continue;
    }
    break;
  }
  return tokens.join(' ');
}

function guessDepartment(text) {
  const lower = text.toLowerCase();
  if (/(tilapia|salmon|cod|tuna|swordfish|shrimp|scallop|fish|chicken|turkey|beef|pork|lamb|sausage|ham|meatball|tofu)/.test(lower)) {
    if (/(salmon|cod|tuna|swordfish|shrimp|scallop|fish|tilapia)/.test(lower)) return 'seafood';
    if (/tofu/.test(lower)) return 'pantry';
    return 'meat';
  }
  if (/(yogurt|cheese|milk|butter|cream|ricotta|feta|cottage)/.test(lower)) return 'dairy';
  if (/(juice|sake|martini|tea|coffee|water|beverage|drink|wine|beer|cocktail)/.test(lower)) return 'beverages';
  if (/(smoothie|shake|frozen|ice|sorbet|granita|creami)/.test(lower)) return 'frozen';
  if (/(rice|pasta|orzo|gnocchi|couscous|farro|quinoa|oats|oat|bread|tortilla|chapati|flour|cornbread)/.test(lower)) return 'grains';
  if (/(olive oil|oil|vinegar|mustard|capers|pesto|sauce|broth|stock|spice|pepper|salt|honey|syrup|mayonnaise|mayo)/.test(lower)) return 'condiments';
  if (/(apple|banana|berry|berries|avocado|spinach|kale|tomato|onion|garlic|lemon|lime|herb|parsley|cilantro|jalapeño|jalapeno|pepper|cabbage|broccoli|cauliflower|potato|sweet potato|radish|fennel|endive|leek|asparagus|carrot|cucumber|greens|lettuce|mushroom|ginger|pea|peas|apple|orange|grape|melon|rhubarb|watermelon|peach)/.test(lower)) return 'produce';
  return 'uncategorized';
}

function parseIngredientLine(line) {
  const display = normalizeIngredientText(line);
  if (!display) return null;
  const optional = /\boptional\b/i.test(display);
  const text = display.replace(/\s*\(optional\)\s*/i, '').replace(/\s*\boptional\b\s*/i, '').trim();
  const quantityMatch = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s+to\s+\d+(?:\.\d+)?)?\s+(.+)$/i);
  let quantity = null;
  let unit = null;
  let rest = text;
  const beverageServingMatch = text.match(/^(\d+)\s+(\d+(?:\.\d+)?)\s+oz\s+serving\s+(.+)$/i);
  if (beverageServingMatch) {
    quantity = Number(beverageServingMatch[2]);
    unit = 'fluid_ounce';
    rest = beverageServingMatch[3];
  } else if (quantityMatch) {
    quantity = parseNumber(quantityMatch[1]);
    rest = quantityMatch[2];
    const restParts = rest.split(/\s+/);
    if (SIZE_WORDS.has(restParts[0]?.toLowerCase())) {
      restParts.shift();
    }
    const possibleUnit = restParts[0]?.toLowerCase();
    if (possibleUnit && UNIT_WORDS.has(possibleUnit)) {
      unit = canonicalUnit(possibleUnit);
      rest = stripConversionPrefix(restParts.slice(1).join(' '));
    } else {
      rest = stripConversionPrefix(restParts.join(' '));
    }
  }

  let preparation = null;
  let name = rest;
  const commaParts = rest.split(/,\s+/);
  if (commaParts.length > 1) {
    name = commaParts[0];
    preparation = commaParts.slice(1).join(', ');
  }

  name = name
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*\([^)]+\)\s*$/g, '')
    .replace(/\s+(for serving|for garnish|to taste)$/i, '')
    .trim();

  if (!preparation) {
    const prepMatch = display.match(/,\s*(.*)$/);
    if (prepMatch) preparation = prepMatch[1].trim();
  }

  return {
    display,
    name,
    ingredient_id: slugify(name),
    quantity,
    unit: unit ? canonicalUnit(unit) : null,
    preparation,
    optional,
    grocery_department: guessDepartment(name || display),
  };
}

function parseIngredients(text) {
  const match = text.match(/## Ingredients\s*\n([\s\S]*?)(?:\n## |\n---|\n$)/m);
  const block = match ? match[1] : '';
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => parseIngredientLine(line))
    .filter(Boolean);
}

function parseBodyTitle(text, filePath) {
  const match = text.match(/^#\s+(.+)$/m);
  return clean(match?.[1] || path.basename(filePath, '.md'));
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value));
}

function yamlList(items, indent = 0) {
  const pad = ' '.repeat(indent);
  return items.map((item) => `${pad}- ${item}`).join('\n');
}

function buildIngredientYaml(ingredient, indent = 2) {
  const pad = ' '.repeat(indent);
  const lines = [];
  lines.push(`${pad}- display: ${yamlScalar(ingredient.display)}`);
  lines.push(`${pad}  name: ${yamlScalar(ingredient.name)}`);
  lines.push(`${pad}  ingredient_id: ${yamlScalar(ingredient.ingredient_id)}`);
  lines.push(`${pad}  quantity: ${yamlScalar(ingredient.quantity)}`);
  lines.push(`${pad}  unit: ${yamlScalar(ingredient.unit)}`);
  lines.push(`${pad}  preparation: ${yamlScalar(ingredient.preparation)}`);
  lines.push(`${pad}  optional: ${yamlScalar(ingredient.optional)}`);
  lines.push(`${pad}  grocery_department: ${yamlScalar(ingredient.grocery_department)}`);
  return lines.join('\n');
}

function buildFrontMatter(data) {
  const lines = [];
  lines.push('---');
  lines.push('schema_version: 1');
  lines.push(`id: ${yamlScalar(data.id)}`);
  lines.push(`title: ${yamlScalar(data.title)}`);
  lines.push('status: reviewed');
  lines.push(`category: ${yamlScalar(data.category)}`);
  lines.push('meal_types:');
  lines.push(yamlList(data.meal_types, 2));
  lines.push(`servings: ${yamlScalar(data.servings)}`);
  lines.push('times:');
  lines.push(`  prep_minutes: ${yamlScalar(data.times.prep_minutes)}`);
  lines.push(`  cook_minutes: ${yamlScalar(data.times.cook_minutes)}`);
  lines.push(`  total_minutes: ${yamlScalar(data.times.total_minutes)}`);
  lines.push('nutrition:');
  lines.push(`  basis: ${yamlScalar(data.nutrition.basis)}`);
  lines.push(`  calories_kcal: ${yamlScalar(data.nutrition.calories_kcal)}`);
  lines.push(`  protein_g: ${yamlScalar(data.nutrition.protein_g)}`);
  lines.push(`  carbohydrate_g: ${yamlScalar(data.nutrition.carbohydrate_g)}`);
  lines.push(`  net_carbohydrate_g: ${yamlScalar(data.nutrition.net_carbohydrate_g)}`);
  lines.push(`  fat_g: ${yamlScalar(data.nutrition.fat_g)}`);
  lines.push(`  saturated_fat_g: ${yamlScalar(data.nutrition.saturated_fat_g)}`);
  lines.push(`  fiber_g: ${yamlScalar(data.nutrition.fiber_g)}`);
  lines.push(`  sugar_g: ${yamlScalar(data.nutrition.sugar_g)}`);
  lines.push(`  sodium_mg: ${yamlScalar(data.nutrition.sodium_mg)}`);
  lines.push(`  cholesterol_mg: ${yamlScalar(data.nutrition.cholesterol_mg)}`);
  lines.push(`health_score: ${yamlScalar(data.health_score)}`);
  lines.push(data.tags.length ? `tags:\n${yamlList(data.tags.map(yamlScalar), 2)}` : 'tags: []');
  lines.push(data.dietary_tags.length ? `dietary_tags:\n${yamlList(data.dietary_tags.map(yamlScalar), 2)}` : 'dietary_tags: []');
  lines.push(data.goal_tags.length ? `goal_tags:\n${yamlList(data.goal_tags.map(yamlScalar), 2)}` : 'goal_tags: []');
  lines.push('allergens: []');
  lines.push(data.equipment.length ? `equipment:\n${yamlList(data.equipment.map(yamlScalar), 2)}` : 'equipment: []');
  lines.push(data.ingredients.length ? 'ingredients:' : 'ingredients: []');
  if (data.ingredients.length) {
    for (const ingredient of data.ingredients) {
      lines.push(buildIngredientYaml(ingredient, 2));
    }
  }
  lines.push('meal_prep:');
  lines.push('  friendly: true');
  lines.push('  fridge_days: null');
  lines.push('  freezer_months: null');
  lines.push('  reheat: null');
  lines.push('relationships:');
  lines.push('  similar_to: []');
  lines.push('  pairs_with: []');
  lines.push('  leftover_to: []');
  lines.push('  substitutions: []');
  lines.push('source:');
  lines.push('  name: null');
  lines.push('  url: null');
  lines.push('  nutrition_verified: false');
  lines.push(`  last_reviewed: ${yamlScalar(TODAY)}`);
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

function buildRecipeData(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const text = stripFrontMatter(raw);
  const title = parseBodyTitle(text, filePath);
  const category = normalizeCategory(text.match(/^\*\*Category:\*\*\s*(.+)$/m)?.[1], filePath);
  const tags = parseTags(text);
  const dietary_tags = [...new Set(tags.map((tag) => TAG_TO_DIETARY.get(tag)).filter(Boolean))];
  const goal_tags = [...new Set(tags.map((tag) => TAG_TO_GOAL.get(tag)).filter(Boolean))];
  const ingredients = parseIngredients(text);

  return {
    id: path.basename(filePath, '.md'),
    title,
    category,
    meal_types: mealTypesForCategory(category),
    servings: parseServings(text),
    times: parseTimes(text),
    nutrition: parseNutrition(text),
    health_score: parseHealthScore(text),
    tags,
    dietary_tags,
    goal_tags,
    equipment: [],
    ingredients,
    text,
  };
}

const files = walkMarkdownFiles(RECIPE_ROOT);
let changed = 0;

for (const filePath of files) {
  const current = fs.readFileSync(filePath, 'utf8');
  const data = buildRecipeData(filePath);
  const body = stripFrontMatter(current);
  const updated = `${buildFrontMatter(data)}${body}`;
  fs.writeFileSync(filePath, updated, 'utf8');
  changed += 1;
}

console.log(`Updated ${changed} recipe files.`);
