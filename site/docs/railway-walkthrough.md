# Deploy Root League on Railway

Start here once the Supabase migrations are applied and the Discord provider is enabled. You'll deploy the site from GitHub, then use its Railway address to finish Supabase Auth.

## 1. Connect the GitHub repository

1. **Open** the [Railway dashboard](https://railway.com/dashboard) and create an **Empty Project**. If you already have a Root League service, open it and continue with its settings.
2. **Add** an **Empty Service** to the project. In the service's **Settings → Source**, choose **Connect Repo** and select `thornfry/root-league`. If it’s missing, connect GitHub and grant Railway access to that repository. [Railway services](https://docs.railway.com/services)
3. **Confirm** the connected branch is `main`, which contains the merged website.
4. **Set** **Root Directory** to `/` or leave it blank if it shows the default. The Docker build uses the whole repository, including the league Markdown. [Railway build configuration](https://docs.railway.com/builds/build-configuration)
5. **Set** **Settings → Deploy → Healthcheck Path** to `/`. Leave the custom **Start Command** blank so the image starts Caddy. [Railway healthchecks](https://docs.railway.com/deployments/healthchecks)

## 2. Add the build variables and deploy

1. **Add** `RAILWAY_DOCKERFILE_PATH` with value `/site/Dockerfile` under the service's **Variables → New Variable**. This selects the Dockerfile with the repository root as its build context. [Railway custom Dockerfile path](https://docs.railway.com/builds/dockerfiles#custom-dockerfile-path)
2. **Open** the Root League project's [Supabase dashboard](https://supabase.com/dashboard/project/zxidkklftyuqgsqvkknl) alongside Railway, then click **Connect**.
3. **Paste** the Supabase **Project URL** into a new Railway variable named `VITE_SUPABASE_URL`. For this project, the value is `https://zxidkklftyuqgsqvkknl.supabase.co`.
4. **Paste** the Supabase **Publishable key** into `VITE_SUPABASE_ANON_KEY`. Find it in **Connect** or **Project Settings → API Keys**. The legacy `anon` key also works. These variables go into browser code, so use the public key. [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
5. **Leave** `VITE_AUTH_MODE` and `VITE_REPO_URL` unset for the default Discord sign-in and GitHub links.
6. **Deploy** the staged changes from the Railway project canvas once all three variables are in place. Changes to either Supabase variable require a fresh build. [Railway variables](https://docs.railway.com/variables) · [Docker build arguments](https://docs.railway.com/builds/dockerfiles)
7. **Check** the new **Build Logs** for `site/Dockerfile`, then wait for the deployment to become **Active**. If you see Railpack or a missing `start.sh`, check that the new deployment includes `RAILWAY_DOCKERFILE_PATH`. For startup failures, open **Deploy Logs**. [Railway deployment states](https://docs.railway.com/deployments/reference)

## 3. Generate the domain and finish Supabase Auth

1. **Generate** the service's public domain under **Settings → Networking → Public Networking → Generate Domain**. Use the detected target port if Railway asks. [Railway public domains](https://docs.railway.com/deployments/monorepo#3-generate-public-domains)
2. **Open** Supabase **Authentication → URL Configuration**. Paste the new Railway HTTPS address into **Site URL** and add the exact home-page URL, including the trailing `/`, under **Redirect URLs**. Save the changes. Discord still sends the browser back through the Supabase callback you already registered. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
3. **Check** the Railway home page and `/pairings/game/3` in a signed-out browser. Both should load the app's sign-in gate.
4. **Test** the Discord button from the Railway home page. After approving access, you should land back on Railway and see **Not invited** until your Discord ID is whitelisted.
5. **Continue** to [Real IDs and data](setup-runbook.md#real-ids-and-data) once sign-in returns to the site.
