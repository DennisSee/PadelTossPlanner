import { isUuid } from "./parser";
import type { StaffSportProfileWrite, TosSport } from "./types";

export class InvalidMemberManagementRequestError extends Error {
  constructor() {
    super("Het sportprofiel is ongeldig.");
    this.name = "InvalidMemberManagementRequestError";
  }
}

export function validateSportProfileWrite(input: {
  memberId: string;
  sport: string;
  active: string;
  ranking: string;
}): StaffSportProfileWrite {
  if (!isUuid(input.memberId) || (input.sport !== "padel" && input.sport !== "tennis")) {
    throw new InvalidMemberManagementRequestError();
  }
  if (input.active !== "true" && input.active !== "false") {
    throw new InvalidMemberManagementRequestError();
  }
  let ranking: number | null = null;
  if (input.ranking !== "") {
    if (!/^[1-5]$/u.test(input.ranking)) throw new InvalidMemberManagementRequestError();
    ranking = Number(input.ranking);
  }
  return Object.freeze({
    memberId: input.memberId,
    sport: input.sport as TosSport,
    active: input.active === "true",
    ranking,
  });
}
