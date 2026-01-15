'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronRight,
  BarChart3,
  Shield,
  User,
  Search,
  HelpCircle,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const mainNavigation = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    description: 'Overview & stats'
  },
  {
    name: 'All Orders',
    href: '/admin/orders',
    icon: FileText,
    description: 'Manage orders'
  },
  {
    name: 'Clients',
    href: '/admin/clients',
    icon: Users,
    description: 'View clients'
  },
  {
    name: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    description: 'Business metrics'
  },
]

const secondaryNavigation = [
  {
    name: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
]

const resourceLinks = [
  {
    name: 'View Pricing',
    href: '/pricing',
    icon: ExternalLink,
    external: true
  },
  {
    name: 'Help & Support',
    href: 'mailto:support@motiongranted.com',
    icon: HelpCircle,
    external: true
  },
]

interface AdminShellProps {
  children: React.ReactNode
  user?: {
    name: string
    email: string
  }
}

export function AdminShell({ children, user }: AdminShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleNotificationsClick = () => {
    toast({
      title: 'Notifications',
      description: 'Real-time notifications panel coming soon. You\'ll be notified of new orders, status changes, and important updates.',
    })
  }

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'A'

  // Generate breadcrumbs from pathname
  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean)
    const breadcrumbs = [{ name: 'Admin', href: '/admin' }]

    let currentPath = ''
    paths.forEach((path, index) => {
      currentPath += `/${path}`
      if (index > 0) { // Skip 'admin' as it's already added
        const name = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ')
        breadcrumbs.push({ name, href: currentPath })
      }
    })

    return breadcrumbs
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <div className="min-h-screen bg-warm-gray">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] transform bg-white shadow-elevated transition-transform duration-300 ease-out lg:translate-x-0 lg:shadow-none lg:border-r lg:border-gray-200/80',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="flex h-16 items-center justify-between px-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Logo size="sm" />
              <span className="px-2 py-0.5 text-xs font-semibold bg-teal/10 text-teal rounded-full">
                ADMIN
              </span>
            </div>
            <button
              className="lg:hidden rounded-lg p-2 hover:bg-gray-100 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            <div className="space-y-1">
              {mainNavigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                const isExactActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'nav-item group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                      isActive || isExactActive
                        ? 'active bg-teal/10 text-navy'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-navy'
                    )}
                  >
                    <div className={cn(
                      'icon-circle icon-circle-sm flex-shrink-0 transition-all duration-200',
                      isActive || isExactActive
                        ? 'bg-teal/20'
                        : 'bg-gray-100 group-hover:bg-gray-200'
                    )}>
                      <item.icon className={cn(
                        'h-5 w-5 transition-colors',
                        isActive || isExactActive ? 'text-teal' : 'text-gray-500 group-hover:text-navy'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{item.name}</span>
                      {item.description && (
                        <span className={cn(
                          'block text-xs truncate transition-colors',
                          isActive || isExactActive ? 'text-navy/60' : 'text-gray-400'
                        )}>
                          {item.description}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Divider */}
            <div className="my-6 border-t border-gray-100" />

            {/* Secondary Navigation */}
            <div className="space-y-1">
              <p className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Account
              </p>
              {secondaryNavigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'nav-item group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'active bg-teal/10 text-navy'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-navy'
                    )}
                  >
                    <item.icon className={cn(
                      'h-4 w-4 transition-colors',
                      isActive ? 'text-teal' : 'text-gray-400 group-hover:text-navy'
                    )} />
                    {item.name}
                  </Link>
                )
              })}
            </div>

            {/* Resources */}
            <div className="mt-6 space-y-1">
              <p className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Resources
              </p>
              {resourceLinks.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className="group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-navy transition-all duration-200"
                >
                  <item.icon className="h-4 w-4 text-gray-400 group-hover:text-navy transition-colors" />
                  {item.name}
                  {item.external && (
                    <ExternalLink className="h-3 w-3 text-gray-300 ml-auto" />
                  )}
                </Link>
              ))}
            </div>
          </nav>

          {/* User section */}
          <div className="border-t border-gray-100 p-4">
            <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-gray-50 transition-colors cursor-pointer">
              <Avatar className="h-10 w-10 ring-2 ring-teal/20">
                <AvatarFallback className="bg-gradient-to-br from-teal to-teal-dark text-white text-sm font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy truncate">
                  {user?.name || 'Admin'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email || 'admin@motiongranted.com'}
                </p>
              </div>
              <Shield className="h-4 w-4 text-teal" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-[280px]">
        {/* Top header */}
        <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/95 backdrop-blur-md">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
            {/* Mobile menu button */}
            <button
              className="lg:hidden rounded-lg p-2 hover:bg-gray-100 transition-colors touch-target"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5 text-gray-600" />
            </button>

            {/* Breadcrumbs - Desktop */}
            <nav className="hidden md:flex items-center gap-1.5 text-sm breadcrumb">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="font-medium text-navy">{crumb.name}</span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="text-gray-500 hover:text-teal transition-colors"
                    >
                      {crumb.name}
                    </Link>
                  )}
                </div>
              ))}
            </nav>

            {/* Search bar */}
            <div className="flex-1 max-w-md ml-auto mr-4">
              <div className={cn(
                'relative transition-all duration-200',
                searchFocused && 'scale-[1.02]'
              )}>
                <Search className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
                  searchFocused ? 'text-teal' : 'text-gray-400'
                )} />
                <input
                  type="text"
                  placeholder="Search orders, clients..."
                  className={cn(
                    'w-full rounded-lg border bg-gray-50/50 py-2 pl-10 pr-4 text-sm placeholder-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30',
                    searchFocused ? 'border-teal bg-white shadow-sm' : 'border-gray-200 hover:border-gray-300'
                  )}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
              </div>
            </div>

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="relative rounded-lg hover:bg-gray-100 transition-colors"
              onClick={handleNotificationsClick}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-gray-500" />
              <span className="notification-dot absolute right-2 top-2 h-2 w-2 rounded-full bg-teal ring-2 ring-white" />
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-lg p-0 hover:bg-gray-100 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-navy text-white text-xs font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 p-2">
                <DropdownMenuLabel className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gradient-to-br from-teal to-teal-dark text-white text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-semibold text-navy">{user?.name || 'Admin'}</p>
                      <p className="text-xs text-gray-500">{user?.email || 'admin@motiongranted.com'}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem asChild className="rounded-lg p-2.5 cursor-pointer">
                  <Link href="/admin/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-gray-500" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg p-2.5 cursor-pointer">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-gray-500" />
                    <span>Client View</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="rounded-lg p-2.5 text-red-600 cursor-pointer hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:text-red-700"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)] animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
