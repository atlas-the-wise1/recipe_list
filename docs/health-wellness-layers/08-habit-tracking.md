# Layer 8 — Habit Tracking

## Purpose

Habit tracking records repeatable actions that support larger goals. Habits should be easy to log, easy to review, and flexible enough to avoid all-or-nothing thinking.

## Recommended Habit Categories

- hydration
- protein
- fiber
- vegetables
- fruit
- meal_prep
- workout
- walking
- steps
- mobility
- sleep
- meditation
- medication_reminder
- screen_time
- journaling

## Habit Definition Schema

```yaml
schema_version: 1
id: protein-at-breakfast
title: Include Protein at Breakfast
category: nutrition
status: active
schedule:
  frequency: daily
  days:
    - monday
    - tuesday
    - wednesday
    - thursday
    - friday
    - saturday
    - sunday
target:
  type: boolean
  value: true
linked_goals:
  - increase-daily-protein
reminder:
  enabled: false
  time: null
notes: A qualifying breakfast should contain the profile's selected protein threshold.
```

## Daily Log Schema

```yaml
date: 2026-07-02
habits:
  protein-at-breakfast:
    completed: true
    value: 28
    unit: gram
  water-goal:
    completed: false
    value: 6
    unit: cup
  workout:
    completed: true
    value: 30
    unit: minute
notes:
  - Afternoon schedule made hydration harder.
```

## Weekly Log Schema

```yaml
schema_version: 1
week: 2026-W27
habits:
  water-goal:
    unit: cup
    target_per_day: 8
    values:
      monday: 8
      tuesday: 7
      wednesday: 8
      thursday: 6
      friday: 8
      saturday: 5
      sunday: 7
  workout:
    unit: completed
    target_per_week: 3
    values:
      monday: true
      wednesday: true
      saturday: true
```

## Habit Metrics

Useful metrics include:

- completion count
- completion percentage
- current streak
- longest streak
- weekly average
- rolling seven-day average
- trend direction

Streaks should not be the only measure of success.

## Partial Completion

Habits should allow partial values.

Example:

```yaml
target:
  type: numeric
  value: 8
  unit: cup
actual:
  value: 6
```

This preserves useful progress information.

## Weekly Summary

```yaml
week: 2026-W27
summary:
  strongest_habit: workout
  most_improved_habit: water-goal
  needs_attention: sleep
  wins:
    - Completed all three planned workouts.
  adjustments:
    - Place a water bottle at the desk.
```

## Habit-to-Goal Mapping

```yaml
habit_id: add-vegetable-to-lunch
linked_goals:
  - increase-daily-fiber
  - improve-meal-quality
```

## Reminder Strategy

Reminders should be:

- optional
- user-controlled
- specific
- timed to the behavior
- nonjudgmental
- easy to disable

Example:

```text
Prepare tomorrow's breakfast before cleaning up dinner.
```

## Privacy

Habit history can reveal health and lifestyle patterns. Store it in a private location and avoid committing it to a public repository.

## Definition of Done

Layer 8 is complete when:

- habits have structured definitions
- daily and weekly values can be logged
- partial completion is supported
- habits connect to goals
- summaries can be generated
- reminders are optional
- history is kept private
