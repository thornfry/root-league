# Deploy Root League on Railway

Start here once the Supabase migrations are applied and the Discord provider is enabled. If your service already exists, open it and follow the steps from its **Variables** tab.

## 1. Prepare the Railway service

1. **Create** an **Empty Project** in the [Railway dashboard](https://railway.com/dashboard), then add an **Empty Service**. This lets you stage the build settings before connecting GitHub. [Railway services](https://docs.railway.com/services)
2. **Add** `RAILWAY_DOCKERFILE_PATH` with the value `/site/Dockerfile` in the service's **Variables → New Variable**. This tells Railway which Dockerfile to use. The **Config-as-Code** panel is legacy and new services use the variable instead. [Railway custom Dockerfile path](https://docs.railway.com/builds/dockerfiles#custom-dockerfile-path)

## 2. Add the build variables and deploy

1. **Confirm** you're editing the Root League service in the **production** environment. Add `VITE_SUPABASE_URL` with the value `https://zxidkklftyuqgsqvkknl.supabase.co`.
2. **Open** [API Keys for the Root League Supabase project](https://supabase.com/dashboard/project/zxidkklftyuqgsqvkknl/settings/api-keys) and copy the **Publishable key** that starts with `sb_publishable_`. Paste it directly into Railway as `VITE_SUPABASE_ANON_KEY`. The variable name is older than the key format. It accepts the publishable key. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys#find-your-keys)
3. **Connect** `thornfry/root-league` under the service's **Settings → Source → Connect Repo** and confirm the branch is `main`. If the repository is missing, connect GitHub and grant Railway access to it. [Railway service source](https://docs.railway.com/services#service-source)
4. **Keep** **Root Directory** at `/` so Docker can read the league Markdown and site files. Leave **Start Command** blank so the image starts Caddy. Set **Settings → Deploy → Healthcheck Path** to `/`. [Railway build settings](https://docs.railway.com/builds/build-configuration) · [Railway healthchecks](https://docs.railway.com/deployments/healthchecks)
5. **Deploy** from the staged-changes banner on the project canvas. Check that the new **Build Logs** show `site/Dockerfile` and wait for the deployment to become **Active**. [Railway staged changes](https://docs.railway.com/deployments/staged-changes)

**If the build shows Railpack or `start.sh not found`**,, check that `RAILWAY_DOCKERFILE_PATH=/site/Dockerfile` is staged on the service, then apply the staged changes.

**If the live site says “This site has no Supabase address”**, check that both `VITE_SUPABASE_*` names are spelled exactly as above and have values in the production service. Click **Deploy** on the staged changes and wait for the new build. Vite embeds these values during the Docker build, so restarting the current deployment can't supply them. [Railway Docker build arguments](https://docs.railway.com/builds/dockerfiles#using-variables-at-build-time)

## 3. Generate the domain and finish Supabase Auth

1. **Generate** a domain under **Settings → Networking → Public Networking → Generate Domain**. Use Railway's detected target port, or enter `8080` if it asks you to choose a port. The current site is [root-league-production.up.railway.app](https://root-league-production.up.railway.app/). [Railway public domains](https://docs.railway.com/deployments/monorepo#3-generate-public-domains)
2. **Open** Supabase **Authentication → URL Configuration**. Set **Site URL** to the Railway HTTPS address and add the exact home-page URL with a trailing `/` under **Redirect URLs**. Save. Discord continues to use the Supabase callback already registered in the Discord portal. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
3. **Check** the Railway home page and `/pairings/game/3` in a signed-out browser. Both should show the Discord sign-in gate.
4. **Test** the Discord button from the home page. After consent, you should land back on Railway and see **Not invited** until your Discord ID is whitelisted.
5. **Continue** to [Real IDs and data](setup-runbook.md#real-ids-and-data) once sign-in returns to the site.
