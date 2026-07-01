"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowLeftRight, Brain, ChartCandlestick, LayoutDashboard, Landmark, Menu, Receipt, Settings, ShoppingCart } from "lucide-react"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const navigationItems = [
	{ href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
	{ href: "/dashboard/trade", label: "Trade", shortLabel: "Trade", icon: ShoppingCart },
	{ href: "/dashboard/activity", label: "Activity", shortLabel: "Activity", icon: ArrowLeftRight },
	{ href: "/dashboard/history", label: "History", shortLabel: "History", icon: ChartCandlestick },
	{ href: "/dashboard/analysis", label: "Analysis", shortLabel: "AI", icon: Brain },
	{ href: "/dashboard/tax", label: "Tax (CGT)", shortLabel: "Tax", icon: Receipt },
	{ href: "/integrations", label: "Connections", shortLabel: "Brokers", icon: Landmark },
	{ href: "/settings", label: "Settings", shortLabel: "Settings", icon: Settings },
]

const mobilePrimaryItems = navigationItems.slice(0, 4)
const mobileMoreItems = navigationItems.slice(4)

function isNavigationItemActive(pathname: string, view: string | null, href: string) {
	return href === "/dashboard"
		? pathname === "/dashboard"
		: pathname === href || pathname.startsWith(href + "/")
}

function getCurrentNavigationItem(pathname: string, view: string | null) {
	return navigationItems.find((item) => isNavigationItemActive(pathname, view, item.href)) ?? navigationItems[0]
}

export function DesktopSidebar() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const view = searchParams.get("view")

	return (
		<aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col xl:w-64">
			<div className="flex h-full flex-col px-3 py-4">
				<Link href="/dashboard" className="flex items-center gap-2.5 px-2 pb-4 mb-1">
					<Image src="/icons/icon.svg" alt="StockSync" width={26} height={26} className="rounded-md" />
					<span className="text-base font-semibold tracking-tight text-sidebar-foreground">StockSync</span>
				</Link>

				<nav className="flex-1 space-y-0.5">
					{navigationItems.map((item) => {
						const Icon = item.icon
						const isActive = isNavigationItemActive(pathname, view, item.href)

						return (
							<Link
								key={item.href}
								href={item.href}
								className={cn(
									"flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
									isActive
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
								)}
							>
								<Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "")} />
								<span>{item.label}</span>
							</Link>
						)
					})}
				</nav>

				<div className="border-t border-border pt-3 mt-2">
					<ThemeToggle />
				</div>
			</div>
		</aside>
	)
}

export function MobileHeader() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const currentItem = getCurrentNavigationItem(pathname, searchParams.get("view"))

	return (
		<header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
			<div className="flex min-w-0 items-center gap-2.5">
				<Link href="/dashboard">
					<Image src="/icons/icon.svg" alt="StockSync" width={22} height={22} className="rounded-md" />
				</Link>
				<h2 className="truncate text-base font-semibold tracking-tight">{currentItem.label}</h2>
			</div>
			<Dialog>
				<DialogTrigger render={<Button variant="outline" size="icon-sm" className="shrink-0" />}>
					<Menu className="size-4" />
					<span className="sr-only">Open menu</span>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Menu</DialogTitle>
						<DialogDescription>Navigation and display preferences.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<nav className="grid gap-1">
							{mobileMoreItems.map((item) => {
								const Icon = item.icon
								const isActive = isNavigationItemActive(pathname, searchParams.get("view"), item.href)

								return (
									<Link
										key={item.href}
										href={item.href}
										className={cn(
											"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
											isActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
										)}
									>
										<Icon className="size-4 shrink-0" />
										{item.label}
									</Link>
								)
							})}
						</nav>
						<div className="border-t border-border pt-3">
							<ThemeToggle />
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</header>
	)
}

export function MobileBottomNav() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const view = searchParams.get("view")

	return (
		<nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
			<div className="grid grid-cols-4">
				{mobilePrimaryItems.map((item) => {
					const Icon = item.icon
					const isActive = isNavigationItemActive(pathname, view, item.href)

					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex flex-col items-center justify-center gap-1 py-3 text-[0.7rem] font-medium transition-colors",
								isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
							)}
						>
							<Icon className="size-5" />
							<span>{item.shortLabel}</span>
						</Link>
					)
				})}
			</div>
		</nav>
	)
}
