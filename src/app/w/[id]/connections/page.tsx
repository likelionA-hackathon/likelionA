import { ConnectionsScreen } from "./connections-screen";

export default async function ConnectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConnectionsScreen workspaceId={id} />;
}
