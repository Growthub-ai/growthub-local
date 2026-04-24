import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agency Portal",
  description: "Composable agency operations portal with thin infrastructure adapters.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
