# Layer 10 — User Profile

## Purpose

The user profile stores preferences and constraints needed to personalize meal plans, grocery lists, workouts, goals, and coaching.

The profile should be kept separate from public recipe content.

## Profile Schema

```yaml
schema_version: 1
id: default-profile
display_name: null
timezone: America/New_York
preferences:
  favorite_cuisines: []
  favorite_foods: []
  disliked_ingredients: []
  preferred_meal_types: []
dietary:
  patterns: []
  allergens: []
  avoid_ingredients: []
  cultural_preferences: []
daily_targets:
  calories_kcal: null
  protein_g: null
  carbohydrate_g: null
  fat_g: null
  fiber_g: null
  sodium_mg: null
meal_prep:
  day: sunday
  cooking_days_per_week: 2
  servings_per_recipe: 4
  maximum_prep_minutes: 120
  freezer_space: medium
budget:
  weekly_grocery_usd: null
  preferred_stores: []
fitness:
  experience_level: beginner
  available_equipment: []
  preferred_workout_days: []
  days_per_week: 3
  preferred_duration_minutes: 30
  location: home
goals: []
privacy:
  store_medical_details: false
  store_weight_history: false
```

## Stable Preferences

Appropriate long-term profile fields include:

- disliked foods
- favorite cuisines
- preferred stores
- available equipment
- meal-prep day
- cooking skill level
- dietary pattern
- accessibility needs
- preferred workout duration

## Short-Lived State

Short-lived information should not be stored in the permanent profile.

Examples:

- today's soreness
- this week's budget exception
- a temporary injury
- food currently in the refrigerator
- vacation schedule
- one-time event meal

Store these in temporary state or weekly planning files.

## Sensitive Data

Potentially sensitive fields include:

- weight
- diagnoses
- medications
- pregnancy status
- eating-disorder history
- mental-health information
- exact location
- laboratory values

These should only be stored when necessary, with explicit user consent, in a private location.

## Derived Targets

Targets should record their source.

```yaml
daily_targets:
  protein_g:
    value: 130
    source: user_selected
    calculated_on: 2026-07-02
```

Avoid presenting generated targets as medical prescriptions.

## Preference Strength

Preferences may have different strengths.

```yaml
preferences:
  ingredients:
    - id: mushrooms
      preference: dislike
      strength: strong
    - id: salmon
      preference: like
      strength: medium
```

## Availability and Schedule

```yaml
schedule:
  workdays:
    - monday
    - tuesday
    - wednesday
    - thursday
    - friday
  earliest_workout_time: "06:30"
  latest_dinner_time: "20:00"
  busiest_days:
    - tuesday
```

This allows the assistant to schedule easier meals and shorter workouts on busy days.

## Accessibility

```yaml
accessibility:
  standing_limit_minutes: null
  grip_limitations: false
  requires_low_impact_workouts: false
  kitchen_constraints: []
```

Accessibility fields should be descriptive rather than diagnostic.

## Profile Update Workflow

1. collect only information needed for the current feature
2. explain why it is useful
3. allow the user to skip fields
4. validate values
5. store privately
6. allow export
7. allow deletion
8. record update date

## Privacy Architecture

Recommended split:

```text
public-recipe-repo/
  recipes/
  ingredients/
  schemas/

private-user-data/
  profile.yml
  habits/
  progress/
  pantry/
  generated-plans/
```

## Definition of Done

Layer 10 is complete when:

- the profile supports meal and workout personalization
- stable preferences are separated from temporary state
- sensitive information is optional
- public and private data are separated
- profile values include provenance where relevant
- users can update or remove stored data
