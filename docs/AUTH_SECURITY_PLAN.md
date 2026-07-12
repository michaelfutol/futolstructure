# FutolStructure Auth And Security Plan

This is the recommended path for adding user accounts, project storage, and secure collaboration without weakening the current engineering workflow.

## Recommendation

Use Vercel for hosting and Supabase for authentication, Postgres storage, and row-level security.

Do not implement a client-only password screen as the final security model. Client-side checks can improve user experience, but they cannot protect project data because browser JavaScript can be inspected and bypassed.

## Product Stages

### Stage 1 - Public portfolio/demo

Goal: publish FutolStructure as a static browser app at:

```text
https://futolstructure.futoltech.com
```

Scope:

- No private project files hosted by default.
- Users can still open/save local `.fstr` files.
- README and screenshots present the product professionally.
- Vercel auto-deploys from the selected GitHub branch.

### Stage 2 - Accounts and cloud projects

Goal: authenticated users can save projects to the cloud.

Recommended stack:

- Supabase Auth for email/password and optional OAuth.
- Supabase Postgres for project metadata.
- Supabase Storage or Postgres JSONB for `.fstr` payloads.
- Row-level security so users only access projects they own or are invited to.
- Vercel environment variables for Supabase URL and public anon key.

Roles:

| Role | Access |
| --- | --- |
| owner | Full project access, billing/export ownership, sharing controls. |
| engineer | Edit model, run reports, export solver files. |
| reviewer | Read-only model/report access. |
| admin | Manage users and organization settings. |

### Stage 3 - Organization workspace

Goal: FutolTech can host teams, projects, and review workflows.

Features:

- Organization/team membership.
- Project folders and timeline history.
- Saved revisions with named checkpoints.
- Audit log for save/load/export events.
- Optional public demo mode separate from authenticated workspaces.

## Suggested Database Shape

```sql
profiles (
  id uuid primary key references auth.users(id),
  display_name text,
  created_at timestamptz default now()
)

organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
)

organization_members (
  organization_id uuid references organizations(id),
  user_id uuid references auth.users(id),
  role text check (role in ('owner', 'admin', 'engineer', 'reviewer')),
  primary key (organization_id, user_id)
)

projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  owner_id uuid references auth.users(id),
  name text not null,
  current_revision_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  created_by uuid references auth.users(id),
  label text,
  fstr_json jsonb not null,
  app_build text,
  created_at timestamptz default now()
)
```

## Security Rules

- Enable row-level security on every table.
- Users can read projects only when they own the project or belong to the project organization.
- Only owners/admins/engineers can create project revisions.
- Reviewers get read-only access.
- Never store service-role keys in browser code.
- Keep Supabase service-role keys only in Vercel serverless functions if needed.
- Treat exported solver files as private project artifacts.

## App Refactor Needed

The current app is a static single-file workbench. That is good for fast launch, but cloud auth will be cleaner after one of these refactors:

| Option | Pros | Tradeoff |
| --- | --- | --- |
| Keep static app + Supabase client | Fastest login/cloud-save path. | More care needed to keep all access controlled by RLS. |
| Move to Vite app | Better modules, still simple static deployment. | Needs bundling step. |
| Move to Next.js on Vercel | Best for server-side auth, API routes, team features, and protected exports. | Larger migration. |

Recommended sequence:

1. Launch static portfolio/demo first.
2. Add pre-save backups and project revision safety locally.
3. Convert persistence layer to an internal `ProjectStore` interface.
4. Implement `LocalFileProjectStore` and `SupabaseProjectStore`.
5. Add login UI only after row-level security is active.

## Environment Variables

For Supabase:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

If the app remains static, only the public URL and anon key should be exposed. Service-role access requires serverless functions and must never ship to the browser.

## Definition Of Done

- Unauthenticated users cannot read cloud projects.
- A user cannot read or edit another user's project by changing IDs in the browser.
- Every cloud save creates a revision instead of silently overwriting the only copy.
- The app can export/download a local `.fstr` backup even when cloud save fails.
- Login/logout does not affect local-only project workflows.
