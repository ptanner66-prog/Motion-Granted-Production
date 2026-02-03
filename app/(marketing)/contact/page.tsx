import { Metadata } from 'next'
import { Mail, Phone, MapPin, Clock } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Motion Granted. We typically respond within one business day.',
}

const contactInfo = [
  {
    icon: Mail,
    title: 'Email',
    value: siteConfig.contact.email,
    href: `mailto:${siteConfig.contact.email}`,
  },
  {
    icon: Phone,
    title: 'Phone',
    value: siteConfig.contact.phone,
    href: `tel:${siteConfig.contact.phone.replace(/\D/g, '')}`,
  },
  {
    icon: MapPin,
    title: 'Address',
    value: `${siteConfig.address.street}, ${siteConfig.address.suite}\n${siteConfig.address.city}, ${siteConfig.address.state} ${siteConfig.address.zip}`,
    href: null,
  },
  {
    icon: Clock,
    title: 'Hours',
    value: 'Monday - Friday\n9:00 AM - 5:00 PM CT',
    href: null,
  },
]

export default function ContactPage() {
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
              <form className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder="John" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder="Smith" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="john@lawfirm.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input id="phone" type="tel" placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="How can we help?" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Tell us more about your inquiry..."
                    rows={5}
                    required
                  />
                </div>
                <Button type="submit" size="lg">
                  Send Message
                </Button>
              </form>
            </div>

            {/* Contact info */}
            <div>
              <h2 className="text-2xl font-bold text-navy mb-6">Get in Touch</h2>
              <div className="space-y-8">
                {contactInfo.map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-gold/10">
                      <item.icon className="h-6 w-6 text-gold" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-navy">{item.title}</h3>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="text-gray-600 hover:text-gold transition-colors whitespace-pre-line"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="text-gray-600 whitespace-pre-line">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Additional info */}
              <div className="mt-12 rounded-xl bg-gray-50 p-6">
                <h3 className="font-semibold text-navy">Response Time</h3>
                <p className="mt-2 text-gray-600">
                  We typically respond to inquiries within one business day. For urgent matters
                  related to an existing order, please use the messaging feature in your client
                  portal for faster response.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
