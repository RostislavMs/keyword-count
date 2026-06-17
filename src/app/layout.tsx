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
        className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100"
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
