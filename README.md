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
