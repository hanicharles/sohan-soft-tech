"use client";
import PlatformApp from "@/features/platform/App";
import { api, ClientError } from "@/lib/api-client";
import { useRouter } from "@/lib/browser-navigation";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Access, BootScreen } from "./Access";
import CampusApp from "./App";
import type { Row } from "./context";
import { Button, Card, PageHead } from "./ui";
export default function Entry() {
  const path = usePathname(),
    router = useRouter();
  const [session, setSession] = useState<Row | null>(null),
    [error, setError] = useState<ClientError | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (path.startsWith("/campus/") || path.startsWith("/admin")) return;
    api("session").then(setSession).catch(setError);
  }, [path, retry]);
  useEffect(() => {
    if (!session || path.startsWith("/campus/") || path.startsWith("/admin"))
      return;
    if (session.platform) router.replace("/admin");
    else if (session.memberships.length === 1 && !session.organizations?.length)
      router.replace(
        "/campus/" + session.memberships[0].slug + (path === "/" ? "" : path),
      );
  }, [session, path, router]);
  if (path.startsWith("/campus/"))
    return <CampusApp key={path.split("/")[2]} slug={path.split("/")[2]} />;
  if (path.startsWith("/admin")) return <PlatformApp />;
  if (path === "/parent" || path.startsWith("/pay/"))
    return (
      <div className="portal-chooser">
        <PageHead
          title="Portal unavailable"
          description="Contact your institution accounts office for fee assistance."
        />
        <a href="/">Return to Sohan Soft Tech</a>
      </div>
    );
  if (error)
    return (
      <Access
        error={error}
        retry={() => {
          setError(null);
          setRetry((v) => v + 1);
        }}
      />
    );
  if (
    !session ||
    session.platform ||
    (session.memberships.length === 1 && !session.organizations?.length)
  )
    return <BootScreen />;
  return (
    <div className="portal-chooser">
      <PageHead
        title="Your institutions"
        description={
          session.memberships.length
            ? "Choose an institution to open its fee workspace."
            : "Ask your institution administrator to grant you staff access."
        }
      />
      <div className="institution-choice-grid">
        {session.organizations?.map((o: Row) => (
          <Card key={o.id}>
            <h2>{o.name}</h2>
            <p>Trust / group reports</p>
            <a href={"/organization/" + o.id}>Open consolidated reports</a>
          </Card>
        ))}
        {session.memberships.map((m: Row) => (
          <Card key={m.institution_id}>
            <h2>{m.institution_name}</h2>
            <p>{m.role.toLowerCase().replaceAll("_", " ")}</p>
            <Button onClick={() => router.push("/campus/" + m.slug)}>
              Open institution
            </Button>
          </Card>
        ))}
      </div>
      <a href="/" onClick={(event) => { event.preventDefault(); fetch("/api/auth/logout", { method: "POST" }).finally(() => { window.location.href = "/"; }); }}>
        Sign out
      </a>
    </div>
  );
}
