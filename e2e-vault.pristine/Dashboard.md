# Dashboard

```tiles
columns: 2
items:
  - { label: Diary, path: Diary, badge: count }
  - { label: Accent, path: Diary, icon: ⭐, accent: true }
```

```stats
columns: 3
items:
  - { label: Days, source: Diary, agg: count }
  - { label: Average sleep, source: Diary, field: sleep_score, agg: avg }
  - { label: Steps, source: Diary, field: steps, agg: sum }
```

```progress
items:
  - { label: Days logged, source: Diary, agg: count, goal: 40 }
  - { label: Broken on purpose, source: Diary, agg: count }
```

```today
daily: true
weekly: true
```

```countdown
items:
  - { label: Far ahead, date: 2099-01-01 }
  - { label: Long gone, date: 2000-01-01 }
  - { label: Broken on purpose, date: 15.11.2026 }
```

```heatmap
source: Diary
field: sleep_score
bands: [78, 74, 70]
```

```heatmap
source: Diary
feild: sleep_score
```
