# Admin Auth Design: Login + Invite Admins

**Date:** 2026-02-25
**Status:** Approved

## Overview

Wire up Supabase authentication to protect all admin routes behind a login screen, and add an **Admins** page where a super-admin can invite new admins by email. No public registration — all admin accounts are invite-only.

## Architecture

Three parts:
1. **Auth provider** — `supabaseAuthProvider` from `ra-supabase-core`, using the existing `supabaseClient` from `supabase-provider.ts`
2. **Login page cleanup** — Remove placeholder branding ("Acme Inc", dummy credentials hint); update to "Hit Refresh Admin"
3. **Admins page** — Custom route `/admin/admins` with a table of current users and an inline "Invite Admin" form backed by TanStack Start server functions

## Auth Provider

**`src/lib/auth-provider.ts`** (new)
- Calls `supabaseAuthProvider(supabaseClient, { getIdentity })` from `ra-supabase-core`
- `getIdentity` returns `{ id, fullName, email }` from the Supabase session user
- Exports `authProvider`

**`src/routes/admin/$.tsx`** (modify)
- Import `authProvider` and pass it to `<Admin authProvider={authProvider} requireAuth>`
- `requireAuth` ensures all resources redirect to login if unauthenticated

## Login Page

**`src/components/admin/login-page.tsx`** (modify)
- Remove: `<p>Try janedoe@acme.com / password</p>` (line 87)
- Update left panel: replace "Acme Inc" branding with "Hit Refresh Admin" and a relevant tagline
- No functional changes — `useLogin()` already works with `supabaseAuthProvider`

## Admins Page

**`src/lib/admin-users.ts`** (new)
- `listAdminUsers()` — `createServerFn` that calls `supabase.auth.admin.listUsers()` using service role key (server-only)
- `inviteAdminUser({ email })` — `createServerFn` that calls `supabase.auth.admin.inviteUserByEmail(email)` (server-only)
- Both use `process.env.VITE_SUPABASE_URL` and `process.env.VITE_SUPABASE_SERVICE_ROLE_KEY` to construct a server-side Supabase admin client

**`src/components/admin/admins-page.tsx`** (new)
- Table columns: Email | Last Sign In | Created At
- "Invite Admin" button above table → toggles an inline form (email input + Submit + Cancel)
- `useQuery` for list (staleTime 60s), `useMutation` for invite (invalidates list on success)
- Success: shows toast notification; Error: shows error message inline

**`src/components/admin/app-sidebar.tsx`** (modify)
- Add `ShieldCheck` import from lucide-react
- Add `AdminsMenuItem` component and render it in the sidebar

**`src/routes/admin/$.tsx`** (modify)
- Import `AdminsPage` and add `<RouterRoute path="/admins" element={<AdminsPage />} />` in `CustomRoutes`

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/lib/auth-provider.ts` | Create |
| `src/lib/admin-users.ts` | Create |
| `src/components/admin/admins-page.tsx` | Create |
| `src/components/admin/login-page.tsx` | Modify — update branding |
| `src/components/admin/app-sidebar.tsx` | Modify — add AdminsMenuItem |
| `src/routes/admin/$.tsx` | Modify — add authProvider + /admins route |

## Out of Scope

- Forgot password / password reset flow
- OAuth (Google, GitHub) login
- Role-based access control (all admins have equal access)
- Deleting / deactivating admin accounts (use Supabase dashboard)
