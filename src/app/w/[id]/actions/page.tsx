import { NextActionsScreen } from "./next-actions-screen";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function NextActionsPage({ params }: PageProps) {
  const { id } = await params;

  return <NextActionsScreen workspaceId={id} />;
}
