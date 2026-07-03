from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate_recipe_repo.py"
FIXTURES = ROOT / "tests" / "fixtures" / "validator"


def copy_fixture(case_name: str, target_root: Path) -> None:
    source = FIXTURES / case_name
    shutil.copytree(source, target_root, dirs_exist_ok=True)


def run_validator(case_name: str, workdir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--root",
            str(workdir),
            "--summary-json",
            "indexes/validation-summary.json",
            "--summary-md",
            "indexes/validation-summary.md",
            "--index-json",
            "indexes/recipes.json",
        ],
        cwd=workdir,
        text=True,
        capture_output=True,
        check=False,
    )


class ValidateRecipeRepoTests(unittest.TestCase):
    def run_case(self, case_name: str) -> tuple[subprocess.CompletedProcess[str], Path]:
        tmpdir = Path(tempfile.mkdtemp(prefix="recipe-validator-"))
        copy_fixture(case_name, tmpdir)
        result = run_validator(case_name, tmpdir)
        return result, tmpdir

    def test_valid_fixture_generates_index_and_summary(self) -> None:
        result, workdir = self.run_case("valid")
        self.addCleanup(shutil.rmtree, workdir, True)

        self.assertEqual(result.returncode, 0, result.stderr)

        index_path = workdir / "indexes" / "recipes.json"
        summary_json_path = workdir / "indexes" / "validation-summary.json"
        summary_md_path = workdir / "indexes" / "validation-summary.md"

        self.assertTrue(index_path.exists())
        self.assertTrue(summary_json_path.exists())
        self.assertTrue(summary_md_path.exists())

        index_data = json.loads(index_path.read_text(encoding="utf-8"))
        summary_data = json.loads(summary_json_path.read_text(encoding="utf-8"))

        self.assertEqual(len(index_data), 1)
        self.assertEqual(summary_data["recipe_total"], 1)
        self.assertEqual(summary_data["meal_plan_total"], 1)
        self.assertEqual(summary_data["unverified_nutrition_count"], 0)
        self.assertTrue(all(count == 0 for count in summary_data["missing_nutrition_fields"].values()))

    def test_malformed_yaml_fails(self) -> None:
        result, workdir = self.run_case("malformed-yaml")
        self.addCleanup(shutil.rmtree, workdir, True)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unterminated YAML front matter", result.stderr)
        self.assertFalse((workdir / "indexes" / "recipes.json").exists())

    def test_invalid_unit_fails(self) -> None:
        result, workdir = self.run_case("invalid-unit")
        self.addCleanup(shutil.rmtree, workdir, True)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid unit", result.stderr)

    def test_duplicate_ids_fails(self) -> None:
        result, workdir = self.run_case("duplicate-ids")
        self.addCleanup(shutil.rmtree, workdir, True)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate recipe id", result.stderr)

    def test_empty_values_fails(self) -> None:
        result, workdir = self.run_case("empty-values")
        self.addCleanup(shutil.rmtree, workdir, True)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("title must be a non-empty string", result.stderr)

    def test_relationship_reference_fails(self) -> None:
        result, workdir = self.run_case("invalid-relationship")
        self.addCleanup(shutil.rmtree, workdir, True)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("relationships.similar_to entry #1 not found", result.stderr)


if __name__ == "__main__":
    unittest.main()
