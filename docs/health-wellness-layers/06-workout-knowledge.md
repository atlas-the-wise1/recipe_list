# Layer 6 — Workout Knowledge

## Purpose

The workout knowledge layer stores exercises, workouts, and fitness plans in structured files. It enables the assistant to randomize workouts, build regimens, filter by equipment, track progression, and align training with goals.

## Folder Structure

```text
workouts/
├── exercises/
├── sessions/
├── programs/
├── mobility/
├── cardio/
└── recovery/
```

## Exercise Schema

```yaml
schema_version: 1
id: goblet-squat
name: Goblet Squat
movement_pattern: squat
difficulty: beginner
equipment:
  - dumbbell
muscle_groups:
  primary:
    - quadriceps
    - glutes
  secondary:
    - core
instructions:
  - Hold a dumbbell at chest height.
  - Keep the chest tall.
  - Sit the hips down and back.
  - Stand by driving through the feet.
contraindications: []
regressions:
  - bodyweight-squat
progressions:
  - front-squat
video_url: null
```

## Workout Session Schema

```yaml
schema_version: 1
id: full-body-beginner-30
title: Full Body Beginner — 30 Minutes
status: reviewed
duration_minutes: 30
difficulty: beginner
location: home
equipment:
  - dumbbell
  - exercise_mat
goal_tags:
  - general_fitness
  - strength
muscle_groups:
  - full_body
warmup:
  - exercise_id: marching-in-place
    duration_seconds: 120
exercises:
  - exercise_id: goblet-squat
    sets: 3
    reps: 10
    rest_seconds: 60
  - exercise_id: incline-push-up
    sets: 3
    reps: 8
    rest_seconds: 60
cooldown:
  - exercise_id: child-pose
    duration_seconds: 60
estimated_exertion:
  rpe_min: 5
  rpe_max: 7
notes: Stop if you experience sharp pain, dizziness, or unusual shortness of breath.
```

## Program Schema

```yaml
schema_version: 1
id: beginner-strength-4-week
title: Beginner Strength Program
duration_weeks: 4
days_per_week: 3
goal_tags:
  - strength
  - consistency
schedule:
  monday:
    workout_id: full-body-a
  wednesday:
    workout_id: full-body-b
  friday:
    workout_id: full-body-a
progression:
  method: Add repetitions before increasing weight.
  review_frequency_weeks: 1
```

## Workout Filters

The assistant should be able to filter by:

- duration
- difficulty
- equipment
- location
- muscle groups
- impact level
- goal
- recovery demand
- contraindications
- previous training day

## Randomized Workout Rules

Randomization should not be purely random. It should respect:

1. available equipment
2. user experience
3. recent muscle-group workload
4. planned duration
5. injury or mobility constraints
6. recovery needs
7. weekly training goals

## Progression Tracking

```yaml
date: 2026-07-02
workout_id: full-body-beginner-30
completed: true
exercises:
  - exercise_id: goblet-squat
    sets:
      - reps: 10
        weight_lb: 20
      - reps: 10
        weight_lb: 20
      - reps: 12
        weight_lb: 20
session_rpe: 7
notes: Final set was challenging but controlled.
```

## Recovery and Scheduling

Workout planning should consider:

- consecutive high-intensity days
- muscle-group recovery
- sleep quality
- soreness
- recent missed sessions
- planned sports or long walks
- mobility days

## Safety Boundaries

The assistant should:

- avoid diagnosing injuries
- avoid recommending exercise through sharp pain
- encourage medical evaluation for concerning symptoms
- use conservative progressions
- avoid claiming a workout is safe for every user
- distinguish general fitness guidance from clinical rehabilitation

## Definition of Done

Layer 6 is complete when:

- exercises have structured records
- workouts reference exercise IDs
- programs reference workout IDs
- randomization respects constraints
- completion and progression can be logged
- recovery is considered
- safety notes are included
