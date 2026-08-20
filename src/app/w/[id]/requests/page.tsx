import { RequestsScreen } from "./requests-screen";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RequestsPage({ params }: PageProps) {
  const { id } = await params;

  return <RequestsScreen workspaceId={id} />;
}
