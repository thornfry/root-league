# Set up hosted Supabase for Root League

Start here once you've seen the site running locally. This walkthrough creates the hosted database, applies the league schema, and prepares Auth for Discord. Have the Root League worktree and the [Supabase dashboard](https://supabase.com/dashboard) open.

## 1. Create the project

1. **Open** the Supabase dashboard and choose **New project**. Select your organization, give the project a recognizable name such as `root-league`, and choose a region near most of the players.
2. **Generate** a database password and save it in your password manager. You'll use it for the database connection, including when you load real Season 1 data.
3. **Create** the project and wait for provisioning to finish. The repo's local database uses PostgreSQL 17. If the dashboard offers a major-version choice, select 17 to match.
4. **Collect** these values from the project. The project reference also appears in the dashboard URL after `/project/`.

| Value | Where to find it | Where you'll use it |
| --- | --- | --- |
| Project reference | Project dashboard URL or Project Settings | Link the CLI to the hosted project |
| Project URL | **Connect** dialog or Project Settings → API Keys | Railway's `VITE_SUPABASE_URL` and GitHub's `SUPABASE_URL` |
| Publishable key (or legacy `anon` key) | **Connect** dialog or Project Settings → API Keys | Railway's `VITE_SUPABASE_ANON_KEY` and GitHub's `SUPABASE_ANON_KEY` |
| Database connection string | **Connect** dialog → connection string | `DATABASE_URL` when seeding the real season |

**Save** the database connection details privately. If your machine has IPv4-only connectivity, choose **Session pooler** in the Connect dialog. The project URL and publishable key are public. Keep the database password, any connection string containing it, and the secret or service-role keys private. [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)

## 2. Prepare hosted Auth

1. **Open** **Authentication → Sign In / Providers** and disable the **Email** provider.
2. **Keep** the global **Allow new users to sign up** setting enabled so first-time Discord users can create an Auth account. The league whitelist controls whether those users can see league data.
3. **Open** the **Discord** provider and copy the callback URL it shows. It normally looks like `https://PROJECT_REF.supabase.co/auth/v1/callback`. You'll paste it into the Discord Developer Portal after the database checks below. [Supabase Auth settings](https://supabase.com/docs/guides/auth/general-configuration) · [Discord provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord)

## 3. Link the CLI and apply the schema

**Run** these commands from the repository root. If `supabase --version` reports that the command is missing, choose a CLI installation method before continuing. [Supabase CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started)

```sh
cd site
supabase --version
supabase login
supabase link --project-ref 'PROJECT_REF'
```

**Replace** `PROJECT_REF` with the reference from step 1. Complete CLI login in the browser and enter your database password in the terminal if prompted.

**Preview** the migration filenames, then apply them once you've confirmed the target is your Root League project.

```sh
supabase db push --dry-run --remote
supabase db push --remote
supabase migration list --remote
```

**Check** that the Local and Remote migration timestamps match. If the CLI says `--remote` is unknown, your CLI uses the linked project by default. Confirm the project reference you linked, then repeat the three commands without `--remote`. If the push errors, save the exact error with credentials removed and resolve it before proceeding. Keep `--include-seed` off, and leave database resets for local development. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

## 4. Verify the hosted database

**Open** the hosted project's **SQL Editor**, create a new query, and run:

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

## 5. Connect Discord and finish the return URL

1. **Register** the Supabase callback from step 2 in your Discord app's **OAuth2 → Redirects**. Leave the app's requested scope at `identify`, as configured in the site.
2. **Enable** the Discord provider in Supabase and paste the Discord client ID and client secret into the provider form. Save the settings. [Discord provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord)
3. **Continue** with the [Railway section of the launch runbook](setup-runbook.md#railway). Once Railway gives you a public domain, open **Authentication → URL Configuration** in Supabase and set **Site URL** and an allowed **Redirect URL** to the site's HTTPS origin. Discord returns to the Supabase callback first, then Supabase returns the browser to Railway. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
4. **Test** Discord sign-in from the Railway home page. After consent, expect to return to the site and see “not invited” until your Discord ID is whitelisted. Follow [Real IDs and data](setup-runbook.md#real-ids-and-data) to set up your admin access and load Season 1.
