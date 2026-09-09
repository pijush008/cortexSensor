# Asset Inventory

Every logo, icon and photograph carried over from the legacy Flutter application
in `flutter_version/` into the Next.js + Express platform. All files listed as
"extracted" were verified byte-identical to their source by MD5 on 2026-09-09.

Source tree:

```
flutter_version/flutterVersion/SHM/
├── structural_health_monitoring_app/assets/      # Flutter bundled assets
├── structural_health_monitoring_app/web/         # Flutter web shell
└── structural_health_monitoring_backend/uploads/ # Express static uploads
```

## Brand — `frontend/public/brand/`

| File | Source | Size | Used by |
|---|---|---|---|
| `company-logo.png` | `app/assets/logo/logo2.png` | 599×126 PNG, transparent | Full "Cloudglance Sensinglab Pvt Ltd" wordmark with cloud and ECG marks. Preferred logo — has alpha. |
| `company-logo.jpeg` | `app/assets/logo/logo.jpeg` | 599×126 JPEG, white matte | `login/page.tsx:164`, `layout/sidebar.tsx:196` |
| `favicon.jpg` | `app/assets/logo/web_logo.jpg` | 93×57 JPEG | `app/layout.tsx:9`. A crop of the wordmark — cloud plus "Cl(( ))u". |
| `cloudglance.gif` | `app/assets/cloudglance.gif` | 4.9 MB | Animated brand splash used on the Flutter landing screen. Currently unreferenced in `frontend/src` — see *Open items*. |
| `logo_01.png` | `app/assets/logo_01.png` | 709×215 PNG | **Third-party trademark (Canon).** Placeholder left in the Flutter build. See *Open items*. |

## Photography and UI art — `frontend/public/images/`

| File | Source | Notes |
|---|---|---|
| `bridge.webp` | `app/assets/bridge.webp` | 341 KB structural photo |
| `1.gif` | `app/assets/1.gif` | 586 KB animated loader |
| `csv.png` | `app/assets/csv.png` | CSV export affordance icon |
| `empty.jpg` | `app/assets/empty.jpg` | Empty-state placeholder |

`frontend/public/images/structures/` (`cable-stayed.jpg`, `dam.jpg`,
`hero-bridge.jpg`, `night-bridge.jpg`, `stone-bridge.jpg`) is **not** from the
Flutter version — it was sourced separately for the Next.js marketing and
project pages and is referenced from `app/page.tsx`, `projects/page.tsx` and
`login/page.tsx`.

## Sensor-type icons

The nine sensor glyphs exist in two variants. Both were extracted; they differ
only in styling — the app variant adds a blue outline to icons 2 and 6.

| ID | Sensor type | Unit | Flat variant (canonical) | App variant |
|---|---|---|---|---|
| 1 | Temperature | °C | `backend/uploads/sensors/1.png` | `frontend/public/sensor-icons/1.png` |
| 2 | LVDT | mm | `…/2.png` | `…/2.png` |
| 3 | Accelerometer | m/s² | `…/3.png` | `…/3.png` |
| 4 | Strain Gauge | uS | `…/4.png` | `…/4.png` |
| 5 | Load Cell | uS | `…/5.png` | `…/5.png` |
| 6 | Inclinometer | ° | `…/6.png` | `…/6.png` |
| 7 | Crack meter | mm | `…/7.png` | `…/7.png` |
| 8 | Torque Sensor | Nm | `…/8.png` | `…/8.png` |
| 9 | Humidity Sensor | % | `…/9.png` | `…/9.png` |

Flat variants come from `structural_health_monitoring_backend/uploads/sensors/`
(400×400 PNG). They are the canonical set: `backend/prisma/seed.ts:19-27` writes
`uploads/sensors/<id>.png` into `sensor_types.sensorIcon`, and
`backend/src/app.ts:114` serves them at `/api/uploads/sensors/<id>.png`. The
mapping matches the legacy dump at
`database/structural_health_monitoring.sql:934-943` exactly.

App variants come from `structural_health_monitoring_app/assets/sensor_icon/`
and are served statically by Next.js for client-side rendering that should not
round-trip to the API.

Because the seed depends on these files existing on disk, `backend/.gitignore`
now un-ignores `uploads/sensors/*.png` while keeping every other upload
directory ignored. Without that exception a fresh clone would seed rows whose
`sensorIcon` paths 404.

## Legacy demo media — `backend/uploads/` (git-ignored)

Extracted onto disk but deliberately left untracked, since these are runtime
upload artifacts of the legacy deployment rather than platform assets:

- `projectImage/` — 9 project photos (`37`, `55`, `97`, `99`, `113`). The DB
  dump references `97_*`, `99_*`; `37_*`, `55_*` and `113_image2.jpg` are orphans.
- `users/` — 11 avatars for the legacy accounts Arctano, Pulkit and Rohan. The
  dump also references `Super_14e0ad7f-….jpg`, which is absent from the archive.
- `project_logo/` — empty in the source archive.

## Deliberately not extracted

`structural_health_monitoring_app/web/favicon.png` and `web/icons/Icon-192.png`,
`Icon-512.png`, `Icon-maskable-192.png`, `Icon-maskable-512.png` are the
unmodified Flutter SDK template icons (the Flutter logo). Verified by MD5
against `flutter/packages/flutter_tools/templates/app/web/`. They carry no
project branding.

## Open items

- `brand/logo_01.png` is the Canon corporate logo, a leftover placeholder from
  the Flutter build. It should be deleted or replaced before the platform ships;
  nothing in `frontend/src` references it today.
- `brand/cloudglance.gif` is 4.9 MB and unreferenced. If the splash animation is
  wanted, transcode it to a video or animated WebP first — a 4.9 MB GIF on a
  first paint is not viable.
- The legacy dump references `uploads/users/Super_14e0ad7f-369c-424c-9579-7cca89aad095.jpg`,
  which does not exist in the Flutter archive. Super-admin avatars will 404 if
  the legacy rows are migrated as-is.
