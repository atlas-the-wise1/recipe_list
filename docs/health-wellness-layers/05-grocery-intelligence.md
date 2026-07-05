# Layer 5 — Grocery Intelligence

## Purpose

Grocery intelligence converts meal plans into practical shopping lists. It should combine duplicate ingredients, scale quantities, account for pantry and freezer inventory, group items by department, estimate cost, preserve recipe traceability, and surface items that should be used soon.

## Inputs

The grocery generator should use:

- selected meal plan
- recipe ingredients
- serving quantities
- ingredient database
- pantry inventory
- freezer inventory
- user store preferences
- optional budget

## Output Structure

```markdown
# Grocery List — Week 28

## Produce

- [ ] 4 bananas
- [ ] 2 onions
- [ ] 10 ounces spinach

## Meat and Seafood

- [ ] 2 pounds chicken breast
- [ ] 4 salmon fillets

## Dairy

- [ ] 32 ounces Greek yogurt

## Pantry

- [ ] 2 cups brown rice
- [ ] 1 bottle olive oil

## Use Soon

- [ ] 2 cups spinach expiring in 3 days
```

## Grocery List Schema

```yaml
schema_version: 1
id: grocery-list-2026-W28
meal_plan_id: 2026-W28
generated_on: 2026-07-02
store_preferences:
  - costco
  - aldi
items:
  - ingredient_id: spinach
    display_name: Spinach
    required_quantity: 16
    required_unit: ounce
    pantry_quantity: 6
    purchase_quantity: 10
    purchase_unit: ounce
    department: produce
    recipes:
      - green-smoothie
      - chicken-spinach-bowl
    estimated_price_usd: null
    checked: false
```

## Quantity Scaling

Ingredient quantities should be scaled by:

```text
planned servings ÷ recipe servings
```

Example:

```text
Recipe yields 4 servings.
Meal plan requires 6 servings.
Scale factor = 6 ÷ 4 = 1.5.
```

## Unit Conversion

The system should support compatible conversions.

Examples:

```text
16 ounces = 1 pound
3 teaspoons = 1 tablespoon
4 cups = 1 quart
```

Do not automatically convert units when density is required unless the ingredient database contains a valid conversion.

Example:

```text
1 cup flour cannot be converted to grams without an ingredient-specific density.
```

## Duplicate Aggregation

Aggregate only when the ingredient ID and form are compatible.

Safe:

```text
2 cups diced onion + 1 cup diced onion = 3 cups diced onion
```

Potentially unsafe:

```text
2 whole onions + 1 cup diced onion
```

These may be combined only when a trusted conversion is available.

## Pantry Subtraction

```yaml
required_quantity: 3
required_unit: cup
pantry_quantity: 1
purchase_quantity: 2
freezer_quantity: 0
checked: false
```

Pantry subtraction should:

1. use compatible units
2. avoid negative purchase quantities
3. respect expiration dates
4. prefer using soon-to-expire items
5. record when pantry data is stale
6. separate pantry and freezer coverage when both exist
7. collapse alias groups before subtraction so equivalent ingredients share one inventory bucket

## Store and Aisle Mapping

Ingredient records may include store-specific locations.

```yaml
store_locations:
  costco:
    department: produce
    aisle: null
  aldi:
    department: produce
    aisle: 1
```

## Cost Estimation

```yaml
price:
  amount_usd: 4.99
  package_quantity: 2
  package_unit: pound
  store: aldi
  checked_on: 2026-07-02
```

Cost estimates should always include:

- store
- package size
- unit
- date checked

## Budget Handling

```yaml
budget:
  weekly_usd: 100
  estimated_total_usd: 87.40
  remaining_usd: 12.60
```

When the estimate exceeds the budget, the system may:

- replace premium proteins
- use more pantry staples
- prefer seasonal produce
- increase batch cooking
- substitute lower-cost recipes

## Waste Reduction

Useful waste-reduction features:

- prioritize recipes sharing ingredients
- schedule delicate produce earlier
- freeze excess portions
- suggest recipes for unused ingredients
- flag package-size mismatches
- carry pantry leftovers into the next week
- show pantry use-soon recommendations
- support purchase checkoffs

## Shopping Modes

Recommended modes:

- full weekly shop
- pantry-first
- budget-first
- warehouse-club
- small-household
- freezer-stock
- quick-restock

## Definition of Done

Layer 5 is complete when:

- grocery lists are generated from meal plans
- duplicate ingredients are combined safely
- quantities scale by servings
- pantry inventory is subtracted
- freezer inventory is subtracted
- items are grouped by department
- recipe sources remain traceable
- cost and store metadata can be added
- substitutions can reduce cost or waste
