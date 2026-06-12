# Database Seeds

Optional local/demo seed files live here. They are not mounted automatically and are not part of the Free-Only production path.

If a developer runs a local SQL experiment, they must provide their own local connection string deliberately. Production does not require this folder.

## Files

- `0001_leonardo_demo_twin.sql`: legacy single-profile Leonardo demo seed.
- `0002_historical_starter_profiles.sql`: optional local seed that aligns the local SQL demo data with the five public historical starter profiles used by the Cloudflare Worker and app: Leonardo da Vinci, Isaac Newton, William Shakespeare, Aristotle and Sun Tzu.

Production historical profiles are served by Cloudflare Workers and small public metadata snapshots, not by this local SQL seed path.
