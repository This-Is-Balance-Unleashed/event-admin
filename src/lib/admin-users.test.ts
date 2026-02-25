import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAdminUsersHandler, inviteAdminUserHandler } from "./admin-users-handler";

const mockListUsers = vi.fn();
const mockInviteUser = vi.fn();

const mockClient = {
  auth: {
    admin: {
      listUsers: mockListUsers,
      inviteUserByEmail: mockInviteUser,
    },
  },
} as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAdminUsersHandler", () => {
  it("returns mapped users on success", async () => {
    mockListUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: "uuid-1",
            email: "admin@test.com",
            last_sign_in_at: "2026-02-25T10:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });

    const result = await listAdminUsersHandler(mockClient);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "uuid-1",
      email: "admin@test.com",
      last_sign_in_at: "2026-02-25T10:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("throws on Supabase error", async () => {
    mockListUsers.mockResolvedValueOnce({
      data: null,
      error: new Error("Auth admin error"),
    });

    await expect(listAdminUsersHandler(mockClient)).rejects.toThrow("Auth admin error");
  });
});

describe("inviteAdminUserHandler", () => {
  it("calls inviteUserByEmail with correct email", async () => {
    mockInviteUser.mockResolvedValueOnce({ error: null });

    await inviteAdminUserHandler(mockClient, "new@test.com");

    expect(mockInviteUser).toHaveBeenCalledWith("new@test.com");
  });

  it("throws on Supabase error", async () => {
    mockInviteUser.mockResolvedValueOnce({
      error: new Error("Email already registered"),
    });

    await expect(inviteAdminUserHandler(mockClient, "dup@test.com")).rejects.toThrow(
      "Email already registered",
    );
  });
});
