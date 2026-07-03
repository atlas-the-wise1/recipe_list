# Layer 1 — Knowledge Base

## Purpose

The knowledge base is the source of truth for the health and wellness assistant. It stores recipes, ingredients, meal plans, workouts, goals, habits, educational material, and user-specific configuration in a format that is readable by both people and software.

The recommended format is Markdown with YAML front matter. Markdown preserves human readability, while YAML provides structured fields that can be indexed, validated, filtered, and used by applications.

## Recommended Repository Structure

```text
health-assistant/
├── recipes/
│   ├── breakfast/
│   ├── lunch/
│   ├── dinner/
│   ├── snacks/
│   ├── desserts/
│   ├── drinks/
│   └── meal-prep/
├── ingredients/
├── meal-plans/
├── shopping-lists/
├── workouts/
├── goals/
├── habits/
├── education/
├── indexes/
├── schemas/
├── scripts/
├── user-profile/
└── docs/
```

## Design Principles

1. Markdown files are authoritative.
2. Every record has a stable ID.
3. Structured metadata appears in YAML front matter.
4. Generated indexes can be recreated at any time.
5. Missing values remain `null`.
6. Health claims are never invented.
7. Personal health data should be kept private.
8. Public recipe content should be separated from private user history.

## Document Types

### Recipes

Recipe documents contain:

- title
- meal type
- servings
- preparation time
- nutrition
- ingredients
- instructions
- storage information
- dietary tags
- goal tags
- allergens
- relationships to other recipes

### Ingredients

Ingredient documents contain:

- standard name
- aliases
- grocery department
- storage guidance
- substitutions
- allergen information
- seasonality

### Meal Plans

Meal-plan documents reference recipe IDs or file paths rather than duplicating recipe content.

### Workouts

Workout documents contain:

- duration
- difficulty
- equipment
- muscle groups
- exercises
- rest periods
- goal tags
- contraindications

### Goals

Goal documents define:

- desired outcome
- starting value
- target value
- measurement method
- target date
- milestones
- related habits

### Habits

Habit documents contain daily or weekly tracking values for items such as water, protein, fiber, sleep, steps, mobility, and workouts.

## Example Recipe Document

```markdown
---
schema_version: 1
id: strawberry-banana-smoothie
title: Strawberry Banana Smoothie
status: reviewed
meal_types:
  - breakfast
  - snack_1
servings: 1
times:
  prep_minutes: 5
  cook_minutes: 0
  total_minutes: 5
nutrition:
  basis: per_serving
  calories_kcal: 260
  protein_g: 18
  carbohydrate_g: 38
  net_carbohydrate_g: 32
  fat_g: 4
  saturated_fat_g: 1
  fiber_g: 6
  sugar_g: 20
  sodium_mg: 120
  cholesterol_mg: 5
dietary_tags:
  - vegetarian
goal_tags:
  - high_fiber
  - balanced_breakfast
allergens:
  - dairy
equipment:
  - blender
ingredients:
  - name: frozen strawberries
    quantity: 1
    unit: cup
    preparation: null
    optional: false
    grocery_department: frozen
  - name: banana
    quantity: 1
    unit: medium
    preparation: peeled
    optional: false
    grocery_department: produce
meal_prep:
  friendly: true
  fridge_days: 1
  freezer_months: 1
  reheat: null
relationships:
  similar_to: []
  pairs_with: []
  leftover_to: []
  substitutions: []
source:
  name: null
  url: null
  nutrition_verified: false
  last_reviewed: null
---

# Strawberry Banana Smoothie

## Instructions

1. Add all ingredients to a blender.
2. Blend until smooth.
3. Serve immediately.
```

## Required Supporting Files

The knowledge base should include:

```text
schemas/
  recipe.schema.json
  workout.schema.json
  goal.schema.json

scripts/
  validate_kb.py
  build_recipe_index.py
  generate_weekly_plan.py
  generate_grocery_list.py
```

## Validation Workflow

Recommended checks:

1. Confirm each document has YAML front matter.
2. Validate required fields.
3. Confirm IDs are unique.
4. Confirm referenced recipes exist.
5. Confirm numeric nutrition values are nonnegative.
6. Confirm nutrition basis is stated.
7. Confirm verification status is included.
8. Confirm generated indexes match source files.

## Versioning

Every schema should include a version number.

```yaml
schema_version: 1
```

When the schema changes:

1. increment the version
2. document the migration
3. preserve backward compatibility where possible
4. include a migration script
5. revalidate the entire repository

## Definition of Done

Layer 1 is complete when:

- every document type has a schema
- every existing recipe has structured metadata
- validation runs automatically
- the repository has a documented folder structure
- generated indexes can be rebuilt
- public and private data are clearly separated
