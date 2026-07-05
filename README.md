# ET's Recipe Book 🍳

Personal recipe library and meal-planning system. Managed by Atlas.

## Current Structure

```text
recipes/
  breakfast/
  lunch/
  dinner/
  snacks/
  drinks/
  meal-prep/

meal-plans/
  health-signal-index.md
  wedding-cut-cookbook.md
  YYYY-MM-weekN.md
  YYYY-MM-weekN-tracker.md
  YYYY-MM-weekN-dashboard.html

shopping-lists/
indexes/
.github/workflows/
tests/

docs/health-wellness-layers/
scripts/
```

## What Lives Where

- `recipes/` holds the canonical recipe markdown files with YAML front matter.
- `meal-plans/` holds generated planning views and weekly trackers.
- `shopping-lists/` holds generated grocery lists.
- `indexes/` holds generated machine-readable recipe indexes and validation summaries.
- `.github/workflows/` holds repository automation.
- `tests/` holds validator fixtures and regression tests.
- `docs/health-wellness-layers/` contains the broader knowledge-base specs for future recipe, ingredient, goal, habit, and workout layers.
- `scripts/` contains the generator and validation utilities.

## Health Goals

- Low cholesterol
- Heart healthy
- Keto-friendly
- Fat loss focused

## Healthy Chef Planner

The meal-planning job lives in `scripts/healthy-chef.mjs`.
Its slot targets, dessert cap, leftover batching rules, and pantry inventory live in `config/healthy-chef.json`.

Health score signals:

- `7-10` = healthy
- `5-6` = balanced
- `0-4` = treat / limit

Generated outputs:

- `meal-plans/health-signal-index.md`
- `meal-plans/wedding-cut-cookbook.md`
- `meal-plans/YYYY-MM-weekN.md`
- `shopping-lists/YYYY-MM-weekN.md`

Weekly plan outputs now include:

- daily calorie, protein, fiber, and sodium totals
- weekly averages and missing-nutrition flags
- planned leftovers with batch-prep quantities
- pantry-aware shopping quantities split into required, pantry, and purchase amounts
- freezer-aware shopping quantities, purchase checkoffs, and use-soon pantry warnings
- canonical inventory alias groups so semantically similar items subtract from the same stock pool
- delivery-ready plan, shopping, prep, and per-dinner dinner-card artifacts under `meal-plans/deliveries/`
- feedback capture via `meal-plans/healthy-chef-feedback.jsonl`

Automation:

- `scripts/healthy-chef-deliveries.mjs` generates the scheduled cards and can POST them to `HEALTHY_CHEF_WEBHOOK_URL`
- `.github/workflows/healthy-chef-ops.yml` checks the Eastern schedule hourly and emits the correct delivery when the local time matches within a 20-minute late window
- `meal-plans/delivery-log.jsonl` records successful webhook deliveries during a run, while webhook requests also carry an `idempotency-key` header so the receiver can reject duplicates across separate GitHub Actions checkouts
- the workflow uses a `healthy-chef-deliveries` concurrency group so overlapping scheduled runs cannot race each other

## Recipe Format

Each recipe is a Markdown file that begins with YAML front matter and includes:

- stable ID and title
- meal types and servings
- prep, cook, and total time
- nutrition values
- ingredient metadata
- health tags and goal tags
- meal-prep notes
- recipe relationships
- source and nutrition verification status

## Validation

Use `scripts/validate_recipe_repo.py` to check the repo for:

- malformed YAML front matter
- duplicate recipe IDs
- missing required fields
- invalid ingredient units
- broken relationship references
- empty required strings and invalid empty lists

The validator can also generate:

- `indexes/recipes.json`
- `indexes/validation-summary.json`
- `indexes/validation-summary.md`

CI runs the validator and tests on every push and pull request.

## Meal Planning

Weekly plans live in `meal-plans/` and reference recipes by filename.
Shopping lists auto-generated from weekly plans live in `shopping-lists/`.
The curated `meal-plans/wedding-cut-cookbook.md` file is the healthy-first recipe pool for fast weekly and daily planning.
