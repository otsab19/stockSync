import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { DesktopSidebar, MobileBottomNav, MobileHeader } from "@/components/dashboard/navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StockSync",
  description: "Unified portfolio workspace for Trading 212 and eToro.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f1725",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-background text-foreground`}>
        <div className="mx-auto flex min-h-screen w-full max-w-[120rem]">
          <Suspense fallback={<div className="hidden w-[17.5rem] shrink-0 border-r border-white/8 bg-sidebar/70 backdrop-blur md:block xl:w-72" />}>
            <DesktopSidebar />
          </Suspense>
          <main className="flex min-h-screen min-w-0 flex-1 flex-col">
            <Suspense fallback={<div className="sticky top-0 z-20 h-[73px] border-b border-white/8 bg-background/88 md:hidden" />}>
              <MobileHeader />
            </Suspense>
            <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
              {children}
            </div>
          </main>
          <Suspense fallback={<div className="fixed inset-x-0 bottom-0 z-20 h-20 md:hidden" />}>
            <MobileBottomNav />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
