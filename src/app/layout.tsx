import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, Settings, Landmark } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StockSync PWA",
  description: "Unified portfolio dashboard tracking Trading 212 and eToro.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen flex bg-background`}>
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card flex flex-col hidden md:flex">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold tracking-tight">StockSync</h2>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            <Link href="/dashboard" className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </Link>
            <Link href="/integrations" className="flex items-center space-x-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <Landmark className="w-5 h-5" />
              <span>Broker Integrations</span>
            </Link>
            <Link href="/settings" className="flex items-center space-x-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Mobile Header */}
          <header className="h-16 border-b flex items-center px-6 md:hidden bg-card">
            <h2 className="text-xl font-bold">StockSync</h2>
          </header>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
