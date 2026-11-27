# Set up Supabase and Discord for Root League

If your hosted Supabase project already exists, start at [Connect Discord sign-in](#2-connect-discord-sign-in). Open both dashboards and copy each value directly into the field that needs it.

## 1. Create the Supabase project

1. **Open** the [Supabase dashboard](https://supabase.com/dashboard) and choose **New project**. Pick your organization, name the project, and choose a region near most players.
2. **Generate** a database password and keep it in your password manager. The project creation form needs it now, and database commands may prompt for it.
3. **Create** the project and wait for provisioning to finish. If the dashboard offers a PostgreSQL version choice, select 17 to match the local stack.

## 2. Connect Discord sign-in

1. **Create** an app named **Root League** in the [Discord Developer Portal](https://discord.com/developers/applications), or open the one you already started. Go to **OAuth2**.
2. **Open** your hosted Supabase project in another tab. Go to **Authentication → Sign In / Providers → Discord** and copy the **Callback URL**. It usually ends in `.supabase.co/auth/v1/callback`.
3. **Paste** that URL into **Discord → OAuth2 → Redirects → Add Redirect** and click **Save Changes**.
4. **Enable** Discord in Supabase. From **Discord → OAuth2 → Client information**, paste the **Client ID** and **Client Secret** directly into the Supabase provider form and click **Save**. If Discord offers **Reset Secret** for the new app, use it to generate the secret when the Supabase form is ready. Keep the secret out of chat and repo files.
5. **Disable** the **Email** provider in Supabase. Keep the global **Allow new users to sign up** setting enabled so first-time Discord users can create an Auth account. The league whitelist controls access to league data.
6. **Confirm** that Discord is enabled in Supabase and that its callback exactly matches the redirect saved in Discord. The site already requests the `identify` scope. You only need the OAuth2 settings in Discord.

The provider is configured at this point. You'll test the full sign-in after Railway has a public URL. Supabase also supports updating these fields through its Management API. For this setup, pasting the Discord credentials directly into Supabase keeps them between the two dashboards. [Discord provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord) · [Supabase Auth settings](https://supabase.com/docs/guides/auth/general-configuration)

## 3. Link the CLI and apply the schema

The Supabase CLI can link the project, preview and apply migrations, and compare migration history. If we're doing this together, I can run those commands once the CLI has project access. If you're running them yourself, use an existing CLI or choose a setup method. [Supabase CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started)

**Open** the Supabase project dashboard and grab the project reference from the URL, immediately after `/project/`. Use it in the link command below.

**Run** these commands from the repository root.

```sh
cd site
supabase --version
supabase login
supabase link --project-ref 'PROJECT_REF'
```

**Replace** `PROJECT_REF` with the reference you just copied. Complete CLI login in the browser and enter your database password directly in the terminal if prompted. If I'm running the CLI and it needs a token or password, use the secure secret prompt.

**Preview** the migration filenames and confirm the target is your Root League project.

```sh
supabase db push --dry-run --remote
```

**Apply** the migrations once the preview looks right, then compare migration history.

```sh
supabase db push --remote
supabase migration list --remote
```

**Check** that the Local and Remote migration timestamps match. If the CLI says `--remote` is unknown, your CLI uses the linked project by default. Confirm the project reference you linked, then repeat the three commands without `--remote`. If the push errors, save the exact error with credentials removed and resolve it before proceeding. Keep `--include-seed` off, and leave database resets for local development. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

## 4. Verify the hosted database

**Run** the query below in the hosted project's **SQL Editor**. To verify from the CLI instead, pass the same query to `supabase db query --remote --read-only`.

```sql
select
  to_regclass('public.seasons') as seasons_table,
  to_regclass('public.whitelist') as whitelist_table,
  (select count(*) from public.seasons) as season_count,
  exists (
    select 1 from public.app_config where key = 'dev_signin'
  ) as dev_signin_configured;
```

**Confirm** that both table names appear, `season_count` is `0` on a fresh project, and `dev_signin_configured` is `false`. Season 1 gets loaded with real Discord IDs after the first hosted sign-in.

## 5. Deploy on Railway and test sign-in

**Follow** the [Railway walkthrough](railway-walkthrough.md) to deploy the site, set the Supabase return URL, and test Discord sign-in.
