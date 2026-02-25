import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { listAdminUsersHandler, inviteAdminUserHandler } from "./admin-users-handler";

export type { AdminUser } from "./admin-users-handler";

export const listAdminUsers = createServerFn().handler(() =>
  listAdminUsersHandler(supabaseClient),
);

export const inviteAdminUser = createServerFn()
  .inputValidator((input: { email: string }) => input)
  .handler(({ data }) => inviteAdminUserHandler(supabaseClient, data.email));
