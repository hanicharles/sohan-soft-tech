import OrganizationDashboard from "@/features/organization/Dashboard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Trust reports | Sohan Soft Tech" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrganizationDashboard id={id} />;
}
