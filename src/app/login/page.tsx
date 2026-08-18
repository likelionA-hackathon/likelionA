import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginScreen } from "./login-screen";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { callbackUrl } = await searchParams;
  return <LoginScreen callbackUrl={callbackUrl} />;
}
