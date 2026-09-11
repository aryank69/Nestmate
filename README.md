# Roomzi

Find your place. Find your people.

Roomzi is a Next.js App Router application for locality-based housing communities, profiles, compatibility, private chat, and community chat. It uses TypeScript, Tailwind CSS, shadcn/ui, Prisma, and Supabase PostgreSQL/Auth/Realtime.

## Prerequisites

- [Node.js 22 or newer](https://nodejs.org/)
- npm (included with Node.js)
- Git and access to this repository
- Access to the shared Roomzi Supabase project

Use the Node.js version currently installed for the project when possible. Do not commit local environment files or copy credentials into issues, commits, or pull requests.

## First-time setup

1. Clone the repository and enter the project:

   ```bash
   git clone https://github.com/aryank69/Nestmate.git Roomzi
   cd Roomzi
   ```

2. Install the exact dependency versions from `package-lock.json`:

   ```bash
   npm ci
   ```

3. Create a local environment file from the tracked template:

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS or Linux:

   ```bash
   cp .env.example .env
   ```

4. Fill in `.env` with values from the shared Supabase project. See [Environment variables](#environment-variables) and [Supabase project setup](#supabase-project-setup).

5. Generate the Prisma client and apply the committed migrations:

   ```bash
   npm run db:generate
   npm run db:deploy
   ```

6. Seed the development cities, localities, and communities. The seed is repeatable, but coordinate with the other developer before running it against a shared environment:

   ```bash
   npm run db:seed
   ```

7. Start the local app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3002](http://localhost:3002). The development script intentionally uses port `3002`.

## Environment variables

`.env.example` is the only environment file that should be committed. Copy it to `.env` and replace every placeholder locally.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Supavisor transaction-pooler URL on port `6543` for application and seed traffic. Keep `[YOUR-PASSWORD]` in the template and at least `uselibpqcompat=true&sslmode=require`; the app injects the encoded password from `DATABASE_PASSWORD`. |
| `DATABASE_POOL_MAX` | No | Maximum runtime PostgreSQL connections per app process. Defaults to `1`, which is the safe starting point for Supavisor transaction mode. |
| `DIRECT_URL` | Yes | Supavisor session-pooler URL on port `5432` for Prisma migrations and administrative commands. Keep the same password placeholder and at least `uselibpqcompat=true&sslmode=require`. |
| `DATABASE_PASSWORD` | Yes | Password for the least-privilege application role used by `DATABASE_URL`. This is secret and must never be committed. |
| `DIRECT_DATABASE_PASSWORD` | Yes | Administrative Supabase database password used only by `DIRECT_URL` for migrations. Never expose it to the application runtime or browser. For backward-compatible local setup, Prisma falls back to `DATABASE_PASSWORD` when this variable is absent. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project API URL, for example `https://PROJECT_REF.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key used by browser and server clients. It is intentionally client-visible; authorization still depends on RLS. Never substitute a secret or service-role key. |
| `NEXT_PUBLIC_SITE_URL` | Yes | App origin used to build Auth callback links. Use `http://localhost:3002` locally and the canonical HTTPS origin in production. |

The checked-in connection-string templates contain placeholders, not credentials. If a password is embedded directly in either database URL, `DATABASE_PASSWORD` is not injected; using the placeholders is preferred for this project.

## Supabase project setup

For a developer joining the existing project:

1. Ask the project owner to invite the developer to the Supabase organization/project with the minimum role needed for development.
2. In the Supabase dashboard, use **Connect** to copy the transaction-pooler and session-pooler connection strings. Put them in `DATABASE_URL` and `DIRECT_URL`, preserving the `[YOUR-PASSWORD]` placeholder used by this repository.
3. Get the project URL and an active publishable key from the project's API settings. Put them in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Share the runtime-role and administrative database passwords through a password manager or another approved private channel. Store them only in the local `.env` as `DATABASE_PASSWORD` and `DIRECT_DATABASE_PASSWORD`; never deploy `DIRECT_DATABASE_PASSWORD` to a runtime that does not execute migrations.
5. Enable **Enforce SSL on incoming connections** in Supabase Database settings. `uselibpqcompat=true&sslmode=require` is the portable encrypted baseline for the installed `pg` driver. For certificate and hostname verification, download the project's Supabase CA certificate and configure the deployment driver with `sslmode=verify-full` plus that certificate.
5. In **Authentication → URL Configuration**:
   - Use the production origin as the Site URL when a production deployment exists; otherwise use `http://localhost:3002`.
   - Add `http://localhost:3002/**` to the redirect allow list for local email confirmation and OAuth callbacks.
   - Add the exact production `https://YOUR_DOMAIN/auth/callback` URL. Avoid broad production wildcards; add preview URLs only when they are intentionally supported.
6. In **Authentication → Providers**, keep Email enabled. For Google sign-in, enable Google and configure its client ID and secret. The Google Cloud OAuth client's authorized redirect URI is `https://PROJECT_REF.supabase.co/auth/v1/callback`; the app then returns through Roomzi's `/auth/callback` route.
7. Run `npm run db:deploy`. The committed migrations create the application schema, Auth profile trigger, RLS policies, RPC functions, private Storage buckets, scheduled jobs, and Realtime publication entries for private and locality-community messages.
8. Confirm **Storage** contains two private buckets created by the migrations:
   - `listing-images`: JPG, PNG, or WebP files up to 5 MB. Valid listing images are served through short-lived signed URLs; only listing owners can upload/delete their paths.
   - `match-documents`: PDF, JPG, or PNG files up to 10 MB. Only authorized participants in the finalized match can upload, download, revoke, or delete documents.
9. Run `npm run db:seed` if the shared development database does not yet contain the seeded Bengaluru, Mumbai, Pune, and Hyderabad localities.

Do not create Auth users in the seed; users are created through Supabase Auth and synchronized to the Roomzi profile tables.

## Production security checklist

- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin. Production Auth callbacks and public listing metadata deliberately fail closed when it is missing or invalid.
- In **Authentication → URL Configuration**, set the same origin as Site URL and allow the exact `/auth/callback` URL.
- Keep Email confirmation enabled. Enable only configured OAuth providers and confirm Google uses Supabase's `/auth/v1/callback` redirect URI.
- In **Authentication → Attack Protection**, enable leaked-password protection when the Supabase plan supports it. Also keep the minimum password length at eight or higher and enable CAPTCHA/rate limits appropriate for public signup.
- Review the Supabase Security Advisor after each production migration. The internal `SafetyActivity`, private analytics-event, and `_prisma_migrations` tables intentionally have RLS with no user policies so Data API access is denied.
- Verify both Storage buckets remain private and retain their file-size, MIME-type, participant/owner, and revocation policies.
- Confirm the recurring-expense and household-bill-reminder cron jobs are active and contain no credentials or external URLs.

Official references: [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Google login](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js locally on port `3002`. |
| `npm run build` | Generate Prisma Client and create a production build. |
| `npm start` | Start the already-built production server (Next.js defaults to port `3000` unless `PORT` is set). |
| `npm test` | Run the automated compatibility, private-chat, community-chat, and community tests. |
| `npx tsc --noEmit` | Run the TypeScript check without writing output. |
| `npm run lint` | Run ESLint. |
| `npm run db:generate` | Regenerate the typed Prisma client after schema or dependency changes. |
| `npm run db:deploy` | Apply committed migrations without creating a new migration. Use this after pulling changes. |
| `npm run db:migrate -- --name descriptive_name` | Create and apply a migration while intentionally changing the Prisma schema. |
| `npm run db:seed` | Upsert the development cities, localities, and communities. |
| `npm run db:studio` | Open Prisma Studio for database inspection. |

## Database change rules

- Use `npm run db:deploy` to consume migrations already committed by another developer.
- Only run `npm run db:migrate -- --name descriptive_name` when intentionally changing `prisma/schema.prisma`.
- Commit `prisma/schema.prisma` and the generated `prisma/migrations/.../migration.sql` together.
- Never edit an applied migration. Add a new migration for corrections.
- Coordinate before applying schema changes to the shared Supabase database so only one developer owns a migration at a time.
- Keep RLS and Realtime changes in migrations, not as undocumented dashboard-only SQL.

## Two-person Git workflow

The repository uses short-lived feature branches and pull requests. Do not develop directly on `main`.

1. Pull the latest `main`:

   ```bash
   git switch main
   git pull --ff-only origin main
   ```

2. Create a focused feature branch:

   ```bash
   git switch -c feat/short-description
   ```

   Use prefixes such as `feat/`, `fix/`, `docs/`, or `chore/`.

3. Make the change, then run the relevant checks. Before opening a pull request, run the full set:

   ```bash
   npm test
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

4. Commit a small, descriptive change:

   ```bash
   git add <changed-files>
   git commit -m "Describe the change"
   ```

5. Push the branch:

   ```bash
   git push -u origin feat/short-description
   ```

6. Open a pull request into `main`. Explain what changed, how it was tested, any migration or environment impact, and include screenshots for visible UI changes.
7. The other developer reviews the pull request. Address comments with additional commits and get approval before merging.
8. Merge the pull request, delete the remote feature branch, then update the local checkout:

   ```bash
   git switch main
   git pull --ff-only origin main
   git branch -d feat/short-description
   ```

Keep pull requests focused. If both developers need the same file or schema area, agree on ownership first to reduce conflicts.

## Pull request checklist

- [ ] The branch started from the latest `main`.
- [ ] No `.env`, credentials, database passwords, secret/service-role keys, or personal data are included.
- [ ] Any database change includes a reviewed Prisma migration and notes its rollout impact.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.
- [ ] Application functionality outside the pull request scope is unchanged.
- [ ] UI changes include desktop and mobile verification notes or screenshots.

## Security and repository hygiene

- `.env*` is ignored, while `.env.example` is intentionally tracked with placeholders only.
- Dependencies, Next.js build output, coverage output, generated Prisma Client files, Vercel state, logs, and TypeScript build metadata are ignored.
- Public Supabase publishable keys are safe to expose to the browser only because RLS protects data access. Never use a secret/service-role key in a `NEXT_PUBLIC_*` variable.
- If a secret is ever committed, remove it from the repository history as appropriate and rotate it immediately in Supabase. Adding it to `.gitignore` afterward is not enough.

## Project structure

```text
app/                 Next.js App Router pages, layouts, actions, and route handlers
components/          Shared product components
components/ui/       Reusable UI primitives
data/                Static/mock data that remains in the frontend
lib/                 Supabase, Prisma, validation, and reusable domain helpers
prisma/              Schema, migrations, and development seed
tests/               Automated and SQL security/integration tests
types/               Shared TypeScript types
```
