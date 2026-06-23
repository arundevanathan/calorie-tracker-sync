# Calorie Tracker Sync

A scheduled GitHub Actions workflow reconciles Airtable `Daily Summary` from
`Detailed Data`.

- Runs daily at 2:15 AM Asia/Kolkata.
- Rebuilds today through the preceding four completed dates.
- Updates calorie and protein totals plus Junk, Alcohol, and Eating Out calories.
- Deletes a recent summary row only if its date has no detailed entries.
- Leaves `Weight`, `Notes`, today, and older history unchanged.

## Setup

Add the Airtable personal access token as the repository Actions secret
`AIRTABLE_TOKEN`. It needs `data.records:read` and `data.records:write`,
restricted to the Calorie Tracker base.

Use **Actions → Reconcile Daily Summary → Run workflow** for a manual run.
