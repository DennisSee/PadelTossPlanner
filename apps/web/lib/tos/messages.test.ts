import { describe, expect, it } from "vitest";

import { publicTosMessage } from "./messages";

describe("public TOS messages", () => {
  it("maps only finite notice and error codes", () => {
    expect(publicTosMessage("registration-created", undefined)).toEqual({
      tone: "success",
      text: "Je aanmelding is opgeslagen.",
    });
    expect(publicTosMessage(undefined, "self-service-closed")).toEqual({
      tone: "danger",
      text: "Inschrijven of wijzigen is voor deze TOS gesloten.",
    });
    expect(publicTosMessage("raw SQL detail", "token=secret")).toBeNull();
  });
});
