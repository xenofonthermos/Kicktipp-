# Bundesliga-Kicktipp-Prognose – Daten + Prognose-Engine

Automatisch generierte Tippempfehlungen für eine private Kicktipp-Spassrunde.

- `predictions.json` — von der Flutter-App abgerufene, maschinenlesbare Prognose für den aktuellen (und nächsten) Spieltag
- `predictions.md` — dieselben Daten menschenlesbar, direkt für Kicktipp verwendbar
- `app/` — Node.js-Prognose-Engine (Elo-Modell, Poisson-Score-Grid, Markt-Blend, Kicktipp-Erwartungswert-Tipp). Spiegel des Backends aus dem privaten Projekt `Bundesliga-Kicktipp-Prognose` (dort liegt auch die zugehörige Flutter-App, die hier bewusst nicht mitgespiegelt wird).
- `.github/workflows/predict.yml` — GitHub-Actions-Workflow, der sich selbst plant (`app/src/gate.js`): Er rechnet 55 und 25 Min. vor jedem Anstoß und sonst etwa alle 6 Std., wartet dafür auf dem Runner und stößt sich per `workflow_dispatch` selbst neu an (der stündliche Cron ist nur Fallback). Committet `predictions.json`/`.md` sowie `app/data/*.json`. Manuell über "Run workflow" im Actions-Tab auslösbar.

Die Prognose ist reiner Unterhaltungswert, keine Wett- oder Anlageempfehlung, keine Garantie auf Richtigkeit.
