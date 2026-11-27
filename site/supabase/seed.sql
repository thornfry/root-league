-- Local development seed. Applied by `supabase db reset` and never to production
-- (build.md D1; decisions 40 and 41). It holds placeholder data only: every
-- Discord ID below is fake, and no real ID belongs in this file. Real IDs are
-- entered on the Whitelist page or through the seed command's DISCORD_IDS file.

-- Turns on the dev sign-in stand-in: the database then reads a Discord ID from
-- the email `<id>@dev.invalid`. Without this row the stand-in does nothing.
insert into public.app_config (key, value)
values ('dev_signin', 'on')
on conflict (key) do update set value = excluded.value;

-- The placeholder whitelist. Labels equal the Season 1 roster names, so the
-- first sign-in of each persona links to the seeded person of that name
-- (decision 48). The admin is the first admin the seed command also names.
insert into public.whitelist (discord_id, label, is_admin) values
  ('100000000000000001', 'Dev admin', true),
  ('100000000000000002', 'Delaney',   false),
  ('100000000000000003', 'Alex',      false),
  ('100000000000000004', 'Matt',      false),
  ('100000000000000005', 'Nick',      false),
  ('100000000000000006', 'Adam',      false),
  ('100000000000000007', 'Zach',      false),
  ('100000000000000008', 'Kyra',      false),
  ('100000000000000009', 'Anthony',   false),
  ('100000000000000010', 'David',     false),
  ('100000000000000011', 'Will',      false),
  ('100000000000000012', 'Chuck',     false),
  ('100000000000000013', 'Corey',     false),
  ('100000000000000014', 'Spectator', false)
on conflict (discord_id) do nothing;

-- 100000000000000015 is deliberately not whitelisted: it is the persona that
-- signs in and sees only "not invited".
