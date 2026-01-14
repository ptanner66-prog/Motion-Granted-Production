import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  className?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, className, children }: PageHeaderProps) {
  return (
    <div className={cn('border-b border-gray-200 bg-white', className)}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-navy sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-gray-500">{description}</p>
            )}
          </div>
          {children && (
            <div className="mt-4 flex shrink-0 md:ml-4 md:mt-0">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  className,
  children
}: PageHeaderProps) {
  return (
    <div className={cn('mb-8', className)}>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-navy">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {children && (
          <div className="mt-4 sm:ml-4 sm:mt-0">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
