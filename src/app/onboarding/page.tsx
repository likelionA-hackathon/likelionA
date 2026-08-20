import { OnboardingScreen } from "./onboarding-screen";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const params = await searchParams;
  const invite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  return <OnboardingScreen initialInviteCode={invite ?? ""} />;
}
