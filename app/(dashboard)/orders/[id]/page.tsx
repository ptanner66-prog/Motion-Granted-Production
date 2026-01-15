import { Metadata } from 'next'
import Link from 'next/link'
import type { OrderStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateShort } from '@/lib/utils'
import {
  ArrowLeft,
  Calendar,
  Download,
  FileText,
  MessageSquare,
  Send,
  Clock,
  User,
  Building,
  Scale,
  Paperclip,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Copy,
  ExternalLink,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Order Details',
  description: 'View order details and communicate with your clerk.',
}

// Mock data - in production, fetch from Supabase
const order = {
  id: '1',
  order_number: 'MG-2501-0001',
  motion_type: 'Motion for Summary Judgment',
  motion_tier: 3,
  base_price: 2000,
  turnaround: 'standard' as const,
  rush_surcharge: 0,
  total_price: 2000,
  status: 'in_progress' as OrderStatus,
  filing_deadline: '2025-02-15',
  expected_delivery: '2025-02-10',
  jurisdiction: 'Louisiana State Court',
  court_division: '19th Judicial District Court',
  case_number: '2024-12345',
  case_caption: 'Smith v. Jones',
  statement_of_facts: 'Plaintiff alleges that on January 15, 2024, Defendant negligently operated a motor vehicle...',
  procedural_history: 'Plaintiff filed suit on March 1, 2024. Defendant answered on April 1, 2024. Discovery commenced...',
  instructions: 'Please draft a Motion for Summary Judgment arguing that there are no genuine issues of material fact...',
  parties: [
    { name: 'John Smith', role: 'Plaintiff' },
    { name: 'Jane Jones', role: 'Defendant' },
  ],
  documents: [
    { id: '1', name: 'Complaint.pdf', type: 'complaint', size: 245000, uploaded_at: '2025-01-10' },
    { id: '2', name: 'Answer.pdf', type: 'answer', size: 189000, uploaded_at: '2025-01-10' },
    { id: '3', name: 'Discovery_Responses.pdf', type: 'discovery', size: 1250000, uploaded_at: '2025-01-10' },
  ],
  messages: [
    {
      id: '1',
      sender: 'clerk',
      sender_name: 'Sarah Wilson',
      message: 'Thank you for your order. I have reviewed the materials and will begin drafting. I may have a few clarifying questions as I proceed.',
      created_at: '2025-01-11T10:30:00',
    },
    {
      id: '2',
      sender: 'client',
      sender_name: 'John Attorney',
      message: 'Sounds good. Please let me know if you need anything else.',
      created_at: '2025-01-11T14:15:00',
    },
  ],
  created_at: '2025-01-10',
}

// Calculate progress based on status
function getOrderProgress(status: OrderStatus) {
  const statusOrder = ['submitted', 'in_progress', 'in_review', 'draft_delivered', 'revision_requested', 'completed']
  const currentIndex = statusOrder.indexOf(status)
  return Math.max(((currentIndex + 1) / statusOrder.length) * 100, 20)
}

export default function OrderDetailPage() {
  const progress = getOrderProgress(order.status)

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/orders"
          className="inline-flex items-center text-sm text-gray-500 hover:text-teal transition-colors mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
                {order.order_number}
              </h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-lg text-gray-600">{order.motion_type}</p>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium">{order.case_caption}</span>
              <span className="mx-2">•</span>
              Case #{order.case_number}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Message Clerk
            </Button>
            {order.status === 'draft_delivered' && (
              <Button className="gap-2 btn-premium">
                <Download className="h-4 w-4" />
                Download Draft
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-600">Order Progress</span>
            <span className="text-teal font-semibold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal to-teal-dark rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="details">
            <TabsList className="bg-gray-100/70 p-1">
              <TabsTrigger
                value="details"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 gap-2"
              >
                <FileText className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 gap-2"
              >
                <Paperclip className="h-4 w-4" />
                Documents
                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-600 ml-1">
                  {order.documents.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="messages"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Messages
                <span className="rounded-full bg-teal/20 px-1.5 py-0.5 text-xs font-semibold text-teal ml-1">
                  {order.messages.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6 space-y-6">
              {/* Case Information */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Scale className="h-5 w-5 text-gray-500" />
                    Case Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Case Caption</p>
                      <p className="text-navy font-medium">{order.case_caption}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Case Number</p>
                      <div className="flex items-center gap-2">
                        <p className="text-navy font-medium font-mono">{order.case_number}</p>
                        <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Jurisdiction</p>
                      <p className="text-navy">{order.jurisdiction}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Court/Division</p>
                      <p className="text-navy">{order.court_division}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Parties */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-500" />
                    Parties
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {order.parties.map((party, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                          <User className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-navy">{party.name}</p>
                          <p className="text-sm text-gray-500">{party.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Statement of Facts */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                  <CardTitle className="text-lg">Statement of Facts</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{order.statement_of_facts}</p>
                </CardContent>
              </Card>

              {/* Procedural History */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                  <CardTitle className="text-lg">Procedural History</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{order.procedural_history}</p>
                </CardContent>
              </Card>

              {/* Drafting Instructions */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-teal/5 to-transparent border-b border-teal/10">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-teal" />
                    Drafting Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{order.instructions}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-gray-500" />
                    Uploaded Documents
                  </CardTitle>
                  <CardDescription>Documents provided with this order</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {order.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="group flex items-center justify-between rounded-xl border border-gray-200 p-4 hover:border-teal/30 hover:bg-gray-50/50 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 group-hover:bg-teal/10 transition-colors">
                            <FileText className="h-6 w-6 text-gray-500 group-hover:text-teal transition-colors" />
                          </div>
                          <div>
                            <p className="font-semibold text-navy">{doc.name}</p>
                            <p className="text-sm text-gray-500">
                              {(doc.size / 1024).toFixed(0)} KB • {formatDateShort(doc.uploaded_at)}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="mt-6">
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-gray-500" />
                    Messages
                  </CardTitle>
                  <CardDescription>Communication with your assigned clerk</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {order.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${message.sender === 'client' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          message.sender === 'client' ? 'bg-teal/20' : 'bg-navy/10'
                        }`}>
                          <User className={`h-5 w-5 ${message.sender === 'client' ? 'text-teal' : 'text-navy'}`} />
                        </div>
                        <div
                          className={`max-w-[80%] rounded-2xl p-4 ${
                            message.sender === 'client'
                              ? 'bg-gradient-to-br from-teal/10 to-teal/5'
                              : 'bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-semibold text-navy">
                              {message.sender_name}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatDateShort(message.created_at)}
                            </span>
                          </div>
                          <p className="text-gray-700 leading-relaxed">{message.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Message input */}
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <Textarea
                      placeholder="Type your message..."
                      rows={3}
                      className="resize-none border-gray-200 focus:border-teal focus:ring-teal/30"
                    />
                    <div className="flex justify-end">
                      <Button className="btn-premium gap-2">
                        <Send className="h-4 w-4" />
                        Send Message
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Summary */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Base Price</span>
                <span className="font-semibold tabular-nums">{formatCurrency(order.base_price)}</span>
              </div>
              {order.rush_surcharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Rush Surcharge</span>
                  <span className="font-semibold text-orange-600 tabular-nums">+{formatCurrency(order.rush_surcharge)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-bold text-navy">Total</span>
                <span className="font-bold text-navy text-xl tabular-nums">
                  {formatCurrency(order.total_price)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100">
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative space-y-6">
                {/* Timeline connector */}
                <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200" />

                <div className="relative flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-white z-10">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-navy">Order Placed</p>
                    <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
                  </div>
                </div>

                <div className="relative flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white z-10">
                    <Clock className="h-4 w-4 text-blue-600 animate-pulse-soft" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-navy">Expected Delivery</p>
                    <p className="text-sm text-gray-500">{formatDate(order.expected_delivery)}</p>
                  </div>
                </div>

                <div className="relative flex items-start gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 ring-4 ring-white z-10">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-navy">Filing Deadline</p>
                    <p className="text-sm text-orange-600 font-medium">{formatDate(order.filing_deadline)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Turnaround */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  order.turnaround === 'standard' ? 'bg-gray-100' : 'bg-orange-100'
                }`}>
                  <Clock className={`h-5 w-5 ${
                    order.turnaround === 'standard' ? 'text-gray-600' : 'text-orange-600'
                  }`} />
                </div>
                <div>
                  <Badge variant={order.turnaround === 'standard' ? 'secondary' : 'warning'}>
                    {order.turnaround === 'standard'
                      ? 'Standard'
                      : order.turnaround === 'rush_72'
                        ? 'Rush 72hr'
                        : 'Rush 48hr'}
                  </Badge>
                  <p className="text-sm text-gray-500 mt-1">
                    {order.turnaround === 'standard'
                      ? 'Tier 3: 7-14 business days'
                      : order.turnaround === 'rush_72'
                        ? '72-hour delivery'
                        : '48-hour delivery'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Need Help Card */}
          <Card className="border-0 shadow-sm bg-gradient-to-br from-navy to-navy-light text-white overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <span className="font-semibold">Need Help?</span>
              </div>
              <p className="text-sm text-white/70 mb-4">
                Questions about this order or need to make changes?
              </p>
              <a
                href="mailto:support@motiongranted.com"
                className="inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal-light transition-colors"
              >
                Contact Support
                <ChevronRight className="h-4 w-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
