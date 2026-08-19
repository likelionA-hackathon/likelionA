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

  return (
    <LoginScreen
      callbackUrl={callbackUrl}
      errorCode={error}
      oauthConfigured={oauthConfigured}
    />
  );
}
