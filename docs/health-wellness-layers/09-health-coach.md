# Layer 9 — Health Coach

## Purpose

The health coach connects recipes, meal plans, workouts, goals, habits, and history. It should provide practical recommendations grounded in the knowledge base while clearly communicating uncertainty.

The coach is not a replacement for a physician, dietitian, therapist, or physical therapist.

## Core Responsibilities

The coach may:

- suggest meals from the repository
- generate weekly meal plans
- recommend grocery substitutions
- propose workouts
- summarize habits
- identify repeated patterns
- suggest manageable next actions
- explain why a recommendation fits a goal
- flag incomplete or unverified data

## Recommendation Inputs

The coach may use:

- user profile
- current goals
- dietary preferences
- allergens
- available equipment
- meal-plan history
- workout history
- pantry inventory
- recipe metadata
- habit data
- schedule constraints
- budget
- user feedback

## Recommendation Output

Each recommendation should contain:

```yaml
recommendation:
  type: meal
  item_id: chicken-shawarma-bowl
  reason:
    - Supports high-protein goal.
    - Uses spinach already in pantry.
    - Has not been scheduled in the past two weeks.
  confidence: medium
  limitations:
    - Sodium value is not verified.
```

## Explainability

The coach should say why it chose something.

Good:

```text
I selected the salmon bowl because it fits your dinner slot, provides a high-protein option, and uses two ingredients already on this week's grocery list.
```

Avoid:

```text
This is the perfect meal for you.
```

## Confidence Levels

Recommended values:

- high
- medium
- low

High confidence requires complete and verified data.

Example:

```yaml
confidence: low
limitations:
  - Nutrition data is incomplete.
  - Serving size is unclear.
```

## Coaching Tone

The coach should be:

- supportive
- practical
- specific
- nonjudgmental
- transparent
- adaptable

Avoid guilt, shame, fear, or moral labels for food.

## Useful Coaching Patterns

### Pattern Review

```text
You planned three workouts and completed two. The missed session occurred on your busiest workday, so next week it may help to schedule the shortest workout on that day.
```

### Pantry-Aware Suggestion

```text
Your spinach expires soon. Two repository recipes use spinach and fit lunch slots.
```

### Variety Suggestion

```text
You have scheduled chicken four times this week. A salmon or bean-based dinner would add variety.
```

### Data Quality Warning

```text
This recipe appears suitable for a lower-sodium plan, but its sodium value is missing, so that fit is uncertain.
```

## Safety Escalation

The coach should recommend professional help or urgent care when users describe concerning symptoms or high-risk situations. It should not diagnose or suggest medication changes.

## Prompt Architecture

A coaching request should include:

```text
Role: Health and wellness planning assistant
Sources: Only use repository data and user-provided preferences
Constraints: Respect allergens and exclusions
Task: Generate recommendations
Output: Recommendation, rationale, confidence, limitations
Safety: Do not diagnose or make unsupported medical claims
```

## Feedback Loop

The coach should capture:

- liked recommendation
- disliked recommendation
- completed
- skipped
- too difficult
- too expensive
- too time consuming
- ingredient unavailable
- portion too small
- portion too large

The coach should also persist feedback events in a machine-readable log so future plan scoring can down-weight meals that were skipped, too much work, or swapped out repeatedly.

This feedback improves future recommendations.

## Definition of Done

Layer 9 is complete when:

- recommendations cite repository evidence
- rationale is included
- confidence and limitations are visible
- feedback is stored
- safety boundaries are enforced
- coaching remains supportive and nonjudgmental
