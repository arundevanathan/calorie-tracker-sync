# Calorie Tracker Sync

A scheduled GitHub Actions workflow reconciles Airtable `Daily Summary` from
`Detailed Data`. The repo also contains a lightweight Cloudflare Pages mobile
dashboard that reads live Airtable data through server-side Pages Functions.

- Runs daily at 2:15 AM Asia/Kolkata.
- Rebuilds yesterday through the preceding four completed dates by default.
- Allows a manual test run that includes today.
- Updates calorie and protein totals plus Junk, Alcohol, and Eating Out calories.
- Deletes a recent summary row only if its date has no detailed entries.
- Leaves `Weight`, `Notes`, today, and older history unchanged.

## GitHub Actions setup

Add the Airtable personal access token as the repository Actions secret
`AIRTABLE_TOKEN`. It needs `data.records:read` and `data.records:write`,
restricted to the Calorie Tracker base.

Use **Actions -> Reconcile Daily Summary -> Run workflow** for a manual run. Set
`include_today` to `true` only when you explicitly want a test run to reconcile
today.

## Mobile dashboard setup

Deploy this repo to Cloudflare Pages:

- Build command: leave blank
- Build output directory: `dashboard`
- Functions directory: `functions` at the repo root

Add these Cloudflare Pages environment variables/secrets:

- `AIRTABLE_TOKEN`: Airtable personal access token with read access.
- `AIRTABLE_BASE_ID`: `appVP3GZ2ap1L422y`

Open the deployed dashboard once with:

```text
https://<your-project>.pages.dev/?user=arun
```

The dashboard stores the user in browser local storage, then removes it from the
visible URL. Use the Refresh button after logging a meal to fetch fresh Airtable
data immediately.

## Dashboard API

- `/api/dashboard?user=arun` returns the full mobile dashboard payload.
- `/api/widget?user=arun` returns a small widget-friendly payload.

The Airtable token is used only inside Cloudflare Pages Functions and is never
sent to the browser.
