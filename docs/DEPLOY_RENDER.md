# Deploy PortIQ on Render

The root `render.yaml` configures the existing `portiq` FastAPI service and creates a Next.js web service and PostgreSQL database. The API runs migrations, loads the committed v2 model, and seeds the two ports, demo tariffs, and capacity forecasts before accepting traffic.

1. Create a Supabase project for authentication. Enable an asymmetric JWT signing key (ES256 or RS256), then copy its project URL and publishable key. The API checks JWT signatures against Supabase's JWKS; legacy HS256 tokens will not work.
2. In Render, choose **New > Blueprint** and connect `Adi6tea9/portiq` on `main`. Render reads `render.yaml` from the repository root.
3. When Render asks for environment values, enter the same Supabase project URL for `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`. Enter the publishable key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not put a service role key in the frontend.
4. Review the existing API service and two new free resources, then deploy. Wait for `portiq` to pass `/ready`, then open `portiq-web` and sign up or sign in. The first login creates an importer profile in the API database.
5. In Supabase Authentication > URL Configuration, set the Site URL to the Render web URL. Add that URL to the allowed redirect URLs if you use email confirmations or password recovery.

The web app uses the API's Render URL at build time, and the API allows the web app's Render URL through CORS. If either service URL changes, sync the Blueprint and redeploy the web app so its browser bundle gets the new API URL. If `portiq` was already running before Blueprint creation, set its `SUPABASE_URL` in Render's Environment page; `sync: false` values are only prompted for newly created services.

The free Render PostgreSQL database expires after 30 days. Upgrade it before expiry to keep data long term. Free web services may sleep when idle, making the first request slow.

For an operator or admin account, sign in once, then use `python scripts/manage_users.py set-role ...` in an API shell. The script's help and `services/api/README.md` describe the role commands.
