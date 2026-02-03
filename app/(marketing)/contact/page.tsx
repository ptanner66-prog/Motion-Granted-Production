'use client'

import { useState } from 'react'
import { Mail, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const contactInfo = [
  {
    icon: Mail,
    title: 'Email',
    value: 'support@motiongranted.com',
    href: 'mailto:support@motiongranted.com',
  },
  {
    icon: Clock,
    title: 'Response Time',
    value: 'Within one business day',
    href: null,
  },
]

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    const formData = new FormData(e.currentTarget)
    const data = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      subject: formData.get('subject'),
      message: formData.get('message'),
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to send message')
      }

      setStatus('success')
      e.currentTarget.reset()
    } catch (error) {
      setStatus('error')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please email us directly at support@motiongranted.com'
      )
    }
  }

  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Contact Us
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Have a question? We&apos;d love to hear from you. Send us a message and we&apos;ll
              respond within one business day.
            </p>
          </div>
        </div>
      </section>

      {/* Contact content */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Contact form */}
            <div>
              <h2 className="text-2xl font-bold text-navy mb-6">Send a Message</h2>

              {status === 'success' ? (
                <div className="p-8 bg-green-50 rounded-xl border border-green-200 text-center">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-800 mb-2">Message Sent!</h3>
                  <p className="text-green-700">
                    Thank you for contacting us. We&apos;ll respond within one business day.
                  </p>
                  <Button
                    className="mt-6"
                    variant="outline"
                    onClick={() => setStatus('idle')}
                  >
                    Send Another Message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        placeholder="John"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        placeholder="Smith"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="john@lawfirm.com"
                      required
                      disabled={status === 'loading'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      disabled={status === 'loading'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      name="subject"
                      placeholder="How can we help?"
                      required
                      disabled={status === 'loading'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      name="message"
                      placeholder="Tell us more about your inquiry..."
                      rows={5}
                      required
                      disabled={status === 'loading'}
                    />
                  </div>

                  {status === 'error' && (
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-red-700 text-sm">{errorMessage}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? 'Sending...' : 'Send Message'}
                  </Button>
                </form>
              )}
            </div>

            {/* Contact info */}
            <div>
              <h2 className="text-2xl font-bold text-navy mb-6">Get in Touch</h2>
              <div className="space-y-8">
                {contactInfo.map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-gold/10 rounded-lg">
                      <item.icon className="h-6 w-6 text-gold" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-navy">{item.title}</h3>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="text-gray-600 hover:text-gold transition-colors"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="text-gray-600">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Location info */}
              <div className="mt-8 p-6 bg-cream rounded-xl border border-navy/10">
                <h3 className="font-semibold text-navy mb-2">Location</h3>
                <p className="text-gray-600">
                  Motion Granted is a Louisiana-based legal drafting service specializing in
                  Louisiana state courts, Louisiana federal courts, and the Fifth Circuit.
                </p>
              </div>

              {/* Additional info */}
              <div className="mt-6 rounded-xl bg-gray-50 p-6">
                <h3 className="font-semibold text-navy">For Existing Orders</h3>
                <p className="mt-2 text-gray-600">
                  For urgent matters related to an existing order, please use the messaging
                  feature in your client portal for faster response.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
