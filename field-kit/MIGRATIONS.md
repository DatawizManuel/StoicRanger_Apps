# SR Field Kit — data file and migrations

Standing rule: device data is never lost. Migrations only add or convert, after a backup; a file written by a newer
app version opens read-only and is never written.

## db.json, format 1 (0.1.0)

```
{ "app": "sr-field-kit", "format": 1, "created": ISO, "updated": ISO, "data": { … } }
```

| key | content |
|---|---|
| `sr-breath` | seconds breathed per day, `{ "YYYY-MM-DD": seconds }` |
| `sr-custom` | custom breathing pattern timings |
| `sr-ball` | Drop & wind inputs, always metric (`bMV` m/s, `bMass` g, `bSH` cm, `bZero` m, `bWind` km/h, `bAlt` m, `bTemp` °C, `bMove` km/h) |
| `sr-pos` | last position `{lat, lon, src, acc, alt, t}` |
| `sr-points` | saved points `[{name, lat, lon}]` |
| `settings` | `{units: "metric"|"imp", theme: ""|"light"|"dark"}` |
| `link` | Stoic Ranger link `{linked, dismissed, w, m}` |

Unknown keys are kept unchanged.

## Changes

- 0.1.4 (format 1): no data change.
- 0.1.3 (format 1): no data change.
- 0.1.2 (format 1): no data change (new file back-log.txt, diagnostics only).
- 0.1.1 (format 1): no data change.
- 0.1.0 (format 1): first version, nothing to migrate.
