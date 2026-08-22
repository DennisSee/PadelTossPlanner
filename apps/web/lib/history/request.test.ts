import { describe, expect, it } from "vitest";
import { InvalidTosRequestError } from "../tos/request";
import { parseHistoryContactAction } from "./request";

const ID = "11111111-1111-4111-8111-111111111111";

function form(fields: Record<string, string>): FormData {
  const value = new FormData();
  for (const [key, entry] of Object.entries(fields)) value.append(key, entry);
  return value;
}

describe("history contact request parser", () => {
  it("accepts only the identifier belonging to the selected action", () => {
    expect(parseHistoryContactAction(form({ action: "request", other_member_id: ID }))).toEqual({ action: "request", otherMemberId: ID });
    expect(parseHistoryContactAction(form({ action: "accept", request_id: ID }))).toEqual({ action: "accept", requestId: ID });
  });

  it("rejects authority extras and malformed identifiers", () => {
    expect(() => parseHistoryContactAction(form({ action: "request", other_member_id: ID, email: "leak@example.test" }))).toThrow(InvalidTosRequestError);
    expect(() => parseHistoryContactAction(form({ action: "accept", request_id: "attacker" }))).toThrow(InvalidTosRequestError);
  });
});
