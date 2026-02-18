import { Resend } from 'resend'

// Lazy initialization to avoid build errors when API key is not available
let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

export const resend = {
  get emails() {
    return getResend().emails;
  }
};

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string | string[]
  subject: string
  react: React.ReactElement
}) {
  try {
    const data = await getResend().emails.send({
      from: 'Motion Granted <noreply@motion-granted.com>',
      to,
      subject,
      react,
    })

    return { success: true, data }
  } catch (error) {
    return { success: false, error }
  }
}
