"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowLeftRight, Brain, ChartCandlestick, LayoutDashboard, Landmark, Menu, Settings, ShoppingCart } from "lucide-react"
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
		<aside className="sticky top-0 hidden h-screen w-[17.5rem] shrink-0 border-r border-white/8 bg-sidebar/72 backdrop-blur md:flex md:flex-col xl:w-72">
			<div className="flex h-full flex-col gap-6 px-4 py-5 xl:px-5">
				<Link href="/dashboard" className="flex items-center gap-2.5 border-b border-white/8 pb-4">
					<Image src="/icons/icon.svg" alt="StockSync" width={28} height={28} className="rounded-lg" />
					<span className="text-lg font-bold tracking-tight">StockSync</span>
				</Link>

				<nav className="flex-1 space-y-1.5">
					{navigationItems.map((item) => {
						const Icon = item.icon
						const isActive = isNavigationItemActive(pathname, view, item.href)

						return (
							<Link
								key={item.href}
								href={item.href}
								className={cn(
									"flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-white/[0.04] hover:text-foreground",
									isActive && "bg-white/[0.06] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
								)}
							>
								<span className={cn("flex size-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03]", isActive && "border-primary/30 bg-primary/10 text-primary")}>
									<Icon className="size-4.5" />
								</span>
								<span>{item.label}</span>
							</Link>
						)
					})}
				</nav>

				<div className="space-y-2 border-t border-white/8 pt-4">
					<p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Theme</p>
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
		<header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/8 bg-background/88 px-4 py-3 backdrop-blur md:hidden">
			<div className="flex min-w-0 items-center gap-3">
				<Link href="/dashboard">
					<Image src="/icons/icon.svg" alt="StockSync" width={24} height={24} className="rounded-md" />
				</Link>
				<h2 className="truncate text-lg font-semibold tracking-tight">{currentItem.label}</h2>
			</div>
			<Dialog>
				<DialogTrigger render={<Button variant="outline" size="icon-sm" className="shrink-0 rounded-xl border-white/10 bg-white/[0.03]" />}>
					<Menu className="size-4" />
					<span className="sr-only">Open menu</span>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Menu</DialogTitle>
						<DialogDescription>More pages and display preferences.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<nav className="grid gap-2">
							{mobileMoreItems.map((item) => {
								const Icon = item.icon
								const isActive = isNavigationItemActive(pathname, searchParams.get("view"), item.href)

								return (
									<Link
										key={item.href}
										href={item.href}
										className={cn(
											"flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm font-medium text-muted-foreground",
											isActive && "text-foreground"
										)}
									>
										<Icon className="size-4" />
										{item.label}
									</Link>
								)
							})}
						</nav>
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground">Theme</p>
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
		<nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 md:hidden">
			<div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[1.75rem] border border-white/10 bg-background/88 p-2 shadow-[0_16px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl">
				{mobilePrimaryItems.map((item) => {
					const Icon = item.icon
					const isActive = isNavigationItemActive(pathname, view, item.href)

					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.72rem] font-medium text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground",
								isActive && "bg-white/[0.07] text-foreground"
							)}
						>
							<span className={cn("flex size-8 items-center justify-center rounded-xl", isActive && "bg-primary/12 text-primary")}>
								<Icon className="size-4" />
							</span>
							<span>{item.shortLabel}</span>
						</Link>
					)
				})}
			</div>
		</nav>
	)
}
