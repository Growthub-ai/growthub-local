# Output Directory

All Postiz Social + AEO Studio artifacts are written here: `output/<client-slug>/<project-slug>/`.

---

## Artifact set

| File pattern | Description |
|---|---|
| `CalendarWeekPlan_v*_*.md` | Week-level schedule and UTMs |
| `ChannelMixMatrix_v*_*.md` | Channel roles, cadence, measurement |
| `ContentSprintBrief_v*_*.md` | Sprint scope, inputs, automation intent |
| `LaunchPostPack_v*_*.md` | Channel variants + compliance checklist |
| `AnalyticsReadout_v*_*.md` | Windowed performance narrative |

---

## Naming

```
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

See `output-standards.md` for OutputType strings.

---

## Deliverable log

Append to `brands/<client-slug>/brand-kit.md`:

```
- YYYY-MM-DD | Postiz Social Pack v<N> — <Project> | output/<client-slug>/<project-slug>/
```
