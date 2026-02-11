'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // TODO: Re-enable Sentry error tracking once @sentry/nextjs is installed
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-red-50 p-3 mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-6 max-w-md">
            We apologize for the inconvenience. An error occurred while loading this page.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => window.location.reload()}
              variant="default"
            >
              Reload Page
            </Button>
            <Button
              onClick={() => window.location.href = '/dashboard'}
              variant="outline"
            >
              Go to Dashboard
            </Button>
          </div>
          {this.state.error && (
            <details className="mt-8 text-left w-full max-w-2xl">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                Error Details
              </summary>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-auto">
                {this.state.error.toString()}
                {process.env.NODE_ENV === 'development' && this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
