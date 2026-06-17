import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Підрахунок ключових слів",
  description:
    "Аналіз входжень ключових слів у тексті з публічного Google-документа",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-neutral-50 text-neutral-900 antialiased"
      >
        {children}
      </body>
    </html>
  );
}
