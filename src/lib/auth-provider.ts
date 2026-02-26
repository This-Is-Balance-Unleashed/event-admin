import { supabaseAuthProvider } from "ra-supabase-core";
import { supabaseClient } from "./supabase-provider";

export const authProvider = supabaseAuthProvider(supabaseClient, {
  getIdentity: async (user) => ({
    id: user.id,
    fullName: user.user_metadata?.full_name ?? user.email ?? user.id,
    email: user.email,
    avatar: user.user_metadata?.avatar_url,
  }),
});
