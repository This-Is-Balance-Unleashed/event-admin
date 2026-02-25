import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminUser {
  id: string;
  email: string | undefined;
  last_sign_in_at: string | undefined;
  created_at: string;
}

export async function listAdminUsersHandler(client: SupabaseClient): Promise<AdminUser[]> {
  const { data, error } = await client.auth.admin.listUsers();
  if (error) throw error;
  return data.users.map((u) => ({
    id: u.id,
    email: u.email,
    last_sign_in_at: u.last_sign_in_at,
    created_at: u.created_at,
  }));
}

export async function inviteAdminUserHandler(
  client: SupabaseClient,
  email: string,
): Promise<void> {
  const { error } = await client.auth.admin.inviteUserByEmail(email);
  if (error) throw error;
}
