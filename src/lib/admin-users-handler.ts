import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminUser {
  id: string;
  email?: string;
  last_sign_in_at?: string;
  created_at: string;
}

export async function listAdminUsersHandler(client: SupabaseClient): Promise<AdminUser[]> {
  const { data, error } = await client.auth.admin.listUsers();
  // Throw the full AuthError — it carries .status and .code beyond .message
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
  // Throw the full AuthError — it carries .status and .code beyond .message
  if (error) throw error;
}
