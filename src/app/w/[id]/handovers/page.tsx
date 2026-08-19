import { HandoverListScreen } from "./handover-list";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HandoverListPage({ params }: PageProps) {
  const { id } = await params;

  return <HandoverListScreen workspaceId={id} />;
}
