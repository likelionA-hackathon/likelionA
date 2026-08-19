import { SharedBoardScreen } from "./shared-board-screen";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SharedBoardPage({ params }: PageProps) {
  const { id } = await params;

  return <SharedBoardScreen workspaceId={id} />;
}
