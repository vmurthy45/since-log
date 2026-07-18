# Since Log

A small offline-first PWA for counting the days since the moments that matter — habits kicked, milestones hit, dates worth remembering.

- **Counters** — every event as a card with its running day count, category colour, and a progress bar toward the next milestone (round day counts and yearly anniversaries).
- **Categories** — seven built-ins (Health, Habit, Milestone, Relationship, Home, Money, Other) plus your own: pick *Other* and name a custom category, which then becomes reusable.
- **Stats** — totals, a by-category breakdown, upcoming milestones, and written insights.
- **Data** — CSV export / import, all stored locally on your device. Nothing leaves the browser.

Future dates are supported too — they count *down* to their start date.

## Running it

It's a static site with no build step:

```sh
python3 -m http.server 8200
```

Then open <http://localhost:8200>. Add it to your home screen to use it like an app.
