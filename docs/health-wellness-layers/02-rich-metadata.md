# Layer 2 — Rich Metadata

## Purpose

Rich metadata makes recipes and wellness content searchable, sortable, filterable, and suitable for automatic planning. Without metadata, the assistant can only read documents one at a time. With metadata, it can answer questions such as:

- Which breakfasts contain at least 25 grams of protein?
- Which dinners are heart healthy and freezer friendly?
- Which recipes avoid dairy and peanuts?
- Which meals can be prepared in under 20 minutes?
- Which recipes support fat-loss goals?
- Which recipes have verified nutrition values?

## Metadata Categories

### Identity

```yaml
schema_version: 1
id: chicken-shawarma-bowl
title: Chicken Shawarma Bowl
status: reviewed
```

`id` should remain stable even if the file is moved or renamed.

Recommended status values:

- `draft`
- `reviewed`
- `verified`
- `archived`

### Meal Classification

```yaml
meal_types:
  - lunch
  - dinner
```

Supported planning slots:

- breakfast
- snack_1
- lunch
- snack_2
- dinner
- dessert
- drink
- meal_prep

A recipe may support more than one slot.

### Time

```yaml
times:
  prep_minutes: 15
  cook_minutes: 25
  total_minutes: 40
```

Time values should be numeric minutes.

### Servings

```yaml
servings: 4
```

Servings must represent the quantity associated with the nutrition basis and ingredient quantities.

### Nutrition

```yaml
nutrition:
  basis: per_serving
  calories_kcal: 420
  protein_g: 38
  carbohydrate_g: 42
  net_carbohydrate_g: 34
  fat_g: 12
  saturated_fat_g: 3
  fiber_g: 8
  sugar_g: 7
  sodium_mg: 610
  cholesterol_mg: 85
```

Allowed nutrition bases:

- `per_serving`
- `per_recipe`
- `per_100g`

Unknown values should be stored as `null`.

### Dietary Tags

```yaml
dietary_tags:
  - vegetarian
  - vegan
  - gluten_free
  - dairy_free
  - mediterranean
  - keto_friendly
```

Dietary tags should describe recipe characteristics, not medical guarantees.

### Goal Tags

```yaml
goal_tags:
  - high_protein
  - high_fiber
  - heart_health
  - fat_loss
  - muscle_gain
  - lower_sodium
```

Goal tags should indicate how a recipe may fit a planning objective.

### Allergens

```yaml
allergens:
  - dairy
  - eggs
  - peanuts
  - tree_nuts
  - soy
  - wheat
  - fish
  - shellfish
  - sesame
```

Allergen fields should be explicitly reviewed. They should not be inferred from recipe titles.

### Ingredients

```yaml
ingredients:
  - name: chicken breast
    quantity: 1.5
    unit: pound
    preparation: sliced
    optional: false
    grocery_department: meat
```

Ingredient metadata should include:

- normalized name
- quantity
- unit
- preparation
- optional flag
- grocery department

### Equipment

```yaml
equipment:
  - blender
  - sheet_pan
  - skillet
```

Equipment metadata allows workout and meal planning around available tools.

### Meal-Prep Information

```yaml
meal_prep:
  friendly: true
  fridge_days: 4
  freezer_months: 2
  reheat: Microwave for 2 minutes, stirring halfway.
```

### Relationships

```yaml
relationships:
  similar_to:
    - greek-chicken-bowl
  pairs_with:
    - cucumber-tomato-salad
  leftover_to:
    - chicken-shawarma-wrap
  substitutions:
    - Use tofu instead of chicken.
```

### Cost and Shopping Metadata

```yaml
cost:
  estimated_total_usd: 14.00
  estimated_per_serving_usd: 3.50
  price_checked_on: 2026-07-02
```

Prices should always include a date because they change.

### Source and Verification

```yaml
source:
  name: Product label
  url: null
  nutrition_verified: true
  last_reviewed: 2026-07-02
```

## Controlled Vocabularies

Tags should use lowercase snake case.

Good:

```yaml
goal_tags:
  - high_protein
  - heart_health
```

Avoid:

```yaml
goal_tags:
  - High Protein
  - heart-health
  - healthy
```

A central vocabulary file is recommended:

```text
schemas/vocabularies.yml
```

Example:

```yaml
goal_tags:
  - balanced
  - fat_loss
  - muscle_gain
  - high_fiber
  - high_protein
  - heart_health
  - lower_sodium
```

## Metadata Quality Levels

### Draft

- minimum required fields
- nutrition may be incomplete
- source may be missing
- relationships may be empty

### Reviewed

- ingredients normalized
- meal type confirmed
- storage guidance added
- allergen fields reviewed
- nutrition basis confirmed

### Verified

- nutrition source checked
- source and review date recorded
- measurements validated
- tags reviewed
- recipe tested or otherwise confirmed

## Indexing Requirements

The recipe index should include:

```text
id
title
path
meal_types
dietary_tags
goal_tags
calories_kcal
protein_g
fiber_g
sodium_mg
prep_minutes
total_minutes
meal_prep_friendly
nutrition_verified
```

## Definition of Done

Layer 2 is complete when:

- all recipes use the same metadata structure
- all tags use controlled vocabulary
- nutrition basis is always explicit
- unknown data is represented as `null`
- allergens are reviewed
- source and verification fields are present
- indexes expose the most important fields
