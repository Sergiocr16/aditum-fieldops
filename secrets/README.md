# Secrets (gitignored)

Place your Firebase **service account JSON** here as `service-account.json`.

This whole folder (except this README) is ignored by git. **Never commit credentials.**

Get the file from: Firebase Console → Project Settings → Service accounts → *Generate new private key*.

Used by:
- `mcp/` (env `FIREBASE_SERVICE_ACCOUNT=./secrets/service-account.json`)
- `seed/` (env `FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json`)
