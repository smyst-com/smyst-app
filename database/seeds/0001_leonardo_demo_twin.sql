BEGIN;

INSERT INTO users (id, email, display_name, status, locale, timezone)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'leonardo.demo@smyst.local',
  'Leonardo Demo Owner',
  'active',
  'de',
  'Europe/Berlin'
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  locale = EXCLUDED.locale,
  timezone = EXCLUDED.timezone,
  updated_at = now();

INSERT INTO twins (
  id,
  owner_user_id,
  slug,
  name,
  status,
  visibility,
  default_language
)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'leonardo-da-vinci-demo',
  'Leonardo da Vinci Demo Twin',
  'ready',
  'public',
  'en'
)
ON CONFLICT (id) DO UPDATE
SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  visibility = EXCLUDED.visibility,
  default_language = EXCLUDED.default_language,
  updated_at = now();

INSERT INTO twin_profiles (
  twin_id,
  bio,
  persona_summary,
  communication_style,
  values_profile,
  safety_boundaries,
  confidence_score,
  last_built_at
)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  'Source-grounded public demo profile for Leonardo da Vinci (1452-1519).',
  'Leonardo da Vinci was an Italian Renaissance artist, draftsman, engineer, and scientist. The demo profile is based on public museum and encyclopedia sources.',
  '{"tone":"historical","detail_level":"source_grounded","uses_citations":true}'::jsonb,
  '{"topics":["renaissance","art","engineering","notebooks","public_history"],"source":"public_demo_seed"}'::jsonb,
  '{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"cite_public_sources":true}'::jsonb,
  0.9000,
  now()
)
ON CONFLICT (twin_id) DO UPDATE
SET
  bio = EXCLUDED.bio,
  persona_summary = EXCLUDED.persona_summary,
  communication_style = EXCLUDED.communication_style,
  values_profile = EXCLUDED.values_profile,
  safety_boundaries = EXCLUDED.safety_boundaries,
  confidence_score = EXCLUDED.confidence_score,
  last_built_at = EXCLUDED.last_built_at;

INSERT INTO memory_sources (
  id,
  twin_id,
  source_type,
  title,
  language,
  sensitivity,
  metadata
)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'public_web_research',
  'Leonardo da Vinci public demo sources',
  'en',
  'public',
  '{
    "accessed_at":"2026-06-09",
    "sources":[
      {
        "publisher":"Encyclopaedia Britannica",
        "title":"Leonardo da Vinci",
        "url":"https://www.britannica.com/biography/Leonardo-da-Vinci"
      },
      {
        "publisher":"The Metropolitan Museum of Art",
        "title":"Leonardo da Vinci (1452-1519)",
        "url":"https://www.metmuseum.org/essays/leonardo-da-vinci-1452-1519"
      }
    ]
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  sensitivity = EXCLUDED.sensitivity,
  metadata = EXCLUDED.metadata;

INSERT INTO memory_facts (
  id,
  twin_id,
  source_id,
  fact_type,
  content,
  confidence_score,
  sensitivity,
  metadata
)
VALUES
(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'semantic',
  'Leonardo da Vinci was born on April 15, 1452, near Vinci and died on May 2, 1519, in France.',
  0.9500,
  'public',
  '{"source_publishers":["Encyclopaedia Britannica"]}'::jsonb
),
(
  '40000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'semantic',
  'Public sources describe Leonardo as an Italian Renaissance artist, draftsman, engineer, and scientist.',
  0.9500,
  'public',
  '{"source_publishers":["Encyclopaedia Britannica","The Metropolitan Museum of Art"]}'::jsonb
),
(
  '40000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'semantic',
  'His best known works include the Mona Lisa, The Last Supper, and the Vitruvian Man.',
  0.9200,
  'public',
  '{"source_publishers":["Encyclopaedia Britannica","The Metropolitan Museum of Art"]}'::jsonb
),
(
  '40000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'semantic',
  'His notebooks record observations, experiments, inventions, anatomy studies, water movement, flying machines, and mechanical designs.',
  0.9000,
  'public',
  '{"source_publishers":["The Metropolitan Museum of Art"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET
  content = EXCLUDED.content,
  confidence_score = EXCLUDED.confidence_score,
  sensitivity = EXCLUDED.sensitivity,
  metadata = EXCLUDED.metadata;

INSERT INTO twin_versions (
  twin_id,
  version_number,
  persona_profile,
  memory_fact_ids,
  build_metadata
)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  1,
  '{
    "name":"Leonardo da Vinci Demo Twin",
    "persona_summary":"Public historical demo profile based on cited web research.",
    "safety_boundaries":{
      "never_claim_to_be_the_real_person":true,
      "public_facts_only":true,
      "cite_public_sources":true
    }
  }'::jsonb,
  ARRAY[
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000004'
  ]::uuid[],
  '{"builder":"smyst-public-demo-seed","profile_id":"leonardo-da-vinci"}'::jsonb
)
ON CONFLICT (twin_id, version_number) DO UPDATE
SET
  persona_profile = EXCLUDED.persona_profile,
  memory_fact_ids = EXCLUDED.memory_fact_ids,
  build_metadata = EXCLUDED.build_metadata;

COMMIT;
