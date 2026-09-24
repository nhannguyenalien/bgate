import "@tabler/core/dist/css/tabler.min.css";
import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BGate · Billing Router",
  description: "Bảng điều khiển thanh toán SchoolsAI",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-bs-theme="light">
      <body>{children}</body>
    </html>
  );
}
