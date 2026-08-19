import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginScreen } from "./login-screen";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { callbackUrl, error } = await searchParams;
  const oauthConfigured = Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
  // 심사·시연용 게스트 입장. AUTH_SECRET 이 있어야 세션을 만들 수 있습니다.
  const guestEnabled = Boolean(
    process.env.AUTH_SECRET && process.env.DEMO_GUEST_LOGIN === "true",
  );

  return (
    <LoginScreen
      callbackUrl={callbackUrl}
      errorCode={error}
      oauthConfigured={oauthConfigured}
      guestEnabled={guestEnabled}
    />
  );
}
