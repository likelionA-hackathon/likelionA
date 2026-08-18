import { InviteScreen } from "./invite-screen";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteScreen code={code} />;
}
