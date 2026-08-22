import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "../tos/parser";
import {
  parseAcceptedContactEmail,
  parseContactRequests,
  parseHistoryClubmates,
  parseHistoryEvents,
  parseSharedHistory,
} from "./parser";
import type { HistoryContactRequest } from "./types";

export class HistoryRepositoryError extends Error {
  constructor() {
    super("De historie kon niet worden geladen.");
    this.name = "HistoryRepositoryError";
  }
}

type RpcResult = Readonly<{ data?: unknown; error?: unknown }>;

function safe<T>(parse: (value: unknown) => T, result: RpcResult): T {
  if (result.error) throw new HistoryRepositoryError();
  try { return parse(result.data); } catch {
    throw new HistoryRepositoryError();
  }
}

export class HistoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async history() {
    return safe(parseHistoryEvents, await this.client.rpc("my_tos_history") as RpcResult);
  }

  async clubmates() {
    return safe(parseHistoryClubmates, await this.client.rpc("my_tos_clubmates") as RpcResult);
  }

  async sharedHistory(otherMemberId: string) {
    if (!isUuid(otherMemberId)) throw new HistoryRepositoryError();
    return safe(parseSharedHistory, await this.client.rpc("my_shared_tos_history", {
      p_other_member_id: otherMemberId,
    }) as RpcResult);
  }

  async contactRequests(): Promise<HistoryContactRequest[]> {
    return safe(parseContactRequests, await this.client.rpc("my_history_contact_requests") as RpcResult);
  }

  async acceptedContactEmail(otherMemberId: string): Promise<string | null> {
    if (!isUuid(otherMemberId)) throw new HistoryRepositoryError();
    return safe(parseAcceptedContactEmail, await this.client.rpc("my_accepted_history_contact", {
      p_other_member_id: otherMemberId,
    }) as RpcResult);
  }

  async requestContact(otherMemberId: string): Promise<void> {
    if (!isUuid(otherMemberId)) throw new HistoryRepositoryError();
    const result = await this.client.rpc("request_history_contact", { p_other_member_id: otherMemberId }) as RpcResult;
    if (result.error || typeof result.data !== "string" || !isUuid(result.data)) throw new HistoryRepositoryError();
  }

  async respondContact(requestId: string, accept: boolean): Promise<void> {
    if (!isUuid(requestId)) throw new HistoryRepositoryError();
    const result = await this.client.rpc("respond_history_contact", { p_request_id: requestId, p_accept: accept }) as RpcResult;
    if (result.error || result.data !== true) throw new HistoryRepositoryError();
  }

  async cancelContact(requestId: string): Promise<void> {
    if (!isUuid(requestId)) throw new HistoryRepositoryError();
    const result = await this.client.rpc("cancel_history_contact", { p_request_id: requestId }) as RpcResult;
    if (result.error || result.data !== true) throw new HistoryRepositoryError();
  }

  async revokeContact(requestId: string): Promise<void> {
    if (!isUuid(requestId)) throw new HistoryRepositoryError();
    const result = await this.client.rpc("revoke_history_contact", { p_request_id: requestId }) as RpcResult;
    if (result.error || result.data !== true) throw new HistoryRepositoryError();
  }
}
