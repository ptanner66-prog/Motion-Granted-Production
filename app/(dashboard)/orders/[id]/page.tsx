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

export default function OrderDetailPage() {
  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href="/orders"
          className="inline-flex items-center text-sm text-gray-500 hover:text-navy"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-navy">{order.order_number}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-lg text-gray-600">{order.motion_type}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <MessageSquare className="mr-2 h-4 w-4" />
              Message Clerk
            </Button>
            {order.status === 'draft_delivered' && (
              <Button>
                <Download className="mr-2 h-4 w-4" />
                Download Draft
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6 space-y-6">
              {/* Case Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Case Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Case Caption</p>
                      <p className="mt-1 text-navy">{order.case_caption}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Case Number</p>
                      <p className="mt-1 text-navy">{order.case_number}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Jurisdiction</p>
                      <p className="mt-1 text-navy">{order.jurisdiction}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Court/Division</p>
                      <p className="mt-1 text-navy">{order.court_division}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Parties */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Parties</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {order.parties.map((party, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium text-navy">{party.name}</p>
                          <p className="text-sm text-gray-500">{party.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Case Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Statement of Facts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{order.statement_of_facts}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Procedural History</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{order.procedural_history}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Drafting Instructions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{order.instructions}</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Uploaded Documents</CardTitle>
                  <CardDescription>Documents provided with this order</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {order.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                            <FileText className="h-5 w-5 text-gray-500" />
                          </div>
                          <div>
                            <p className="font-medium text-navy">{doc.name}</p>
                            <p className="text-sm text-gray-500">
                              {(doc.size / 1024).toFixed(0)} KB • {formatDateShort(doc.uploaded_at)}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Messages</CardTitle>
                  <CardDescription>Communication with your assigned clerk</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {order.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${
                          message.sender === 'client' ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${
                            message.sender === 'client'
                              ? 'bg-teal/10'
                              : 'bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-navy">
                              {message.sender_name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDateShort(message.created_at)}
                            </span>
                          </div>
                          <p className="text-gray-700">{message.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Message input */}
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <Textarea placeholder="Type your message..." rows={3} />
                    <div className="flex justify-end">
                      <Button>
                        <Send className="mr-2 h-4 w-4" />
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Base Price</span>
                <span className="font-medium">{formatCurrency(order.base_price)}</span>
              </div>
              {order.rush_surcharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Rush Surcharge</span>
                  <span className="font-medium">{formatCurrency(order.rush_surcharge)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold text-navy">Total</span>
                <span className="font-semibold text-navy">
                  {formatCurrency(order.total_price)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                  <Calendar className="h-4 w-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Order Placed</p>
                  <p className="text-navy">{formatDate(order.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Expected Delivery</p>
                  <p className="text-navy">{formatDate(order.expected_delivery)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <Scale className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Filing Deadline</p>
                  <p className="text-navy">{formatDate(order.filing_deadline)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Turnaround */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Badge variant={order.turnaround === 'standard' ? 'secondary' : 'warning'}>
                  {order.turnaround === 'standard'
                    ? 'Standard'
                    : order.turnaround === 'rush_72'
                    ? 'Rush 72hr'
                    : 'Rush 48hr'}
                </Badge>
                <span className="text-sm text-gray-500">
                  {order.turnaround === 'standard'
                    ? 'Tier 3: 7-14 business days'
                    : order.turnaround === 'rush_72'
                    ? '72-hour delivery'
                    : '48-hour delivery'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
