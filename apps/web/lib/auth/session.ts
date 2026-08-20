import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountContext, AccountIdentity } from "./account-context";
import { AccountContextRepository } from "./account-repository";
import type { SafeReturnPath } from "./return-path";
import { createServerSupabaseClient } from "../supabase/server";

export async function verifiedIdentity(
  client: SupabaseClient,
): Promise<AccountIdentity | null> {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : "";
  const email = typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (error || !userId || !email) return null;
  return Object.freeze({ userId, email });
}

export async function loadCurrentAccountContext(): Promise<AccountContext | null> {
  const client = await createServerSupabaseClient();
  return loadAccountContextWithClient(client);
}

export async function loadAccountContextWithClient(
  client: SupabaseClient,
): Promise<AccountContext | null> {
  const identity = await verifiedIdentity(client);
  if (!identity) return null;
  return new AccountContextRepository(client).loadOwn(identity);
}

export async function loadOptionalAccountContext(): Promise<AccountContext | null> {
  try {
    return await loadCurrentAccountContext();
  } catch {
    return null;
  }
}

export function destinationForAccount(
  requested: SafeReturnPath,
  account: AccountContext,
): SafeReturnPath {
  if (requested === "/beheer" && !account.capabilities.canPlan) return "/tos";
  return requested;
}
