'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Bell, FileText, User, Clock, CheckCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateShort } from '@/lib/utils'

interface Notification {
  id: string
  type: 'new_order' | 'status_change' | 'client_signup'
  title: string
  message: string
  href: string
  created_at: string
  read: boolean
}

interface OrderData {
  id: string
  order_number: string
  motion_type: string
  created_at: string
  status: string
}

interface ClientData {
  id: string
  full_name: string | null
  email: string
  created_at: string
}

export function AdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch recent orders as "notifications" (simulated - in production you'd have a notifications table)
  useEffect(() => {
    async function fetchNotifications() {
      setIsLoading(true)
      try {
        // Fetch recent orders as new order notifications
        const { data: recentOrders } = await supabase
          .from('orders')
          .select('id, order_number, motion_type, created_at, status')
          .eq('status', 'submitted')
          .order('created_at', { ascending: false })
          .limit(5)

        const orderNotifications: Notification[] = (recentOrders || []).map((order: OrderData) => ({
          id: `order-${order.id}`,
          type: 'new_order' as const,
          title: 'New Order Received',
          message: `${order.order_number} - ${order.motion_type}`,
          href: `/admin/orders/${order.id}`,
          created_at: order.created_at,
          read: false,
        }))

        // Fetch recent client signups
        const { data: recentClients } = await supabase
          .from('profiles')
          .select('id, full_name, email, created_at')
          .eq('role', 'client')
          .order('created_at', { ascending: false })
          .limit(3)

        const clientNotifications: Notification[] = (recentClients || []).map((client: ClientData) => ({
          id: `client-${client.id}`,
          type: 'client_signup' as const,
          title: 'New Client Registered',
          message: client.full_name || client.email,
          href: `/admin/clients/${client.id}`,
          created_at: client.created_at,
          read: true, // Mark older as read
        }))

        // Combine and sort by date
        const allNotifications = [...orderNotifications, ...clientNotifications]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 8)

        setNotifications(allNotifications)
      } catch (error) {
        console.error('Error fetching notifications:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotifications()
  }, [supabase])

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleNotificationClick = (notification: Notification) => {
    setIsOpen(false)
    router.push(notification.href)
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'new_order':
        return <FileText className="h-4 w-4 text-blue-600" />
      case 'client_signup':
        return <User className="h-4 w-4 text-teal" />
      case 'status_change':
        return <Clock className="h-4 w-4 text-orange-500" />
      default:
        return <Bell className="h-4 w-4 text-gray-500" />
    }
  }

  const getIconBg = (type: Notification['type']) => {
    switch (type) {
      case 'new_order':
        return 'bg-blue-100'
      case 'client_signup':
        return 'bg-teal/10'
      case 'status_change':
        return 'bg-orange-100'
      default:
        return 'bg-gray-100'
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative rounded-lg hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-5 w-5 text-gray-500" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal ring-2 ring-white" />
        )}
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-navy">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-teal hover:text-teal-dark transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center">
                <div className="animate-spin h-6 w-6 border-2 border-teal border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left',
                      !notification.read && 'bg-teal/5'
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5',
                      getIconBg(notification.type)
                    )}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          'text-sm truncate',
                          notification.read ? 'text-gray-600' : 'text-navy font-medium'
                        )}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-teal shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateShort(notification.created_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push('/admin/orders')
                }}
                className="text-sm text-teal hover:text-teal-dark font-medium transition-colors"
              >
                View all orders
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
