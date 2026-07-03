#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
RECIPE_ROOT = ROOT / "recipes"
MEAL_PLAN_ROOT = ROOT / "meal-plans"

REQUIRED_RECIPE_FIELDS = {
    "schema_version",
    "id",
    "title",
    "status",
    "meal_types",
    "servings",
    "times",
    "nutrition",
    "health_score",
    "tags",
    "dietary_tags",
    "goal_tags",
    "allergens",
    "equipment",
    "ingredients",
    "meal_prep",
    "relationships",
    "source",
}

REQUIRED_INGREDIENT_FIELDS = {
    "display",
    "name",
    "ingredient_id",
    "quantity",
    "unit",
    "preparation",
    "optional",
    "grocery_department",
}

ALLOWED_STATUS_VALUES = {"draft", "reviewed", "verified", "archived"}

CANONICAL_UNITS = {
    "cup",
    "tablespoon",
    "teaspoon",
    "ounce",
    "pound",
    "gram",
    "kilogram",
    "milliliter",
    "liter",
    "fluid_ounce",
    "can",
    "bottle",
    "package",
    "pouch",
    "slice",
    "clove",
    "bunch",
    "sprig",
    "stalk",
    "leaf",
    "each",
    "head",
    "jar",
    "container",
    "packet",
    "serving",
    "fillet",
    "stick",
    "piece",
    "pinch",
    "dash",
    "drop",
    "inch",
}

NUTRITION_FIELDS = (
    "calories_kcal",
    "protein_g",
    "carbohydrate_g",
    "net_carbohydrate_g",
    "fat_g",
    "saturated_fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "cholesterol_mg",
)


@dataclass(frozen=True)
class ValidationError:
    path: Path
    message: str


@dataclass(frozen=True)
class RecipeRecord:
    path: Path
    data: dict[str, Any]


def walk_markdown_files(*roots: Path) -> list[Path]:
    out: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*.md"):
            if path.name.lower() != "readme.md" and path.is_file():
                out.append(path)
    return sorted(out)


def read_front_matter(path: Path, required: bool = True) -> tuple[dict[str, Any] | None, str, list[ValidationError]]:
    errors: list[ValidationError] = []
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        if required:
            errors.append(ValidationError(path, "missing YAML front matter on line 1"))
        return None, raw, errors

    end = raw.find("\n---\n", 4)
    if end == -1:
        errors.append(ValidationError(path, "unterminated YAML front matter"))
        return None, raw, errors

    front_matter_text = raw[4:end]
    body = raw[end + 5 :]
    try:
        parsed = yaml.safe_load(front_matter_text)
    except Exception as exc:  # pragma: no cover - validation path
        errors.append(ValidationError(path, f"malformed YAML front matter: {exc}"))
        return None, body, errors

    if not isinstance(parsed, dict):
        errors.append(ValidationError(path, "front matter must parse to a mapping"))
        return None, body, errors

    return parsed, body, errors


def as_list(value: Any) -> list[Any] | None:
    if value is None:
        return None
    if isinstance(value, list):
        return value
    return None


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_numeric_or_null(value: Any) -> bool:
    return value is None or isinstance(value, (int, float))


def canonical_rel_path(path: Path, root: Path = ROOT) -> str:
    return path.relative_to(root).as_posix()


def collect_recipe_records() -> tuple[list[RecipeRecord], list[ValidationError]]:
    records: list[RecipeRecord] = []
    errors: list[ValidationError] = []
    for path in walk_markdown_files(RECIPE_ROOT):
        data, _, fm_errors = read_front_matter(path)
        errors.extend(fm_errors)
        if isinstance(data, dict):
            records.append(RecipeRecord(path=path, data=data))
    return records, errors


def collect_meal_plan_records() -> tuple[list[RecipeRecord], list[ValidationError]]:
    records: list[RecipeRecord] = []
    errors: list[ValidationError] = []
    for path in walk_markdown_files(MEAL_PLAN_ROOT):
        data, _, fm_errors = read_front_matter(path, required=False)
        errors.extend(fm_errors)
        if isinstance(data, dict):
            records.append(RecipeRecord(path=path, data=data))
    return records, errors


def validate_recipe_record(record: RecipeRecord, all_ids: set[str]) -> list[ValidationError]:
    path = record.path
    data = record.data
    errors: list[ValidationError] = []

    missing = sorted(REQUIRED_RECIPE_FIELDS - set(data))
    for field in missing:
        errors.append(ValidationError(path, f"missing required field: {field}"))

    for field in ("id", "title", "status"):
        if not nonempty_string(data.get(field)):
            errors.append(ValidationError(path, f"{field} must be a non-empty string"))

    status = data.get("status")
    if nonempty_string(status) and status not in ALLOWED_STATUS_VALUES:
        errors.append(ValidationError(path, f"status must be one of {sorted(ALLOWED_STATUS_VALUES)!r}"))

    meal_types = as_list(data.get("meal_types"))
    if meal_types is None:
        errors.append(ValidationError(path, "meal_types must be a list"))
    elif not meal_types:
        errors.append(ValidationError(path, "meal_types must not be empty"))
    else:
        for index, item in enumerate(meal_types):
            if not nonempty_string(item):
                errors.append(ValidationError(path, f"meal_types entry #{index + 1} must be a non-empty string"))

    if not is_numeric_or_null(data.get("servings")):
        errors.append(ValidationError(path, "servings must be numeric or null"))
    elif isinstance(data.get("servings"), (int, float)) and data["servings"] <= 0:
        errors.append(ValidationError(path, "servings must be greater than zero"))

    times = data.get("times")
    if isinstance(times, dict):
        for field in ("prep_minutes", "cook_minutes", "total_minutes"):
            value = times.get(field)
            if not is_numeric_or_null(value):
                errors.append(ValidationError(path, f"times.{field} must be numeric or null"))
            elif isinstance(value, (int, float)) and value < 0:
                errors.append(ValidationError(path, f"times.{field} cannot be negative"))
    else:
        errors.append(ValidationError(path, "times must be a mapping"))

    nutrition = data.get("nutrition")
    if isinstance(nutrition, dict):
        basis = nutrition.get("basis")
        if basis not in {"per_serving", "per_recipe", "per_100g"}:
            errors.append(ValidationError(path, "nutrition.basis must be per_serving, per_recipe, or per_100g"))
        for field in NUTRITION_FIELDS:
            value = nutrition.get(field)
            if not is_numeric_or_null(value):
                errors.append(ValidationError(path, f"nutrition.{field} must be numeric or null"))
            elif isinstance(value, (int, float)) and value < 0:
                errors.append(ValidationError(path, f"nutrition.{field} cannot be negative"))
    else:
        errors.append(ValidationError(path, "nutrition must be a mapping"))

    for field in ("tags", "dietary_tags", "goal_tags", "allergens", "equipment"):
        values = as_list(data.get(field))
        if values is None:
            errors.append(ValidationError(path, f"{field} must be a list"))
            continue
        for index, item in enumerate(values):
            if not nonempty_string(item):
                errors.append(ValidationError(path, f"{field} entry #{index + 1} must be a non-empty string"))

    ingredients = data.get("ingredients")
    if ingredients is None:
        errors.append(ValidationError(path, "ingredients must be present"))
    elif not isinstance(ingredients, list):
        errors.append(ValidationError(path, "ingredients must be a list"))
    else:
        for index, ingredient in enumerate(ingredients):
            if not isinstance(ingredient, dict):
                errors.append(ValidationError(path, f"ingredient #{index + 1} must be a mapping"))
                continue
            missing_ingredient = sorted(REQUIRED_INGREDIENT_FIELDS - set(ingredient))
            for field in missing_ingredient:
                errors.append(ValidationError(path, f"ingredient #{index + 1} missing field: {field}"))

            for field in ("display", "name", "ingredient_id", "grocery_department"):
                if field in ingredient and not nonempty_string(ingredient.get(field)):
                    errors.append(ValidationError(path, f"ingredient #{index + 1} field {field} must be a non-empty string"))

            quantity = ingredient.get("quantity")
            if not is_numeric_or_null(quantity):
                errors.append(ValidationError(path, f"ingredient #{index + 1} quantity must be numeric or null"))

            unit = ingredient.get("unit")
            if unit is not None and not nonempty_string(unit):
                errors.append(ValidationError(path, f"ingredient #{index + 1} unit must be a non-empty string or null"))
            elif isinstance(unit, str) and unit not in CANONICAL_UNITS:
                errors.append(ValidationError(path, f"ingredient #{index + 1} has invalid unit: {unit!r}"))

            preparation = ingredient.get("preparation")
            if preparation is not None and not isinstance(preparation, str):
                errors.append(ValidationError(path, f"ingredient #{index + 1} preparation must be a string or null"))

            optional = ingredient.get("optional")
            if not isinstance(optional, bool):
                errors.append(ValidationError(path, f"ingredient #{index + 1} optional must be true or false"))

    meal_prep = data.get("meal_prep")
    if isinstance(meal_prep, dict):
        if not isinstance(meal_prep.get("friendly"), bool):
            errors.append(ValidationError(path, "meal_prep.friendly must be true or false"))
        for field in ("fridge_days", "freezer_months"):
            value = meal_prep.get(field)
            if not is_numeric_or_null(value):
                errors.append(ValidationError(path, f"meal_prep.{field} must be numeric or null"))
            elif isinstance(value, (int, float)) and value < 0:
                errors.append(ValidationError(path, f"meal_prep.{field} cannot be negative"))
        reheat = meal_prep.get("reheat")
        if reheat is not None and not isinstance(reheat, str):
            errors.append(ValidationError(path, "meal_prep.reheat must be a string or null"))
    else:
        errors.append(ValidationError(path, "meal_prep must be a mapping"))

    relationships = data.get("relationships")
    if isinstance(relationships, dict):
        for field in ("similar_to", "pairs_with", "leftover_to", "substitutions"):
            value = relationships.get(field)
            if value is None:
                continue
            if not isinstance(value, list):
                errors.append(ValidationError(path, f"relationships.{field} must be a list"))
                continue
            for index, item in enumerate(value):
                if not nonempty_string(item):
                    errors.append(ValidationError(path, f"relationships.{field} entry #{index + 1} must be a non-empty string"))
                elif field in {"similar_to", "pairs_with", "leftover_to"} and item not in all_ids:
                    errors.append(ValidationError(path, f"relationships.{field} entry #{index + 1} not found: {item!r}"))
                elif field in {"similar_to", "pairs_with", "leftover_to"} and item == data.get("id"):
                    errors.append(ValidationError(path, f"relationships.{field} cannot reference the recipe itself"))
    else:
        errors.append(ValidationError(path, "relationships must be a mapping"))

    source = data.get("source")
    if isinstance(source, dict):
        if not isinstance(source.get("nutrition_verified"), bool):
            errors.append(ValidationError(path, "source.nutrition_verified must be true or false"))
        for field in ("name", "url", "last_reviewed"):
            value = source.get(field)
            if value is not None and not isinstance(value, str):
                errors.append(ValidationError(path, f"source.{field} must be a string or null"))
    else:
        errors.append(ValidationError(path, "source must be a mapping"))

    return errors


def validate_meal_plan_record(record: RecipeRecord, all_ids: set[str]) -> list[ValidationError]:
    path = record.path
    data = record.data
    errors: list[ValidationError] = []
    refs = data.get("recipes")
    if refs is None:
        return errors
    if not isinstance(refs, list):
        errors.append(ValidationError(path, "recipes must be a list"))
        return errors
    for index, ref in enumerate(refs):
        if not nonempty_string(ref):
            errors.append(ValidationError(path, f"recipes entry #{index + 1} must be a non-empty string"))
            continue
        if not ref.endswith(".md"):
            continue
        ref_id = Path(ref).stem
        if ref_id not in all_ids:
            errors.append(ValidationError(path, f"meal plan recipe reference #{index + 1} not found: {ref}"))
    return errors


def duplicate_id_groups(records: list[RecipeRecord]) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = defaultdict(list)
    for record in records:
        recipe_id = record.data.get("id")
        if isinstance(recipe_id, str) and recipe_id.strip():
            groups[recipe_id].append(record.path)
    return {recipe_id: paths for recipe_id, paths in groups.items() if len(paths) > 1}


def build_recipe_index(records: list[RecipeRecord], root: Path) -> list[dict[str, Any]]:
    index: list[dict[str, Any]] = []
    for record in sorted(records, key=lambda item: str(item.data.get("id") or item.path.name)):
        data = record.data
        nutrition = data.get("nutrition") if isinstance(data.get("nutrition"), dict) else {}
        times = data.get("times") if isinstance(data.get("times"), dict) else {}
        meal_prep = data.get("meal_prep") if isinstance(data.get("meal_prep"), dict) else {}
        source = data.get("source") if isinstance(data.get("source"), dict) else {}
        index.append(
            {
                "id": data.get("id"),
                "title": data.get("title"),
                "path": canonical_rel_path(record.path, root),
                "status": data.get("status"),
                "category": data.get("category"),
                "meal_types": data.get("meal_types", []),
                "servings": data.get("servings"),
                "health_score": data.get("health_score"),
                "tags": data.get("tags", []),
                "dietary_tags": data.get("dietary_tags", []),
                "goal_tags": data.get("goal_tags", []),
                "calories_kcal": nutrition.get("calories_kcal"),
                "protein_g": nutrition.get("protein_g"),
                "fiber_g": nutrition.get("fiber_g"),
                "sodium_mg": nutrition.get("sodium_mg"),
                "prep_minutes": times.get("prep_minutes"),
                "total_minutes": times.get("total_minutes"),
                "meal_prep_friendly": bool(meal_prep.get("friendly", False)),
                "nutrition_verified": bool(source.get("nutrition_verified", False)),
                "ingredients": data.get("ingredients", []),
                "relationships": data.get("relationships", {}),
                "meal_prep": meal_prep,
                "source": source,
            }
        )
    return index


def build_validation_summary(
    recipe_records: list[RecipeRecord],
    meal_plan_records: list[RecipeRecord],
    duplicate_groups: dict[str, list[Path]],
    root: Path,
) -> dict[str, Any]:
    missing_nutrition_fields: Counter[str] = Counter()
    raw_tags: Counter[str] = Counter()
    dietary_tags: Counter[str] = Counter()
    goal_tags: Counter[str] = Counter()
    unverified_nutrition_count = 0

    for record in recipe_records:
        data = record.data
        nutrition = data.get("nutrition") if isinstance(data.get("nutrition"), dict) else {}
        for field in NUTRITION_FIELDS:
            if nutrition.get(field) is None:
                missing_nutrition_fields[field] += 1

        source = data.get("source") if isinstance(data.get("source"), dict) else {}
        if not bool(source.get("nutrition_verified", False)):
            unverified_nutrition_count += 1

        for tag in data.get("tags", []) if isinstance(data.get("tags"), list) else []:
            if isinstance(tag, str) and tag.strip():
                raw_tags[tag] += 1
        for tag in data.get("dietary_tags", []) if isinstance(data.get("dietary_tags"), list) else []:
            if isinstance(tag, str) and tag.strip():
                dietary_tags[tag] += 1
        for tag in data.get("goal_tags", []) if isinstance(data.get("goal_tags"), list) else []:
            if isinstance(tag, str) and tag.strip():
                goal_tags[tag] += 1

    return {
        "recipe_total": len(recipe_records),
        "meal_plan_total": len(meal_plan_records),
        "unverified_nutrition_count": unverified_nutrition_count,
        "missing_nutrition_fields": dict(sorted(missing_nutrition_fields.items())),
        "duplicate_ids": [
            {"id": recipe_id, "paths": [canonical_rel_path(path, root) for path in paths]}
            for recipe_id, paths in sorted(duplicate_groups.items())
        ],
        "tag_usage": {
            "raw": dict(sorted(raw_tags.items())),
            "dietary": dict(sorted(dietary_tags.items())),
            "goal": dict(sorted(goal_tags.items())),
        },
    }


def render_summary_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# Validation Summary")
    lines.append("")
    lines.append(f"- Recipes: {summary['recipe_total']}")
    lines.append(f"- Meal plans: {summary['meal_plan_total']}")
    lines.append(f"- Unverified nutrition: {summary['unverified_nutrition_count']}")
    lines.append("")
    lines.append("## Missing Nutrition Fields")
    lines.append("")
    lines.append("| Field | Missing |")
    lines.append("|---|---:|")
    for field, count in summary["missing_nutrition_fields"].items():
        lines.append(f"| {field} | {count} |")
    lines.append("")
    lines.append("## Duplicate IDs")
    lines.append("")
    if summary["duplicate_ids"]:
        lines.append("| Recipe ID | Paths |")
        lines.append("|---|---|")
        for item in summary["duplicate_ids"]:
            lines.append(f"| {item['id']} | {'; '.join(item['paths'])} |")
    else:
        lines.append("None")
    lines.append("")
    lines.append("## Tag Usage")
    lines.append("")
    for group_name, counts in summary["tag_usage"].items():
        lines.append(f"### {group_name.title()}")
        lines.append("")
        if counts:
            lines.append("| Tag | Count |")
            lines.append("|---|---:|")
            for tag, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
                lines.append(f"| {tag} | {count} |")
        else:
            lines.append("None")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate the recipe repository.")
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root to validate")
    parser.add_argument("--summary-json", type=Path, default=None, help="Write a machine-readable validation summary")
    parser.add_argument("--summary-md", type=Path, default=None, help="Write a Markdown validation summary")
    parser.add_argument("--index-json", type=Path, default=None, help="Write the generated recipe index")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    recipe_root = root / "recipes"
    meal_plan_root = root / "meal-plans"

    recipe_records: list[RecipeRecord] = []
    meal_plan_records: list[RecipeRecord] = []
    errors: list[ValidationError] = []

    for path in walk_markdown_files(recipe_root):
        data, _, fm_errors = read_front_matter(path)
        errors.extend(fm_errors)
        if isinstance(data, dict):
            recipe_records.append(RecipeRecord(path=path, data=data))

    for path in walk_markdown_files(meal_plan_root):
        data, _, fm_errors = read_front_matter(path, required=False)
        errors.extend(fm_errors)
        if isinstance(data, dict):
            meal_plan_records.append(RecipeRecord(path=path, data=data))

    duplicate_groups = duplicate_id_groups(recipe_records)
    all_ids = {recipe_id for recipe_id, paths in duplicate_groups.items() if len(paths) >= 1}
    all_ids.update(
        recipe.data.get("id")
        for recipe in recipe_records
        if isinstance(recipe.data.get("id"), str) and recipe.data["id"].strip()
    )

    for recipe_id, paths in duplicate_groups.items():
        first = paths[0]
        for duplicate_path in paths[1:]:
            errors.append(
                ValidationError(
                    duplicate_path,
                    f"duplicate recipe id {recipe_id!r} also used in {first}",
                )
            )

    for record in recipe_records:
        errors.extend(validate_recipe_record(record, all_ids))

    for record in meal_plan_records:
        errors.extend(validate_meal_plan_record(record, all_ids))

    if errors:
        for error in errors:
            print(f"{error.path}: {error.message}", file=sys.stderr)
        print(f"Validation failed with {len(errors)} issue(s).", file=sys.stderr)
        return 1

    summary = build_validation_summary(recipe_records, meal_plan_records, duplicate_groups, root)
    recipe_index = build_recipe_index(recipe_records, root)

    if args.summary_json is not None:
        write_json(root / args.summary_json, summary)
    if args.summary_md is not None:
        write_text(root / args.summary_md, render_summary_markdown(summary))
    if args.index_json is not None:
        write_json(root / args.index_json, recipe_index)

    print(
        f"Validation passed for {len(recipe_records)} recipe files and {len(meal_plan_records)} meal-plan files.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
