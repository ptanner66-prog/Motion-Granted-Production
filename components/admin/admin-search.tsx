'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, FileText, User, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { formatMotionType } from '@/config/motion-types'

interface SearchResult {
  type: 'order' | 'client'
  id: string
  title: string
  subtitle: string
  href: string
}

interface OrderSearchData {
  id: string
  order_number: string
  motion_type: string
  case_caption: string
  total_price: number
}

interface ClientSearchData {
  id: string
  full_name: string | null
  email: string
  firm_name: string | null
}

export function AdminSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
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

  // Search when query changes
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (query.length < 2) {
        setResults([])
        setIsOpen(false)
        return
      }

      setIsLoading(true)
      try {
        const searchResults: SearchResult[] = []

        // Search orders
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, motion_type, case_caption, total_price')
          .or(`order_number.ilike.%${query}%,motion_type.ilike.%${query}%,case_caption.ilike.%${query}%`)
          .limit(5)

        if (orders) {
          orders.forEach((order: OrderSearchData) => {
            searchResults.push({
              type: 'order',
              id: order.id,
              title: `${order.order_number} - ${formatMotionType(order.motion_type)}`,
              subtitle: `${order.case_caption} • ${formatCurrency(order.total_price)}`,
              href: `/admin/orders/${order.id}`,
            })
          })
        }

        // Search clients
        const { data: clients } = await supabase
          .from('profiles')
          .select('id, full_name, email, firm_name')
          .eq('role', 'client')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,firm_name.ilike.%${query}%`)
          .limit(5)

        if (clients) {
          clients.forEach((client: ClientSearchData) => {
            searchResults.push({
              type: 'client',
              id: client.id,
              title: client.full_name || client.email,
              subtitle: client.firm_name || client.email,
              href: `/admin/clients/${client.id}`,
            })
          })
        }

        setResults(searchResults)
        setIsOpen(searchResults.length > 0)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setIsLoading(false)
      }
    }, 300) // Debounce search

    return () => clearTimeout(searchTimeout)
  }, [query, supabase])

  const handleResultClick = (result: SearchResult) => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    router.push(result.href)
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className={cn(
        'relative transition-all duration-200',
        focused && 'scale-[1.02]'
      )}>
        <Search className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
          focused ? 'text-teal' : 'text-gray-400'
        )} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders, clients..."
          className={cn(
            'w-full rounded-lg border bg-gray-50/50 py-2 pl-10 pr-10 text-sm placeholder-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30',
            focused ? 'border-teal bg-white shadow-sm' : 'border-gray-200 hover:border-gray-300'
          )}
          onFocus={() => {
            setFocused(true)
            if (results.length > 0) setIsOpen(true)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false)
              inputRef.current?.blur()
            }
          }}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
        {!isLoading && query && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="py-2">
            {results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleResultClick(result)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  result.type === 'order' ? 'bg-blue-100' : 'bg-teal/10'
                )}>
                  {result.type === 'order' ? (
                    <FileText className="h-5 w-5 text-blue-600" />
                  ) : (
                    <User className="h-5 w-5 text-teal" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy truncate">{result.title}</p>
                  <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2 py-1 rounded-full',
                  result.type === 'order' ? 'bg-blue-100 text-blue-700' : 'bg-teal/10 text-teal'
                )}>
                  {result.type === 'order' ? 'Order' : 'Client'}
                </span>
              </button>
            ))}
          </div>
          {query.length >= 2 && (
            <div className="border-t border-gray-100 px-4 py-2 bg-gray-50">
              <p className="text-xs text-gray-500">
                Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Esc</kbd> to close
              </p>
            </div>
          )}
        </div>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-6 text-center">
            <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">No results found for &quot;{query}&quot;</p>
          </div>
        </div>
      )}
    </div>
  )
}
