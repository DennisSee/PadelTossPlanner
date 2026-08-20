import { NextResponse } from "next/server";

import type { SafeReturnPath } from "../auth/return-path";
import type { TosErrorCode, TosNotice } from "./messages";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export class InvalidTosRequestError extends Error {
  constructor() {
    super("Ongeldig verzoek.");
    this.name = "InvalidTosRequestError";
  }
}

export function hasExactOrigin(request: Request, appBaseUrl: string): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(appBaseUrl).origin);
}

export function noStoreResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export function tosRedirect(
  appBaseUrl: string,
  destination: SafeReturnPath,
  message: Readonly<{ notice?: TosNotice; error?: TosErrorCode }> = {},
): NextResponse {
  const url = new URL(destination, appBaseUrl);
  if (message.notice) url.searchParams.set("notice", message.notice);
  if (message.error) url.searchParams.set("error", message.error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function exactTextFields(
  formData: FormData,
  required: Readonly<Record<string, number>>,
  optional: Readonly<Record<string, number>> = {},
): Readonly<Record<string, string>> {
  const allowed = { ...required, ...optional };
  const received = [...formData.keys()];
  if (
    received.some((key) => !(key in allowed)) ||
    Object.keys(required).some((key) => formData.getAll(key).length !== 1) ||
    Object.keys(optional).some((key) => formData.getAll(key).length > 1)
  ) {
    throw new InvalidTosRequestError();
  }
  const values: Record<string, string> = {};
  for (const [key, maximum] of Object.entries(allowed)) {
    const value = formData.get(key);
    if (value === null && key in optional) continue;
    if (
      typeof value !== "string" ||
      value.length > maximum ||
      CONTROL_CHARACTERS.test(value)
    ) {
      throw new InvalidTosRequestError();
    }
    values[key] = value;
  }
  return Object.freeze(values);
}

export function normalizedDisplayName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 120 || CONTROL_CHARACTERS.test(name)) {
    throw new InvalidTosRequestError();
  }
  return name;
}
