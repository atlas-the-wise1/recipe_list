# Layer 7 — Goals

## Purpose

The goals layer turns broad intentions into measurable outcomes, milestones, habits, and review cycles. Goals connect recipes, meal plans, workouts, and habits.

## Goal Categories

Recommended categories:

- nutrition
- body_composition
- strength
- endurance
- mobility
- consistency
- sleep
- hydration
- stress_management
- preventive_health
- lifestyle

## Goal Schema

```yaml
schema_version: 1
id: increase-daily-fiber
title: Increase Daily Fiber
category: nutrition
status: active
start_date: 2026-07-06
target_date: 2026-09-06
metric:
  name: daily_fiber
  unit: gram
  baseline: 18
  target: 30
measurement:
  frequency: daily
  aggregation: weekly_average
milestones:
  - value: 22
    target_date: 2026-07-20
  - value: 26
    target_date: 2026-08-10
  - value: 30
    target_date: 2026-09-06
recommended_recipe_tags:
  - high_fiber
recommended_workout_tags: []
habits:
  - add-vegetable-to-lunch
  - choose-whole-grain
notes: Increase gradually and maintain adequate hydration.
```

## SMART Goal Structure

A useful goal should be:

- specific
- measurable
- achievable
- relevant
- time-bound

Weak:

```text
Eat healthier.
```

Better:

```text
Increase average daily fiber intake from 18 grams to 30 grams over eight weeks.
```

## Goal Relationships

Goals may reference:

- recipe tags
- workout tags
- habits
- meal-plan templates
- milestone files
- check-in history

## Milestones

Milestones should show meaningful progress.

```yaml
milestones:
  - id: milestone-1
    description: Average 22 grams of fiber for one week.
    status: complete
    completed_on: 2026-07-19
```

## Goal Check-Ins

```yaml
goal_id: increase-daily-fiber
date: 2026-07-20
status: on_track
metric_value: 23.4
wins:
  - Added beans to two lunches.
barriers:
  - Missed tracking on Saturday.
next_actions:
  - Prepare overnight oats for three breakfasts.
```

## Goal Status Values

Recommended values:

- planned
- active
- paused
- complete
- abandoned
- needs_review

## Goal Recommendation Logic

The assistant may recommend content based on goal relationships.

Example:

```text
Goal: increase protein intake
Recommended recipe tags: high_protein
Recommended workout tags: strength
Recommended habits: protein-at-breakfast
```

## Conflicting Goals

The system should flag conflicts rather than silently optimize one goal.

Examples:

- aggressive calorie reduction and muscle gain
- high-volume training and inadequate recovery
- low-sodium target and heavily processed convenience meals
- strict food restrictions and insufficient variety

## Medical Boundaries

Some goals may be medically sensitive. The system should avoid treating or diagnosing conditions. It should recommend professional guidance when the goal involves:

- medication changes
- eating disorders
- pregnancy
- kidney disease
- diabetes management
- cardiovascular symptoms
- severe pain
- rapid or unexplained weight change

## Definition of Done

Layer 7 is complete when:

- goals are measurable
- milestones are defined
- goals connect to habits and content tags
- check-ins are stored
- status values are standardized
- conflicts can be flagged
- medically sensitive goals have safety boundaries
