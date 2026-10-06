// Filters are a per-user, per-institution device preference, never authorization.
export function readNavigationFilters(institution: string, user: string) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`fee-filters:${user}:${institution}`) || "null",
    );
    const keys = ["year", "campus", "class", "section", "stream", "from", "to"];
    if (saved && keys.every((key) => typeof saved[key] === "string"))
      return saved;
  } catch {
    /* Storage may be disabled by browser policy. */
  }
  return null;
}

export function saveNavigationFilters(
  institution: string,
  user: string,
  scope: Record<string, string>,
) {
  try {
    sessionStorage.setItem(
      `fee-filters:${user}:${institution}`,
      JSON.stringify(scope),
    );
  } catch {
    /* Navigation must continue when storage is unavailable. */
  }
}
