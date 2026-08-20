import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import type { AccountContext } from "./account-context";
import { loginPathFor, type SafeReturnPath } from "./return-path";
import { loadAccountContextWithClient, loadCurrentAccountContext } from "./session";

export async function requireAccount(
  next: SafeReturnPath,
  client?: SupabaseClient,
): Promise<AccountContext> {
  let account: AccountContext | null = null;
  try {
    account = client
      ? await loadAccountContextWithClient(client)
      : await loadCurrentAccountContext();
  } catch {
    account = null;
  }
  if (!account) redirect(loginPathFor(next));
  return account;
}

export async function requirePlannerAccount(): Promise<AccountContext> {
  const account = await requireAccount("/beheer");
  if (!account.capabilities.canPlan) redirect("/account");
  return account;
}
