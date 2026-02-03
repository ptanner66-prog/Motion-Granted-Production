import { NextResponse } from 'next/server'
import { resend } from '@/lib/resend'

interface ContactFormData {
  firstName: string
  lastName: string
  email: string
  phone?: string
  subject: string
  message: string
}

export async function POST(request: Request) {
  try {
    const data: ContactFormData = await request.json()

    // Validate required fields
    if (!data.firstName || !data.lastName || !data.email || !data.subject || !data.message) {
      return NextResponse.json(
        { error: 'All fields except phone are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      )
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'support@motiongranted.com'

    // Send notification to admin
    await resend.emails.send({
      from: 'Motion Granted <noreply@motiongranted.com>',
      to: adminEmail,
      subject: `Contact Form: ${data.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #c5a059; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; font-weight: bold; width: 120px;">Name:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${data.firstName} ${data.lastName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Email:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
                <a href="mailto:${data.email}" style="color: #0f172a;">${data.email}</a>
              </td>
            </tr>
            ${data.phone ? `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Phone:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${data.phone}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Subject:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${data.subject}</td>
            </tr>
          </table>

          <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0f172a; margin-top: 0;">Message:</h3>
            <p style="color: #4a5568; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
          </div>

          <p style="color: #718096; font-size: 12px; margin-top: 30px;">
            This email was sent from the Motion Granted contact form.
          </p>
        </div>
      `,
    })

    // Send confirmation to user
    await resend.emails.send({
      from: 'Motion Granted <noreply@motiongranted.com>',
      to: data.email,
      subject: 'We received your message - Motion Granted',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #c5a059; padding-bottom: 10px;">
            Thank You for Contacting Us
          </h2>

          <p style="color: #4a5568; line-height: 1.6;">
            Hi ${data.firstName},
          </p>

          <p style="color: #4a5568; line-height: 1.6;">
            We've received your message and will respond within one business day.
          </p>

          <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0f172a; margin-top: 0;">Your Message:</h3>
            <p style="color: #718096; font-size: 14px;"><strong>Subject:</strong> ${data.subject}</p>
            <p style="color: #4a5568; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
          </div>

          <p style="color: #4a5568; line-height: 1.6;">
            Best regards,<br>
            The Motion Granted Team
          </p>

          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">

          <p style="color: #718096; font-size: 12px;">
            Motion Granted is a Louisiana-based legal drafting service for solo practitioners and small firms.
            We draft. You review. You file.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Failed to send message. Please try again or email us directly.' },
      { status: 500 }
    )
  }
}
