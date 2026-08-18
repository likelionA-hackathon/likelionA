import { DashboardScreen } from "./dashboard-screen";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DashboardPage({ params }: PageProps) {
  const { id } = await params;

  return <DashboardScreen workspaceId={id} />;
}
