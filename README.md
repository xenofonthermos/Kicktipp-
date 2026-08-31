# Bundesliga-Kicktipp-Prognose – Daten + Prognose-Engine

Automatisch generierte Tippempfehlungen für eine private Kicktipp-Spassrunde.

- `predictions.json` — von der Flutter-App abgerufene, maschinenlesbare Prognose für den aktuellen (und nächsten) Spieltag
- `predictions.md` — dieselben Daten menschenlesbar, direkt für Kicktipp verwendbar
- `app/` — Node.js-Prognose-Engine (Elo-Modell, Poisson-Score-Grid, Markt-Blend, Kicktipp-Erwartungswert-Tipp). Spiegel des Backends aus dem privaten Projekt `Bundesliga-Kicktipp-Prognose` (dort liegt auch die zugehörige Flutter-App, die hier bewusst nicht mitgespiegelt wird).
- `.github/workflows/predict.yml` — GitHub-Actions-Workflow, der `app/` mehrmals täglich automatisch ausführt und `predictions.json`/`.md` sowie `app/data/lineupHistory.json` aktualisiert committet. Kann auch manuell über den "Run workflow"-Button im Actions-Tab angestoßen werden.

Die Prognose ist reiner Unterhaltungswert, keine Wett- oder Anlageempfehlung, keine Garantie auf Richtigkeit.
