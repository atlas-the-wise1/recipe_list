# Recipe Relationship Graph

## Purpose

The recipe relationship graph connects recipes, ingredients, meal plans, substitutions, leftovers, and pairings. It helps the assistant make recommendations that feel coherent rather than random.

## Relationship Types

Recommended recipe relationships:

- similar_to
- pairs_with
- leftover_to
- uses_base_recipe
- substitute_for
- seasonal_alternative
- lower_cost_alternative
- higher_protein_alternative
- vegetarian_alternative
- freezer_companion

## Example

```yaml
relationships:
  similar_to:
    - greek-chicken-bowl
  pairs_with:
    - cucumber-tomato-salad
  leftover_to:
    - chicken-shawarma-wrap
  substitutions:
    - Replace chicken with extra-firm tofu.
```

## Graph Model

Nodes may include:

- recipes
- ingredients
- meal plans
- goals
- workouts
- habits
- equipment

Edges represent relationships.

Example:

```text
Chicken Shawarma Bowl
  ├── pairs_with → Cucumber Tomato Salad
  ├── leftover_to → Chicken Shawarma Wrap
  ├── uses → Chicken Breast
  ├── supports → High Protein Goal
  └── similar_to → Greek Chicken Bowl
```

## Use Cases

The graph enables:

- leftover planning
- recipe substitution
- variety recommendations
- ingredient reuse
- pantry-first meal planning
- “try this next” suggestions
- budget alternatives
- dietary alternatives
- seasonal swaps

## Storage Options

### YAML Relationships

Best for a small repository.

### Generated JSON Graph

```json
{
  "nodes": [],
  "edges": []
}
```

### Graph Database

Useful only when the repository becomes large or the application requires complex multi-hop queries.

## Validation

The relationship validator should confirm:

- referenced IDs exist
- no invalid self-links
- edge types are allowed
- reciprocal relationships are added where appropriate
- archived recipes are not recommended by default

## Definition of Done

The relationship graph is complete when:

- recipes contain relationship fields
- linked IDs are validated
- leftover chains can be generated
- substitutions can be suggested
- ingredient reuse can influence meal plans
- recommendation explanations use graph relationships
