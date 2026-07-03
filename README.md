# ET's Recipe Book 🍳

Personal recipe library and meal planning system. Managed by Atlas.

## Structure

```
recipes/
  breakfast/     — Morning meals
  lunch/         — Midday meals
  dinner/        — Evening meals
  snacks/        — Snacks & light bites
  meal-prep/     — Batch cooking & prep recipes

meal-plans/      — Weekly meal plans (YYYY-WXX.md)
shopping-lists/  — Generated shopping lists by week
```

## Health Goals
- Low cholesterol
- Heart healthy
- Keto-friendly
- Fat loss focused

## Healthy Chef Planner

The meal-planning job lives in `scripts/healthy-chef.mjs`.

Health score signals:
- `7-10` = healthy
- `5-6` = balanced
- `0-4` = treat / limit

Generated outputs:
- `meal-plans/health-signal-index.md`
- `meal-plans/wedding-cut-cookbook.md`
- `meal-plans/YYYY-MM-weekN.md`
- `shopping-lists/YYYY-MM-weekN.md`

## Recipe Format

Each recipe saved as `recipe-name.md` with:
- Ingredients + quantities
- Macros (calories, protein, carbs, fat)
- Prep + cook time
- Health tags (keto / heart-healthy / low-cholesterol / high-protein)
- Instructions
- Meal prep notes (if applicable)

## Meal Planning
Weekly plans live in `meal-plans/` and reference recipes by filename.
Shopping lists auto-generated from weekly plans in `shopping-lists/`.
The curated `meal-plans/wedding-cut-cookbook.md` file is the healthy-first recipe pool for fast weekly and daily planning.
