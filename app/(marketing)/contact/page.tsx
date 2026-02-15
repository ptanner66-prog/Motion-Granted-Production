'use client';

import { useState } from 'react';
import { Mail, Phone, MapPin, Send, Loader2, CheckCircle } from 'lucide-react';

export default function ContactPage() {
  const [formState, setFormState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormState('submitting');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormState('success');
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          subject: 'General Inquiry',
          message: '',
        });
      } else {
        setFormState('error');
      }
    } catch {
      setFormState('error');
    }
  };

  return (
    <div>
      {/* Page Header */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
            CONTACT
          </span>
          <h1 className="font-serif text-5xl text-[#0F1F33] mt-3 mb-4">
            Get in <em className="text-[#C9A227]">touch</em>
          </h1>
          <p className="text-lg text-slate-500">
            Questions about our services? Ready to submit your first order? We&apos;re here to help.
          </p>
        </div>
      </section>

      {/* Contact Content */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-5 gap-12">
            {/* Contact Info */}
            <div className="md:col-span-2 space-y-6">
              <ContactCard
                icon={<Mail className="w-6 h-6" />}
                title="Email Us"
                content="info@motiongranted.ai"
                note="Response within 24 hours"
              />
              <ContactCard
                icon={<Phone className="w-6 h-6" />}
                title="Call Us"
                content="(225) 555-0123"
                note="Mon-Fri, 9am-5pm CST"
              />
              <ContactCard
                icon={<MapPin className="w-6 h-6" />}
                title="Location"
                content="Baton Rouge, Louisiana"
                note="Serving attorneys nationwide"
              />
            </div>

            {/* Contact Form */}
            <div className="md:col-span-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                <h3 className="font-serif text-2xl text-[#0F1F33] mb-2">Send us a message</h3>
                <p className="text-slate-400 text-sm mb-6">
                  Fill out the form below and we&apos;ll get back to you soon.
                </p>

                {formState === 'success' ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <h4 className="font-semibold text-green-800 mb-2">Message Sent!</h4>
                    <p className="text-green-600 text-sm">
                      We&apos;ll get back to you within 24 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          First Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.firstName}
                          onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Last Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.lastName}
                          onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Phone (optional)
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Subject
                      </label>
                      <select
                        value={formData.subject}
                        onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent outline-none"
                      >
                        <option>General Inquiry</option>
                        <option>Pricing Question</option>
                        <option>Order Support</option>
                        <option>Partnership Opportunity</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Message *
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={formData.message}
                        onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent resize-none outline-none"
                      />
                    </div>

                    {formState === 'error' && (
                      <p className="text-red-600 text-sm">
                        Something went wrong. Please try again.
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={formState === 'submitting'}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#1E3A5F] text-white font-semibold rounded-lg hover:bg-[#152C4A] transition-colors disabled:opacity-50"
                    >
                      {formState === 'submitting' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                      {formState === 'submitting' ? 'Sending...' : 'Send Message'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  content,
  note
}: {
  icon: React.ReactNode;
  title: string;
  content: string;
  note: string;
}) {
  return (
    <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-[#C9A227]/20 rounded-lg flex items-center justify-center text-[#C9A227] mb-4">
        {icon}
      </div>
      <h4 className="font-semibold text-[#0F1F33] mb-1">{title}</h4>
      <p className="text-slate-700 font-medium">{content}</p>
      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
        {note}
      </div>
    </div>
  );
}
