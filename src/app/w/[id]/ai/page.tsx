import { AiWorkScreen } from "./ai-work-screen";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AiWorkPage({ params }: PageProps) {
  const { id } = await params;

  return <AiWorkScreen workspaceId={id} />;
}
