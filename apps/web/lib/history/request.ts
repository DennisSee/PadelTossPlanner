import { isUuid } from "../tos/parser";
import { exactTextFields, InvalidTosRequestError } from "../tos/request";

export type HistoryContactAction =
  | Readonly<{ action: "request"; otherMemberId: string }>
  | Readonly<{ action: "accept" | "decline" | "cancel" | "revoke"; requestId: string }>;

export function parseHistoryContactAction(formData: FormData): HistoryContactAction {
  const action = formData.get("action");
  if (action === "request") {
    const fields = exactTextFields(formData, { action: 16, other_member_id: 64 });
    if (!isUuid(fields.other_member_id)) throw new InvalidTosRequestError();
    return Object.freeze({ action, otherMemberId: fields.other_member_id });
  }
  if (action === "accept" || action === "decline" || action === "cancel" || action === "revoke") {
    const fields = exactTextFields(formData, { action: 16, request_id: 64 });
    if (!isUuid(fields.request_id)) throw new InvalidTosRequestError();
    return Object.freeze({ action, requestId: fields.request_id });
  }
  throw new InvalidTosRequestError();
}
