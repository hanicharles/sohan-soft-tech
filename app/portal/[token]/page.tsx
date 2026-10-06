import ParentPortal from "@/features/parent/ParentPortal";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Parent fees | Sohan Soft Tech",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ParentPortal token={token} />;
}
