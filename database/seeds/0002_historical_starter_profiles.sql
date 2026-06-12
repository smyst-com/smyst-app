BEGIN;

INSERT INTO users (id, email, display_name, status, locale, timezone)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'historical.demo@smyst.local',
  'Historical Demo Owner',
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

INSERT INTO twins (id, owner_user_id, slug, name, status, visibility, default_language)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'leonardo-da-vinci', 'Leonardo da Vinci', 'ready', 'public', 'en'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'isaac-newton', 'Isaac Newton', 'ready', 'public', 'en'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'william-shakespeare', 'William Shakespeare', 'ready', 'public', 'en'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'aristotle', 'Aristotle', 'ready', 'public', 'en'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'sun-tzu', 'Sun Tzu', 'ready', 'public', 'en')
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
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    'Source-grounded historical demo profile for Leonardo da Vinci (1452-1519).',
    'Renaissance art and engineering profile based on public museum and encyclopedia sources.',
    '{"tone":"historical","detail_level":"source_grounded","uses_citations":true}'::jsonb,
    '{"topics":["renaissance","art","engineering","notebooks"],"launch_wave":"low_risk_historical_starter"}'::jsonb,
    '{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"cite_public_sources":true}'::jsonb,
    0.9000,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Source-grounded historical demo profile for Isaac Newton (1642-1727).',
    'Physics and mathematics profile based on public scientific and biographical sources.',
    '{"tone":"historical","detail_level":"source_grounded","uses_citations":true}'::jsonb,
    '{"topics":["physics","mathematics","gravity","optics"],"launch_wave":"low_risk_historical_starter"}'::jsonb,
    '{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"cite_public_sources":true}'::jsonb,
    0.9000,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Source-grounded historical demo profile for William Shakespeare (1564-1616).',
    'Literature and theatre profile based on public literary and biographical sources.',
    '{"tone":"historical","detail_level":"source_grounded","uses_citations":true}'::jsonb,
    '{"topics":["literature","theatre","poetry","public_history"],"launch_wave":"low_risk_historical_starter"}'::jsonb,
    '{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"cite_public_sources":true}'::jsonb,
    0.9000,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'Source-grounded historical demo profile for Aristotle (384-322 BCE).',
    'Ancient philosophy and science profile based on public reference and scholarly sources.',
    '{"tone":"historical","detail_level":"source_grounded","uses_citations":true}'::jsonb,
    '{"topics":["philosophy","logic","ethics","science"],"launch_wave":"low_risk_historical_starter"}'::jsonb,
    '{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"cite_public_sources":true}'::jsonb,
    0.9000,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    'Source-grounded historical demo profile for Sun Tzu.',
    'Strategy and military thought profile based on public reference sources while distinguishing history from tradition.',
    '{"tone":"historical","detail_level":"source_grounded","uses_citations":true}'::jsonb,
    '{"topics":["strategy","military_thought","the_art_of_war","public_history"],"launch_wave":"low_risk_historical_starter"}'::jsonb,
    '{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"distinguish_history_from_legend":true}'::jsonb,
    0.8800,
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

INSERT INTO memory_sources (id, twin_id, source_type, title, language, sensitivity, metadata)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'public_web_research',
    'Leonardo da Vinci public demo sources',
    'en',
    'public',
    '{"sources":[{"publisher":"Encyclopaedia Britannica","title":"Leonardo da Vinci","url":"https://www.britannica.com/biography/Leonardo-da-Vinci"},{"publisher":"The Metropolitan Museum of Art","title":"Leonardo da Vinci (1452-1519)","url":"https://www.metmuseum.org/essays/leonardo-da-vinci-1452-1519"}]}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'public_web_research',
    'Isaac Newton public demo sources',
    'en',
    'public',
    '{"sources":[{"publisher":"Encyclopaedia Britannica","title":"Isaac Newton","url":"https://www.britannica.com/biography/Isaac-Newton"},{"publisher":"The Royal Society","title":"Sir Isaac Newton","url":"https://royalsociety.org/people/isaac-newton-11991/"}]}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    'public_web_research',
    'William Shakespeare public demo sources',
    'en',
    'public',
    '{"sources":[{"publisher":"Encyclopaedia Britannica","title":"William Shakespeare","url":"https://www.britannica.com/biography/William-Shakespeare"},{"publisher":"Shakespeare Birthplace Trust","title":"Shakespeare''s life","url":"https://www.shakespeare.org.uk/explore-shakespeare/shakespedia/william-shakespeare/shakespeares-life/"}]}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000004',
    'public_web_research',
    'Aristotle public demo sources',
    'en',
    'public',
    '{"sources":[{"publisher":"Encyclopaedia Britannica","title":"Aristotle","url":"https://www.britannica.com/biography/Aristotle"},{"publisher":"Stanford Encyclopedia of Philosophy","title":"Aristotle","url":"https://plato.stanford.edu/entries/aristotle/"}]}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000005',
    'public_web_research',
    'Sun Tzu public demo sources',
    'en',
    'public',
    '{"sources":[{"publisher":"Encyclopaedia Britannica","title":"Sunzi","url":"https://www.britannica.com/biography/Sunzi"},{"publisher":"Internet Encyclopedia of Philosophy","title":"Sunzi","url":"https://iep.utm.edu/sunzi/"}]}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET
  twin_id = EXCLUDED.twin_id,
  title = EXCLUDED.title,
  sensitivity = EXCLUDED.sensitivity,
  metadata = EXCLUDED.metadata;

INSERT INTO memory_facts (id, twin_id, source_id, fact_type, content, confidence_score, sensitivity, metadata)
VALUES
  ('41000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'semantic', 'Leonardo da Vinci was a Renaissance artist, draftsman, engineer, and scientist.', 0.9300, 'public', '{"profile_id":"leonardo-da-vinci"}'::jsonb),
  ('41000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'semantic', 'Isaac Newton is associated with classical mechanics, universal gravitation, optics, and calculus.', 0.9300, 'public', '{"profile_id":"isaac-newton"}'::jsonb),
  ('41000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'semantic', 'William Shakespeare was an English playwright, poet, and actor whose works remain central in English literature.', 0.9300, 'public', '{"profile_id":"william-shakespeare"}'::jsonb),
  ('41000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', 'semantic', 'Aristotle influenced logic, ethics, politics, rhetoric, biology, and metaphysics.', 0.9300, 'public', '{"profile_id":"aristotle"}'::jsonb),
  ('41000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', 'semantic', 'Sun Tzu is traditionally associated with ancient Chinese military thought and The Art of War, while parts of the biography remain uncertain.', 0.8800, 'public', '{"profile_id":"sun-tzu"}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET
  twin_id = EXCLUDED.twin_id,
  source_id = EXCLUDED.source_id,
  content = EXCLUDED.content,
  confidence_score = EXCLUDED.confidence_score,
  sensitivity = EXCLUDED.sensitivity,
  metadata = EXCLUDED.metadata;

INSERT INTO twin_versions (twin_id, version_number, persona_profile, memory_fact_ids, build_metadata)
VALUES
  ('20000000-0000-4000-8000-000000000001', 2, '{"name":"Leonardo da Vinci","persona_summary":"Public historical demo profile based on cited public sources.","safety_boundaries":{"never_claim_to_be_the_real_person":true,"public_facts_only":true}}'::jsonb, ARRAY['41000000-0000-4000-8000-000000000001']::uuid[], '{"builder":"smyst-historical-starter-seed","profile_id":"leonardo-da-vinci"}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', 1, '{"name":"Isaac Newton","persona_summary":"Public historical demo profile based on cited public sources.","safety_boundaries":{"never_claim_to_be_the_real_person":true,"public_facts_only":true}}'::jsonb, ARRAY['41000000-0000-4000-8000-000000000002']::uuid[], '{"builder":"smyst-historical-starter-seed","profile_id":"isaac-newton"}'::jsonb),
  ('20000000-0000-4000-8000-000000000003', 1, '{"name":"William Shakespeare","persona_summary":"Public historical demo profile based on cited public sources.","safety_boundaries":{"never_claim_to_be_the_real_person":true,"public_facts_only":true}}'::jsonb, ARRAY['41000000-0000-4000-8000-000000000003']::uuid[], '{"builder":"smyst-historical-starter-seed","profile_id":"william-shakespeare"}'::jsonb),
  ('20000000-0000-4000-8000-000000000004', 1, '{"name":"Aristotle","persona_summary":"Public historical demo profile based on cited public sources.","safety_boundaries":{"never_claim_to_be_the_real_person":true,"public_facts_only":true}}'::jsonb, ARRAY['41000000-0000-4000-8000-000000000004']::uuid[], '{"builder":"smyst-historical-starter-seed","profile_id":"aristotle"}'::jsonb),
  ('20000000-0000-4000-8000-000000000005', 1, '{"name":"Sun Tzu","persona_summary":"Public historical demo profile based on cited public sources and explicit uncertainty handling.","safety_boundaries":{"never_claim_to_be_the_real_person":true,"public_facts_only":true,"distinguish_history_from_legend":true}}'::jsonb, ARRAY['41000000-0000-4000-8000-000000000005']::uuid[], '{"builder":"smyst-historical-starter-seed","profile_id":"sun-tzu"}'::jsonb)
ON CONFLICT (twin_id, version_number) DO UPDATE
SET
  persona_profile = EXCLUDED.persona_profile,
  memory_fact_ids = EXCLUDED.memory_fact_ids,
  build_metadata = EXCLUDED.build_metadata;

COMMIT;
