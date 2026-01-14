import { DashboardShell } from '@/components/layout/dashboard-shell'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // In production, you would fetch the user from the session
  const user = {
    name: 'John Smith',
    email: 'john.smith@lawfirm.com',
  }

  return <DashboardShell user={user}>{children}</DashboardShell>
}
