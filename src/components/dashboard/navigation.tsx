"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowLeftRight, Brain, ChartCandlestick, LayoutDashboard, Landmark, Menu, Receipt, Settings, ShoppingCart } from "lucide-react"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const mainNavItems = [
	{ href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
	{ href: "/dashboard/trade", label: "Trade", shortLabel: "Trade", icon: ShoppingCart },
	{ href: "/dashboard/activity", label: "Activity", shortLabel: "Activity", icon: ArrowLeftRight },
	{ href: "/dashboard/history", label: "History", shortLabel: "History", icon: ChartCandlestick },
	{ href: "/dashboard/analysis", label: "Analysis", shortLabel: "AI", icon: Brain },
	{ href: "/dashboard/tax", label: "Tax (CGT)", shortLabel: "Tax", icon: Receipt },
]

const secondaryNavItems = [
	{ href: "/integrations", label: "Connections", shortLabel: "Brokers", icon: Landmark },
	{ href: "/settings", label: "Settings", shortLabel: "Settings", icon: Settings },
]

const navigationItems = [...mainNavItems, ...secondaryNavItems]
const mobilePrimaryItems = mainNavItems.slice(0, 4)
const mobileMoreItems = [...mainNavItems.slice(4), ...secondaryNavItems]

function isNavigationItemActive(pathname: string, view: string | null, href: string) {
	return href === "/dashboard"
		? pathname === "/dashboard"
		: pathname === href || pathname.startsWith(href + "/")
}

function getCurrentNavigationItem(pathname: string, view: string | null) {
	return navigationItems.find((item) => isNavigationItemActive(pathname, view, item.href)) ?? navigationItems[0]
}

function NavItem({ item, isActive }: { item: typeof navigationItems[number]; isActive: boolean }) {
	const Icon = item.icon
	return (
		<Link
			href={item.href}
			className={cn(
				"group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
				isActive
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-muted-foreground hover:bg-accent hover:text-foreground"
			)}
		>
			<Icon className="size-4 shrink-0" />
			<span>{item.label}</span>
			{isActive && (
				<span className="ml-auto size-1.5 rounded-full bg-primary-foreground/60" />
			)}
		</Link>
	)
}

export function DesktopSidebar() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const view = searchParams.get("view")

	return (
		<aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
			{/* Logo */}
			<div className="flex items-center gap-3 border-b border-border px-5 py-4">
				<div className="flex size-8 items-center justify-center rounded-lg bg-primary">
					<Image src="/icons/icon.svg" alt="StockSync" width={18} height={18} className="brightness-0 invert" />
				</div>
				<div>
					<p className="text-sm font-bold tracking-tight leading-none">StockSync</p>
					<p className="text-[0.65rem] text-muted-foreground mt-0.5">Portfolio tracker</p>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
				{/* Main nav */}
				<div className="space-y-1">
					<p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/70">Portfolio</p>
					{mainNavItems.map((item) => (
						<NavItem key={item.href} item={item} isActive={isNavigationItemActive(pathname, view, item.href)} />
					))}
				</div>

				{/* Secondary nav */}
				<div className="space-y-1">
					<p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/70">Account</p>
					{secondaryNavItems.map((item) => (
						<NavItem key={item.href} item={item} isActive={isNavigationItemActive(pathname, view, item.href)} />
					))}
				</div>
			</div>

			{/* Footer */}
			<div className="border-t border-border px-3 py-3">
				<ThemeToggle compact />
			</div>
		</aside>
	)
}

export function MobileHeader() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const currentItem = getCurrentNavigationItem(pathname, searchParams.get("view"))
	const Icon = currentItem.icon

	return (
		<header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden">
			<div className="flex min-w-0 items-center gap-2.5">
				<span className="flex size-7 items-center justify-center rounded-md bg-primary">
					<Image src="/icons/icon.svg" alt="" width={14} height={14} className="brightness-0 invert" />
				</span>
				<div className="flex items-center gap-1.5 min-w-0">
					<Icon className="size-3.5 shrink-0 text-muted-foreground" />
					<h2 className="truncate text-sm font-semibold">{currentItem.label}</h2>
				</div>
			</div>
			<Dialog>
				<DialogTrigger render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}>
					<Menu className="size-4" />
					<span className="sr-only">Open menu</span>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Navigation</DialogTitle>
						<DialogDescription>Jump to any section.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<nav className="grid gap-1">
							{mobileMoreItems.map((item) => {
								const MIcon = item.icon
								const isActive = isNavigationItemActive(pathname, searchParams.get("view"), item.href)
								return (
									<Link
										key={item.href}
										href={item.href}
										className={cn(
											"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
											isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
										)}
									>
										<MIcon className="size-4 shrink-0" />
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
		<nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
			<div className="grid grid-cols-4">
				{mobilePrimaryItems.map((item) => {
					const Icon = item.icon
					const isActive = isNavigationItemActive(pathname, view, item.href)
					return (
						<Link
							key={item.href}
							href={item.href}
							className="flex flex-col items-center justify-center gap-1 py-3 transition-colors"
						>
							<span className={cn(
								"flex size-8 items-center justify-center rounded-lg transition-all",
								isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
							)}>
								<Icon className="size-4" />
							</span>
							<span className={cn("text-[0.65rem] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
								{item.shortLabel}
							</span>
						</Link>
					)
				})}
			</div>
		</nav>
	)
}
