# Implementation Roadmap

## Purpose

This roadmap sequences the project so the data foundation is reliable before advanced coaching features are added.

## Phase 1 — Normalize the Repository

### Deliverables

- recipe schema
- templates
- migration script
- validation script
- controlled vocabularies
- dessert category
- stable recipe IDs

### Acceptance Criteria

- every recipe has YAML front matter
- every recipe validates
- missing values remain `null`
- no recipe content is lost
- nutrition source status is visible

## Phase 2 — Build Search and Indexing

### Deliverables

- JSON recipe index
- CSV recipe index
- filter functions
- duplicate-ID checks
- tag reports
- missing-data reports

### Acceptance Criteria

The system can filter by:

- meal type
- calories
- protein
- fiber
- sodium
- preparation time
- allergens
- dietary tags
- goal tags
- verification status

## Phase 3 — Build the Meal Planner

### Deliverables

- weekly template
- randomized generation
- deterministic seed
- repeat prevention
- leftover support
- nutrition summaries

### Acceptance Criteria

The system fills:

- breakfast
- snack 1
- lunch
- snack 2
- dinner
- dessert

The planner respects exclusions and reports missing data.

## Phase 4 — Build Grocery Intelligence

### Deliverables

- ingredient normalization
- quantity scaling
- unit conversion
- pantry subtraction
- freezer subtraction
- purchase checkoffs
- use-soon recommendations
- department grouping
- grocery export

### Acceptance Criteria

The generated list:

- traces items to recipes
- combines safe duplicates
- avoids negative quantities
- groups by department
- accounts for planned servings

## Phase 5 — Add Workouts

### Deliverables

- exercise schema
- workout schema
- workout generator
- equipment filtering
- completion logs
- progression logs

### Acceptance Criteria

The system generates workouts based on:

- duration
- equipment
- difficulty
- goal
- recovery constraints

## Phase 6 — Add Goals and Habits

### Deliverables

- goal schema
- milestone tracking
- habit definitions
- daily logs
- weekly summaries

### Acceptance Criteria

The system can:

- connect habits to goals
- calculate weekly completion
- show trends
- recommend one or two next actions

## Phase 7 — Add the Health Coach

### Deliverables

- recommendation engine
- rationale generation
- confidence levels
- limitation warnings
- feedback capture
- safety rules
- automated delivery cadence for weekly plans, shopping reminders, prep checklists, and dinner cards

### Acceptance Criteria

Every recommendation includes:

- selected item
- reason
- confidence
- limitations
- source data

## Phase 8 — Add Delivery Automation

### Deliverables

- scheduled generation for the next weekly plan
- Saturday shopping reminders
- Sunday prep checklists
- weekday dinner cards with thawing and cook steps
- a feedback log that updates future scoring

### Acceptance Criteria

- the assistant can emit the correct card for the current Eastern-time schedule
- feedback entries can be appended and reused by the planner
- semantically similar inventory items subtract from a shared alias group

## Phase 9 — Build the Application Layer

### Recommended Order

1. command-line interface
2. local web application
3. authentication
4. private data storage
5. mobile-friendly interface
6. integrations

### Suggested Initial Commands

```text
health recipes search
health plan generate
health grocery build
health workout random
health habit log
health summary weekly
```

## Testing Strategy

### Unit Tests

Test:

- YAML parsing
- validation
- unit conversion
- quantity scaling
- filtering
- random seeds

### Integration Tests

Test:

- meal plan to grocery list
- profile to recommendation
- recipe update to index rebuild
- workout completion to weekly summary

### Data Quality Tests

Test:

- duplicate IDs
- broken references
- missing nutrition basis
- negative values
- invalid tags
- unverified sources

## Security and Privacy

Before storing personal data:

- add authentication
- keep private data out of public Git
- encrypt sensitive storage
- support deletion
- log access
- minimize collected information

## Recommended Milestones

### Milestone 1

A validated, searchable recipe repository.

### Milestone 2

A complete weekly plan and grocery list generated from repository data.

### Milestone 3

A workout plan and habit tracker.

### Milestone 4

A private personalized coach with explainable recommendations.

## Definition of Done

The project reaches a stable first release when:

- source files validate
- weekly plans can be generated
- grocery lists can be generated
- workouts can be generated
- habits and goals can be logged
- recommendations explain themselves
- private data is separated and protected
