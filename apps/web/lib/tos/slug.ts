const TOS_EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isTosEventSlug(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 80 &&
    TOS_EVENT_SLUG_PATTERN.test(value)
  );
}

export type TosDetailPath = `/tos/${string}`;

export function tosDetailPath(slug: string): TosDetailPath {
  if (!isTosEventSlug(slug)) {
    throw new Error("Ongeldige TOS-eventslug.");
  }
  return `/tos/${slug}`;
}
