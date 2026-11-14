# Get Paid This Week

Local-first invoicing, PayShap/EFT payment requests, WhatsApp reminders and a cash-flow dashboard for small businesses in Bellville, the Northern Suburbs and Cape Town.

Built as a static MVP: HTML, CSS and JavaScript only. Data lives in the browser (`localStorage`). No paid SaaS, no accounts, no messages sent on anyone's behalf.

## Run it

From this folder:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Or: `./serve.sh`

Then open:

- Landing page: http://127.0.0.1:8765/index.html
- App: http://127.0.0.1:8765/app.html
- App with sample invoices: http://127.0.0.1:8765/app.html?demo=1

## What is in the box

| Path | Purpose |
| --- | --- |
| `index.html` | South African SME landing page (ZAR pricing, local angle, audit CTA) |
| `app.html` | Working MVP: dashboard, invoices, VAT, print-to-PDF, WhatsApp templates, backup |
| `css/styles.css` | Shared brand and layout |
| `js/config.js` | Product config — add Clarke's WhatsApp number here before sharing the site |
| `js/shared.js` | Money, VAT (15%), WhatsApp number and message helpers |
| `js/landing.js` | Audit form (copies or opens a booking message; never auto-sends) |
| `js/app.js` | Invoice app |
| `assets/logo.svg` | Brand mark |
| `SALES_KIT.md` | 15-minute walk-in audit and ready-to-send WhatsApp/email pitches |
| `screenshots/` | Landing page and dashboard captures from the smoke test |

## Before a real client uses it

1. Open **Business settings** and enter their legal name, address, bank, branch, account and PayShap details.
2. Turn on **VAT registered** only if they are registered. The invoice VAT toggle adds 15% (current SARS standard rate).
3. Export a JSON backup regularly. Clearing browser data will otherwise remove invoices.
4. To make the landing-page audit button open WhatsApp, set `whatsapp` in `js/config.js` to an international number such as `"27821234567"`. Leave it blank to copy the booking message instead.

## Verify

```bash
node --check js/config.js js/shared.js js/landing.js js/app.js
python3 -m http.server 8765 --bind 127.0.0.1
python3 tools/verify.py
```
