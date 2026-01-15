'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface BreadcrumbContextType {
  customLabel: string | null
  setCustomLabel: (label: string | null) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({
  customLabel: null,
  setCustomLabel: () => {},
})

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [customLabel, setCustomLabel] = useState<string | null>(null)

  return (
    <BreadcrumbContext.Provider value={{ customLabel, setCustomLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext)
}
