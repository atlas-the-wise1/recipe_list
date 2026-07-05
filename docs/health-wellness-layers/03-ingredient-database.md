# Layer 3 — Ingredient Database

## Purpose

The ingredient database standardizes ingredient names and provides shared information for grocery lists, substitutions, storage, allergens, nutrition, and pantry tracking.

Instead of treating every ingredient mention as unrelated text, the assistant should recognize that:

- `chicken breast`
- `boneless chicken breast`
- `skinless chicken breasts`

may all refer to the same canonical ingredient.

## Folder Structure

```text
ingredients/
├── proteins/
├── produce/
├── dairy/
├── grains/
├── pantry/
├── frozen/
├── spices/
└── beverages/
```

Flat storage is also acceptable for a small repository.

## Ingredient Schema

```yaml
schema_version: 1
id: chicken-breast
name: Chicken Breast
aliases:
  - boneless chicken breast
  - skinless chicken breast
  - chicken breasts
grocery_department: meat
default_unit: pound
allergens: []
dietary_tags:
  - gluten_free
storage:
  pantry_days: null
  refrigerator_days: 2
  freezer_months: 9
substitutions:
  - turkey-breast
  - extra-firm-tofu
seasonality: []
nutrition_reference:
  basis: per_100g
  calories_kcal: null
  protein_g: null
  carbohydrate_g: null
  fat_g: null
source:
  name: null
  url: null
  last_reviewed: null
notes: null
```

## Canonical Naming

Each ingredient should have one canonical name and one stable ID.

Example:

```yaml
id: greek-yogurt
name: Greek Yogurt
aliases:
  - plain Greek yogurt
  - nonfat Greek yogurt
  - 0 percent Greek yogurt
```

Recipes should reference the canonical name where possible.

## Grocery Departments

Recommended values:

- produce
- meat
- seafood
- dairy
- frozen
- bakery
- pantry
- grains
- canned_goods
- condiments
- spices
- beverages
- supplements
- household
- uncategorized

## Unit Normalization

Recommended units:

### Weight

- gram
- kilogram
- ounce
- pound

### Volume

- teaspoon
- tablespoon
- fluid_ounce
- cup
- pint
- quart
- liter
- milliliter

### Count

- each
- clove
- slice
- package
- can
- bottle
- bunch

Avoid mixing abbreviations such as `tbsp`, `T`, and `tablespoon` in source data. Convert them to a canonical value.

## Substitutions

Substitutions should indicate direction and context.

```yaml
substitutions:
  - ingredient_id: coconut-milk
    ratio: 1:1
    notes: Use for dairy-free soups and sauces.
  - ingredient_id: oat-milk
    ratio: 1:1
    notes: Best for smoothies and baking.
```

Not every substitution is nutritionally equivalent. The assistant should state that a substitution may change taste, texture, calories, or allergens.

## Storage Data

```yaml
storage:
  unopened_days: null
  pantry_days: null
  refrigerator_days: 5
  freezer_months: 3
  notes: Store in an airtight container.
```

Storage guidance should be conservative and sourced where practical.

## Pantry Inventory

Pantry inventory should be stored separately from the ingredient catalog.

```yaml
schema_version: 1
updated_on: 2026-07-02
items:
  - ingredient_id: brown-rice
    quantity: 2
    unit: pound
    expires_on: null
  - ingredient_id: spinach
    quantity: 8
    unit: ounce
    expires_on: 2026-07-05
```

## Alias Groups

The assistant should also support canonical equivalence groups so semantically similar ingredient IDs subtract from the same stock bucket.

```yaml
alias_groups:
  - canonical: olive-oil
    aliases:
      - extra-virgin-olive-oil
  - canonical: salt
    aliases:
      - kosher-salt
  - canonical: black-pepper
    aliases:
      - freshly-ground-black-pepper
      - freshly-cracked-black-pepper
```

## Ingredient Matching Workflow

1. Read the ingredient text from a recipe.
2. Normalize capitalization and punctuation.
3. remove preparation terms
4. match aliases
5. map to canonical ingredient ID
6. preserve the original display text
7. flag uncertain matches for review

## Grocery Aggregation

Before combining grocery quantities, confirm that units are compatible.

Safe:

```text
1 cup spinach + 2 cups spinach = 3 cups spinach
```

Needs conversion:

```text
8 ounces spinach + 1 pound spinach
```

Do not combine incompatible forms without a defined conversion:

```text
2 tomatoes + 1 cup diced tomatoes
```

## Ingredient Relationships

Useful relationship types:

- substitute_for
- commonly_paired_with
- derived_from
- contains
- flavor_affinity
- pantry_equivalent

## Definition of Done

Layer 3 is complete when:

- common ingredients have canonical IDs
- aliases are documented
- grocery departments are standardized
- units are normalized
- pantry inventory is separate from the catalog
- alias groups resolve equivalent ingredient IDs
- substitutions include context
- storage information is available
- grocery generation uses canonical ingredient IDs
