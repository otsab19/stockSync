import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { DesktopSidebar, MobileBottomNav, MobileHeader } from "@/components/dashboard/navigation";
import { AlertPoller } from "@/components/notifications/alert-poller";
import { ThemeProvider, themeStorageKey } from "@/components/theme/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StockSync",
  description: "Portfolio tracker for Trading 212 and eToro.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1725" },
  ],
};

const themeScript = `
(() => {
  try {
    const storedTheme = localStorage.getItem("${themeStorageKey}");
    const theme = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
    const resolvedTheme = theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background text-foreground`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          <AlertPoller />
          <div className="flex min-h-screen w-full">
            <Suspense fallback={<div className="hidden w-60 shrink-0 border-r border-border bg-sidebar md:block xl:w-64" />}>
              <DesktopSidebar />
            </Suspense>
            <main className="flex min-h-screen min-w-0 flex-1 flex-col">
              <Suspense fallback={<div className="sticky top-0 z-20 h-[53px] border-b border-border bg-background md:hidden" />}>
                <MobileHeader />
              </Suspense>
              <div className="flex-1 pb-20 md:pb-0">
                {children}
              </div>
            </main>
            <Suspense fallback={<div className="fixed inset-x-0 bottom-0 z-20 h-16 border-t border-border bg-background md:hidden" />}>
              <MobileBottomNav />
            </Suspense>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
