# Journal

A separate folder of notes named with a weekday suffix rather than an exact
`YYYY-MM-DD`, two of them sharing a day, to exercise B-081 end to end: the
name rule, the same-day sum and the streak, all against a real Obsidian
render rather than the jsdom stubs the unit tests use.

```stats
columns: 2
items:
  - { label: Entries, source: Journal, agg: count }
  - { label: Longest streak, source: Journal, field: score, agg: streak }
```

```heatmap
source: Journal
field: score
```
