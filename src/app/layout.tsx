import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baton — 팀 간 인수인계 허브",
  description: "Notion 인수인계를 AI 가 정리하고, 파트너 팀과 다음 업무까지 이어줍니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
