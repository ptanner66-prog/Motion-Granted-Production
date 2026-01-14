import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function generateOrderNumber(): string {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `MG-${year}${month}-${random}`
}

export function calculateDeliveryDate(filingDeadline: Date, turnaround: string): Date {
  const deadline = new Date(filingDeadline)

  switch (turnaround) {
    case 'rush_48':
      deadline.setDate(deadline.getDate() - 2)
      break
    case 'rush_72':
      deadline.setDate(deadline.getDate() - 3)
      break
    default:
      deadline.setDate(deadline.getDate() - 5)
  }

  return deadline
}

export function normalizePartyName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}
