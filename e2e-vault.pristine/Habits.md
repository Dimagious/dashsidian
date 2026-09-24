# Habits

```stats
columns: 3
items:
  - { label: Gym days, source: Diary, field: gym, agg: sum }
  - { label: Longest gym streak, source: Diary, field: gym, agg: streak }
  - { label: Share of gym days, source: Diary, field: gym, agg: avg }
```

```heatmap
source: Diary
field: gym
color: orange
```
