#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const PLAN_ROOT = path.join(ROOT, 'meal-plans');
const SHOPPING_ROOT = path.join(ROOT, 'shopping-lists');
const DELIVERY_ROOT = path.join(PLAN_ROOT, 'deliveries');
const DELIVERY_LOG = path.join(PLAN_ROOT, 'delivery-log.jsonl');
const RECIPE_INDEX = path.join(ROOT, 'indexes', 'recipes.json');
const PLANNER_CONFIG = path.join(ROOT, 'config', 'healthy-chef.json');

const args = process.argv.slice(2);
const mode = args[0] || 'dispatch';

function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function loadConfig() {
  return readJson(PLANNER_CONFIG, {
    delivery: {
      timezone: 'America/New_York',
      weekly_plan: { day: 'Friday', hour: 18, minute: 0, week_offset: 1 },
      shopping_reminder: { day: 'Saturday', hour: 9, minute: 0 },
      prep_checklist: { day: 'Sunday', hour: 9, minute: 0 },
      dinner_card: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], hour: 16, minute: 0 },
    },
  });
}

function localParts(date = new Date(), timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function currentLocalDay(timeZone) {
  return localParts(new Date(), timeZone).weekday;
}

function currentLocalTimeWithinWindow(timeZone, hour, minute = 0, windowMinutes = 20) {
  const parts = localParts(new Date(), timeZone);
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const targetMinutes = Number(hour) * 60 + Number(minute);
  return currentMinutes >= targetMinutes && currentMinutes <= targetMinutes + Number(windowMinutes);
}

function weekLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const week = Math.floor((date.getDate() - 1) / 7) + 1;
  return `${year}-${month}-week${week}`;
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function writeDeliveryArtifact(kind, weekName, content) {
  const dir = path.join(DELIVERY_ROOT, weekName);
  ensureDir(dir);
  const filePath = path.join(dir, `${kind}.md`);
  fs.writeFileSync(filePath, `${content.trim()}\n`);
  return filePath;
}

function readDeliveryLog() {
  if (!fs.existsSync(DELIVERY_LOG)) return [];
  return fs
    .readFileSync(DELIVERY_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function appendDeliveryLog(entry) {
  ensureDir(path.dirname(DELIVERY_LOG));
  fs.appendFileSync(DELIVERY_LOG, `${JSON.stringify(entry)}\n`);
}

function deliveryKey(kind, weekName, dayName = null) {
  return [weekName, dayName || null, kind].filter(Boolean).join(':');
}

function hasSuccessfulDelivery(key) {
  return readDeliveryLog().some((entry) => entry?.delivery_key === key && entry?.success === true);
}

function planPath(weekName) {
  return path.join(PLAN_ROOT, `${weekName}.md`);
}

function shoppingPath(weekName) {
  return path.join(SHOPPING_ROOT, `${weekName}.md`);
}

function loadRecipeIndex() {
  return readJson(RECIPE_INDEX, []);
}

function recipePathFromTitle(title) {
  const target = slugify(title);
  const index = loadRecipeIndex();
  const match = Array.isArray(index)
    ? index.find((entry) => slugify(entry.title || entry.id || '') === target)
    : null;
  if (match?.path) return path.join(ROOT, match.path);
  if (match?.id) return path.join(ROOT, 'recipes', `${match.id}.md`);
  return null;
}

function extractSection(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = text.indexOf('\n', start);
  if (bodyStart < 0) return '';
  const nextHeading = text.indexOf('\n## ', bodyStart + 1);
  return text.slice(bodyStart + 1, nextHeading > -1 ? nextHeading : text.length).trim();
}

function extractSectionAny(text, headings) {
  for (const heading of headings) {
    const section = extractSection(text, heading);
    if (section) return section;
  }
  return '';
}

function extractRecipeDetails(recipePath) {
  const text = readText(recipePath);
  const title = clean(text.match(/^#\s+(.+)$/m)?.[1] || path.basename(recipePath, '.md'));
  const timeRow = text.match(/\*\*Prep Time:\*\*\s*([^|]+)\|\s*\*\*Cook Time:\*\*\s*([^|]+)\|\s*\*\*Total(?: Time)?:\*\*\s*([^\n]+)/i);
  const prepLine = clean(timeRow?.[1] || text.match(/\*\*Prep Time:\*\*\s*([^\n|]+)/i)?.[1] || '');
  const cookLine = clean(timeRow?.[2] || text.match(/\*\*Cook Time:\*\*\s*([^\n|]+)/i)?.[1] || '');
  const totalLine = clean(timeRow?.[3] || text.match(/\*\*Total(?: Time)?:\*\*\s*([^\n]+)/i)?.[1] || '');
  const ingredients = extractSection(text, 'Ingredients')
    .split('\n')
    .map((line) => clean(line.replace(/^-+\s*/, '')))
    .filter(Boolean);
  const instructions = extractSectionAny(text, ['Instructions', 'Preparation'])
    .split('\n')
    .map((line) => clean(line.replace(/^\*{0,2}STEP\s*\d+:\*{0,2}\s*/i, '').replace(/^(?:STEP\s*)?\d+\.\s*/i, '')))
    .filter(Boolean)
    .filter((line) => !/^---+$/.test(line));
  const prepNotes = extractSectionAny(text, ['Meal Prep Notes', 'Notes']);

  return { title, prepLine, cookLine, totalLine, ingredients, instructions, prepNotes, body: text };
}

function parseDailyPlan(weekName) {
  const text = readText(planPath(weekName));
  const days = new Map();
  const daySections = text.split(/^###\s+/m).slice(1);
  for (const section of daySections) {
    const lines = section.split('\n');
    const dayName = clean(lines[0]);
    const dinnerLine = lines.find((line) => line.startsWith('- Dinner: '));
    const breakfastLine = lines.find((line) => line.startsWith('- Breakfast: '));
    const lunchLine = lines.find((line) => line.startsWith('- Lunch: '));
    const snackLine = lines.find((line) => line.startsWith('- Snack 1: '));
    const prepBlock = section.includes('####') ? section.split(/####\s+/m)[0] : section;
    days.set(dayName, { dayName, dinnerLine, breakfastLine, lunchLine, snackLine, prepBlock });
  }
  return days;
}

function parseRecipeNameFromPlanLine(line) {
  const match = clean(line).match(/:\s*(.+?)\s*\(\d+\/10/);
  return match ? clean(match[1]) : clean(line.replace(/^-+\s*[A-Za-z0-9 ]+:\s*/, ''));
}

function summarizeShoppingList(weekName) {
  const text = readText(shoppingPath(weekName));
  const items = [];
  const lines = text.split('\n').filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith('| ')) continue;
    if (line.includes('---')) continue;
    if (line.includes('Item')) continue;
    const cells = line.split('|').map((cell) => clean(cell));
    if (cells.length >= 6) {
      const item = cells[1];
      const buy = cells[5];
      if (buy && !/^0(?:$|\s)/.test(buy)) {
        items.push(`${item} (${buy})`);
      }
    }
    if (items.length >= 8) break;
  }
  return items;
}

function extractMinuteCount(value) {
  const match = clean(value).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function formatTimeSummary(details) {
  const totalMinutes = extractMinuteCount(details?.totalLine);
  if (totalMinutes != null) {
    return `About ${Math.round(totalMinutes)} minutes`;
  }
  const prepMinutes = extractMinuteCount(details?.prepLine);
  const cookMinutes = extractMinuteCount(details?.cookLine);
  if (prepMinutes != null && cookMinutes != null) {
    return `About ${Math.round(prepMinutes + cookMinutes)} minutes`;
  }
  return details?.totalLine ? clean(details.totalLine) : 'Time unavailable';
}

function deriveThawingNote(details) {
  const sources = [
    details?.prepNotes || '',
    details?.body || '',
    ...(details?.ingredients || []),
    ...(details?.instructions || []),
  ];
  for (const source of sources) {
    const match = clean(source).match(
      /(thaw(?:ing)?[^.]*\.)|(thaw overnight[^.]*\.)|(run under cold water[^.]*\.)|(no need to thaw[^.]*\.)|(unthawed[^.]*\.)/i,
    );
    if (match) {
      return clean(match[0])
        .replace(/^[-*]\s*/, '')
        .replace(/^frozen tip:\s*/i, '')
        .replace(/\s+/g, ' ');
    }
  }
  return '';
}

function formatIngredientLine(item) {
  return `- ${item}`;
}

function estimateEnergyLevel(details) {
  const ingredientCount = details?.ingredients?.length || 0;
  const instructionCount = details?.instructions?.length || 0;
  const totalMinutes = extractMinuteCount(details?.totalLine) ?? (extractMinuteCount(details?.prepLine) || 0) + (extractMinuteCount(details?.cookLine) || 0);

  if (totalMinutes <= 20 && instructionCount <= 6 && ingredientCount <= 8) {
    return 'Low';
  }
  if (totalMinutes <= 40 && instructionCount <= 8 && ingredientCount <= 10) {
    return 'Medium';
  }
  return 'High';
}

function estimateCleanup(details) {
  const text = [details?.body || '', details?.prepNotes || '', ...(details?.instructions || []), ...(details?.ingredients || [])].join('\n').toLowerCase();
  if (/(one[- ]pan|one[- ]pot|air fryer|parchment|foil packet|minimal cleanup|easy cleanup)/.test(text)) {
    return 'Light';
  }
  if (/(sheet pan|skillet|dutch oven|food processor|blender|baking dish|roasting pan)/.test(text)) {
    return 'Moderate';
  }
  return 'Standard';
}

function findNextDayTask(planDays, dayName, recipeName) {
  const orderedDays = Array.from(planDays.keys());
  const index = orderedDays.indexOf(dayName);
  const nextDay = index >= 0 && index < orderedDays.length - 1 ? planDays.get(orderedDays[index + 1]) : null;
  const nextLunchLine = nextDay?.lunchLine || '';
  const currentRecipe = clean(recipeName);
  const lunchText = clean(nextLunchLine);
  const usesLeftovers = lunchText && /leftover/i.test(lunchText) && clean(parseRecipeNameFromPlanLine(nextLunchLine)).toLowerCase().includes(currentRecipe.toLowerCase());

  if (usesLeftovers) {
    return 'Reheat leftovers for lunch.';
  }
  if (lunchText && /leftover from/i.test(lunchText) && lunchText.toLowerCase().includes(dayName.toLowerCase())) {
    return 'Reheat leftovers for lunch.';
  }
  return 'Move the next frozen protein to the refrigerator.';
}

function generateWeeklyPlan(weekName) {
  execFileSync('node', ['scripts/healthy-chef.mjs', 'plan', '--week=' + weekName], { cwd: ROOT, stdio: 'pipe' });
  return readText(planPath(weekName));
}

function writeAllDinnerCards(weekName) {
  const planDays = parseDailyPlan(weekName);
  const written = [];
  for (const [dayName, day] of planDays.entries()) {
    if (!day?.dinnerLine) continue;
    const content = buildDinnerCard(weekName, dayName, planDays);
    const filePath = writeDeliveryArtifact(`dinner-card-${slugify(dayName)}`, weekName, content);
    written.push(filePath);
  }
  return written;
}

function buildWeeklyPlanPreview(weekName) {
  const text = readText(planPath(weekName));
  const prepAnchors = extractSection(text, 'Prep Anchors').split('\n').filter((line) => line.startsWith('- ')).slice(0, 3);
  const leftovers = extractSection(text, 'Planned Leftovers').split('\n').filter((line) => line.startsWith('- ')).slice(0, 3);
  return [
    `# Weekly Plan Preview - ${weekName}`,
    '',
    '## Prep Anchors',
    ...(prepAnchors.length ? prepAnchors : ['- None']),
    '',
    '## Planned Leftovers',
    ...(leftovers.length ? leftovers : ['- None']),
  ].join('\n');
}

function buildShoppingReminder(weekName) {
  const items = summarizeShoppingList(weekName);
  return [
    `# Shopping Reminder - ${weekName}`,
    '',
    items.length ? '## Buy Today' : '## Buy Today',
    ...(items.length ? items.map((item) => `- ${item}`) : ['- Nothing urgent flagged in the shopping list.']),
  ].join('\n');
}

function buildPrepChecklist(weekName) {
  const text = readText(planPath(weekName));
  const start = text.indexOf('## Prep Sessions');
  const end = text.indexOf('\n## Weekly Balance', start >= 0 ? start : 0);
  const prep = start >= 0 ? text.slice(start, end > start ? end : text.length) : '';
  const lines = prep
    .split('\n')
    .map((line) => clean(line))
    .filter((line) => line.startsWith('- '));
  return [
    `# Prep Checklist - ${weekName}`,
    '',
    ...(lines.length ? lines : ['- No prep checklist found.']),
  ].join('\n');
}

function buildDinnerCard(weekName, dayName, planDays = parseDailyPlan(weekName)) {
  const day = planDays.get(dayName);
  if (!day?.dinnerLine) {
    return `# Dinner Card - ${dayName}\n\n- No dinner slot found in ${weekName}.`;
  }

  const recipeName = parseRecipeNameFromPlanLine(day.dinnerLine);
  const recipePath = recipePathFromTitle(recipeName);
  const details = recipePath ? extractRecipeDetails(recipePath) : null;
  const thawing = deriveThawingNote(details);
  const ingredients = details?.ingredients || [];
  const instructions = details?.instructions || [];
  const nextTask = findNextDayTask(planDays, dayName, recipeName);
  const leftoverLine = details?.prepNotes
    ? clean(
        details.prepNotes
          .split('\n')
          .find((line) => /storage|reheat|leftover|batch/i.test(line))
          ?.replace(/^-+\s*/, '')
          ?.replace(/\*\*/g, '') || '',
      )
    : '';

  return [
    `# Dinner Card - ${dayName}`,
    '',
    '**Label:** Meal Prep Option',
    `**Recipe:** ${recipeName}`,
    `**Total Time:** ${formatTimeSummary(details)}`,
    `**Energy Level:** ${estimateEnergyLevel(details)}`,
    `**Cleanup:** ${estimateCleanup(details)}`,
    '',
    '## Before Work or the Night Before',
    '',
    `- ${thawing || 'No advance prep needed.'}`,
    '',
    '## Pull Out',
    '',
    ...(ingredients.length ? ingredients.map(formatIngredientLine) : ['- Ingredients unavailable from recipe file.']),
    '',
    '## Cook',
    '',
    ...(instructions.length ? instructions.map((step, index) => `${index + 1}. ${step}`) : ['1. Follow the recipe instructions in the repo.']),
    '',
    '## While It Cooks',
    '',
    ...(leftoverLine ? [`- ${leftoverLine}`] : ['- Portion any extra servings into airtight containers.']),
    '- Put away unused ingredients.',
    '',
    '## Tomorrow',
    '',
    `- ${nextTask}`,
  ]
    .filter((line) => line !== null && line !== undefined && line !== '')
    .join('\n');
}

function appendFeedbackRecord(payload) {
  const config = loadConfig();
  const feedbackPath = config.inventory?.feedback?.path
    ? path.join(ROOT, config.inventory.feedback.path)
    : path.join(PLAN_ROOT, 'healthy-chef-feedback.jsonl');
  ensureDir(path.dirname(feedbackPath));
  fs.appendFileSync(feedbackPath, `${JSON.stringify(payload)}\n`);
  return feedbackPath;
}

async function maybeSendWebhook(kind, title, content, weekName, dayName = null) {
  const endpoint = process.env.HEALTHY_CHEF_WEBHOOK_URL;
  const delivery_key = deliveryKey(kind, weekName, dayName);
  if (hasSuccessfulDelivery(delivery_key)) {
    return { sent: false, skipped: true, reason: 'already_delivered', delivery_key };
  }
  if (!endpoint) return { sent: false, skipped: false, reason: 'missing_webhook', delivery_key };
  const body = {
    kind,
    title,
    week: weekName,
    day: dayName,
    delivery_key,
    content,
  };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': delivery_key,
      },
      body: JSON.stringify(body),
    });
    const sent = response.ok;
    appendDeliveryLog({
      delivery_key,
      sent_at: new Date().toISOString(),
      channel: 'webhook',
      success: sent,
      kind,
      week: weekName,
      day: dayName,
      status: `${response.status} ${response.statusText}`.trim(),
    });
    return { sent, skipped: false, delivery_key };
  } catch (error) {
    appendDeliveryLog({
      delivery_key,
      sent_at: new Date().toISOString(),
      channel: 'webhook',
      success: false,
      kind,
      week: weekName,
      day: dayName,
      error: clean(error?.message || String(error)),
    });
    return { sent: false, skipped: false, delivery_key, error };
  }
}

function dispatchConfigForNow() {
  const config = loadConfig();
  const delivery = config.delivery || {};
  const timeZone = delivery.timezone || 'America/New_York';
  const weekday = currentLocalDay(timeZone);
  if (weekday === delivery.weekly_plan?.day && currentLocalTimeWithinWindow(timeZone, delivery.weekly_plan?.hour ?? 18, delivery.weekly_plan?.minute ?? 0, 20)) {
    return {
      kind: 'weekly-plan',
      weekName: weekLabel(new Date(Date.now() + (delivery.weekly_plan?.week_offset || 1) * 7 * 86400000)),
    };
  }
  if (weekday === delivery.shopping_reminder?.day && currentLocalTimeWithinWindow(timeZone, delivery.shopping_reminder?.hour ?? 9, delivery.shopping_reminder?.minute ?? 0, 20)) {
    return { kind: 'shopping-reminder', weekName: weekLabel(new Date()) };
  }
  if (weekday === delivery.prep_checklist?.day && currentLocalTimeWithinWindow(timeZone, delivery.prep_checklist?.hour ?? 9, delivery.prep_checklist?.minute ?? 0, 20)) {
    return { kind: 'prep-checklist', weekName: weekLabel(new Date()) };
  }
  if (
    (delivery.dinner_card?.days || []).includes(weekday) &&
    currentLocalTimeWithinWindow(timeZone, delivery.dinner_card?.hour ?? 16, delivery.dinner_card?.minute ?? 0, 20)
  ) {
    return { kind: 'dinner-card', weekName: weekLabel(new Date()), dayName: weekday };
  }
  return null;
}

async function run(kind, weekName, dayName) {
  let content = '';
  if (kind === 'weekly-plan') {
    generateWeeklyPlan(weekName);
    writeAllDinnerCards(weekName);
    content = buildWeeklyPlanPreview(weekName);
  } else if (kind === 'shopping-reminder') {
    content = buildShoppingReminder(weekName);
  } else if (kind === 'prep-checklist') {
    content = buildPrepChecklist(weekName);
  } else if (kind === 'dinner-card') {
    content = buildDinnerCard(weekName, dayName || currentLocalDay(loadConfig().delivery?.timezone || 'America/New_York'));
  } else if (kind === 'week-dinner-cards') {
    const written = writeAllDinnerCards(weekName);
    content = written.length
      ? `Wrote ${written.length} dinner cards for ${weekName}`
      : `No dinner cards were generated for ${weekName}`;
  } else if (kind === 'capture-feedback') {
    const payload = {
      timestamp: new Date().toISOString(),
      recipe_id: getFlag('recipe-id') || getFlag('recipe') || null,
      type: getFlag('type') || 'liked',
      note: getFlag('note') || null,
      day: getFlag('day') || null,
      slot: getFlag('slot') || null,
      week: getFlag('week') || null,
    };
    const pathWritten = appendFeedbackRecord(payload);
    content = `Recorded feedback to ${path.relative(ROOT, pathWritten)}\n${JSON.stringify(payload, null, 2)}`;
  } else {
    throw new Error(`Unknown mode: ${kind}`);
  }

  const titleMap = {
    'weekly-plan': 'Weekly Plan Preview',
    'shopping-reminder': 'Shopping Reminder',
    'prep-checklist': 'Prep Checklist',
    'dinner-card': 'Dinner Card',
    'week-dinner-cards': 'Dinner Cards',
  };
  const title = titleMap[kind] || kind;
  if (kind !== 'week-dinner-cards') {
    writeDeliveryArtifact(kind, weekName, content);
  }
  const delivery = await maybeSendWebhook(kind, title, content, weekName, dayName || null);
  const sent = delivery.sent;
  if (kind === 'week-dinner-cards') {
    console.log(sent ? `sent ${kind} for ${weekName}` : `wrote dinner cards for ${weekName}`);
  } else {
    console.log(sent ? `sent ${kind} for ${weekName}` : `wrote ${path.relative(ROOT, path.join(DELIVERY_ROOT, weekName, `${kind}.md`))}`);
  }
  if (content) console.log(content);
}

async function main() {
  const config = loadConfig();
  const timeZone = config.delivery?.timezone || 'America/New_York';
  const dispatch = mode === 'dispatch' ? dispatchConfigForNow() : null;
  if (mode === 'dispatch') {
    if (!dispatch) return;
    await run(dispatch.kind, dispatch.weekName, dispatch.dayName);
    return;
  }

  const weekName = getFlag('week') || weekLabel(new Date());
  const dayName = getFlag('day') || currentLocalDay(timeZone);
  await run(mode, weekName, dayName);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
