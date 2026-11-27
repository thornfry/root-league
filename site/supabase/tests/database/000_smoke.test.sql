-- Smoke test (F2): proves `supabase test db` runs pgTAP against a stack that
-- has the Supabase auth schema and API roles the later migrations rely on.
-- It checks no league rule. Later test files are numbered 010 and up.
begin;

select plan(7);

select has_schema('public', 'public schema exists');
select has_schema('auth', 'auth schema exists');
select has_table('auth', 'users', 'auth.users exists');
select has_function('auth', 'uid', 'auth.uid() exists');
select has_role('anon', 'anon role exists');
select has_role('authenticated', 'authenticated role exists');
select has_role('service_role', 'service_role role exists');

select * from finish();

rollback;
