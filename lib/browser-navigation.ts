"use client";

// All sections share the client-rendered catch-all page. Use document
// navigation here so switching sections does not depend on an RSC transition
// to that same route module. Native anchors also retain normal browser behavior.
function navigate(href: string, replace = false) {
  const destination = new URL(href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    !["http:", "https:"].includes(destination.protocol)
  ) {
    throw new Error("Application navigation must stay on this site.");
  }
  if (replace) window.location.replace(destination.href);
  else window.location.assign(destination.href);
}

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => window.location.reload(),
};

export function useRouter() {
  return router;
}
