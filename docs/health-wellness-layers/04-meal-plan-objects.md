# Layer 4 — Meal Plan Objects

## Purpose

Meal-plan objects represent a complete weekly eating plan without duplicating recipe content. Each meal slot references a recipe, serving quantity, or external meal entry.

The standard weekly layout is:

- breakfast
- snack 1
- lunch
- snack 2
- dinner
- dessert

## Folder Structure

```text
meal-plans/
├── templates/
├── generated/
├── archived/
└── favorites/
```

## Weekly Meal Plan Schema

```yaml
schema_version: 1
id: 2026-W28
title: Weekly Meal Plan
week_start: 2026-07-06
week_end: 2026-07-12
profile_id: default-profile
planning_mode: balanced
constraints:
  daily_calorie_target: null
  daily_protein_target_g: null
  daily_fiber_target_g: null
  budget_weekly_usd: null
  required_goal_tags: []
  excluded_ingredients: []
  avoid_recipe_repeats: true
  prefer_leftovers: true
days:
  monday:
    breakfast:
      recipe_id: strawberry-banana-smoothie
      servings: 1
    snack_1:
      recipe_id: apple-peanut-butter
      servings: 1
    lunch:
      recipe_id: chicken-shawarma-bowl
      servings: 1
    snack_2:
      recipe_id: greek-yogurt-berries
      servings: 1
    dinner:
      recipe_id: baked-salmon-vegetables
      servings: 1
    dessert:
      recipe_id: dark-chocolate-berries
      servings: 1
```

## Meal Entry Types

### Recipe Reference

```yaml
breakfast:
  recipe_id: overnight-oats
  servings: 1
```

### Leftover Reference

```yaml
lunch:
  leftover_from:
    day: monday
    meal: dinner
  servings: 1
```

### External Meal

```yaml
dinner:
  external_meal:
    name: Restaurant dinner
    notes: Choose a protein and vegetable-forward option.
```

### Flexible Slot

```yaml
snack_1:
  flexible:
    category: fruit_and_protein
    calorie_range:
      min: 150
      max: 250
```

## Meal Plan Templates

Recommended reusable templates:

- balanced week
- high-protein week
- heart-health week
- lower-sodium week
- budget week
- meal-prep week
- vegetarian week
- quick-cooking week
- freezer-friendly week
- high-fiber week

Templates should define constraints rather than hardcode every meal.

## Planning Constraints

```yaml
constraints:
  daily_calorie_target:
    min: 1800
    max: 2100
  daily_protein_target_g:
    min: 120
    max: 160
  maximum_recipe_repeats: 2
  maximum_dinner_repeats: 1
  minimum_vegetable_servings: 4
  required_goal_tags:
    - high_protein
  excluded_allergens:
    - peanuts
```

## Randomization

Randomized meal planning should support a reproducible seed.

```yaml
generation:
  seed: 12842
  generated_on: 2026-07-02
```

A seed allows the same plan to be recreated.

## Meal-Prep Optimization

The planner should prefer recipes that share ingredients and can be prepared in batches.

Example:

```text
Monday dinner: roasted chicken and vegetables
Tuesday lunch: chicken grain bowl
Wednesday lunch: chicken wrap
```

This reduces cost and waste.

## Leftover Rules

Recommended rules:

1. never schedule leftovers before the original meal
2. respect refrigerator storage limits
3. do not reuse the same leftovers indefinitely
4. track serving quantities
5. distinguish planned leftovers from accidental extras

## Nutrition Calculation

Daily totals should be derived from referenced recipes.

```yaml
daily_summary:
  monday:
    calories_kcal: 1980
    protein_g: 142
    fiber_g: 31
    sodium_mg: 1840
```

Totals should include a confidence indicator when some recipes have unverified or missing nutrition data.

```yaml
confidence:
  nutrition_complete: false
  missing_recipes:
    - restaurant-dinner
```

## Weekly Meal Prep Template

```yaml
days:
  monday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
  tuesday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
  wednesday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
  thursday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
  friday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
  saturday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
  sunday:
    breakfast: null
    snack_1: null
    lunch: null
    snack_2: null
    dinner: null
    dessert: null
```

## Definition of Done

Layer 4 is complete when:

- each meal slot references structured data
- plans can be generated from templates
- leftovers are modeled explicitly
- nutrition totals can be calculated
- random plans are reproducible
- constraints are stored with the plan
- grocery lists can be generated from the plan
