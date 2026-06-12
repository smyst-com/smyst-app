# Database Seeds

This folder intentionally contains no demo, fake, test, or placeholder profile seed data.

Visible profiles must come from real application data through the production API/database flow. The cleanup migration `database/migrations/0006_remove_demo_seed_profiles.sql` removes legacy demo users and their related twins from existing databases.
