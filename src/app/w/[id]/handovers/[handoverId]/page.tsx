import { HandoverDetailScreen } from "./handover-detail";

type PageProps = {
  params: Promise<{ id: string; handoverId: string }>;
};

export default async function HandoverDetailPage({ params }: PageProps) {
  const { id, handoverId } = await params;

  return <HandoverDetailScreen workspaceId={id} handoverId={handoverId} />;
}
