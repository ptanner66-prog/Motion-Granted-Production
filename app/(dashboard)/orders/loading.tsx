import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function OrdersLoading() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-11 w-32" />
      </div>

      {/* Orders List Skeleton */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-48" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-100 last:border-0">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-5 w-64 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="text-right hidden sm:block">
                <Skeleton className="h-6 w-20 mb-1" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-5 w-5" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
