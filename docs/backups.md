# Backups

The database (Cloud Firestore) is backed up **every day**, and each backup is kept for **7 days**. If something is deleted or broken by mistake (a bad change, a bug), the database can be restored from any of the last 7 days.

Photos (Cloud Storage) aren't in these backups. Deleted photos are kept for 7 days by Storage's soft delete (on by default for new buckets; check under Cloud Storage → your bucket → Protection).

## Turn it on (once)

**Easiest, in the browser:** [Google Cloud console → Firestore → Disaster recovery](https://console.cloud.google.com/firestore/databases/-default-/disaster-recovery?project=prayerapp-4ce99) → **Create backup schedule** → **Daily**, keep for **7 days** → Create.

**Or from Terminal** (needs the Google Cloud CLI, `brew install --cask google-cloud-sdk`, then `gcloud auth login`):

```sh
cd ~/prayerapp/firebase
npm run backups:setup   # creates the daily schedule
npm run backups:list    # shows the backups (the first appears within a day)
```

Cost: a few cents a month at this size.

## Restoring

Restoring creates a **new** database from a backup; it never overwrites the live one, so nothing is lost by trying. In the console: Firestore → Disaster recovery → pick a backup → **Restore** to a new database (e.g. `restore-2026-11-12`), look at the data there, then copy back what's needed. Ask for help before doing this: copying back is a careful, one-off job.

## Privacy

Deleting an account removes the person's data from the live database at once; it can stay in the backups for up to 7 days until they expire. The privacy policy says so.
