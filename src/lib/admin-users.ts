import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { listAdminUsersHandler, inviteAdminUserHandler } from "./admin-users-handler";

export type { AdminUser } from "./admin-users-handler";

// NOTE: supabaseClient uses the service-role key (see supabase-provider.ts).
// This key is exposed in the browser bundle via VITE_ prefix — a pre-existing
// project-wide trade-off for this internal admin tool. The auth.admin.* calls
// here run inside createServerFn handlers (server-side only).
export const listAdminUsers = createServerFn().handler(() => listAdminUsersHandler(supabaseClient));

// Arrow wrapper is needed because the handler takes (client, email) rather than TanStack's { data } context shape
export const inviteAdminUser = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => input)
  .handler(({ data }) => inviteAdminUserHandler(supabaseClient, data.email));
