/**
 * Next.js Instrumentation Hook
 *
 * SP-12: Loads Sentry configuration on server/edge startup.
 * This file is required by @sentry/nextjs to auto-register.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const Sentry = await import('@sentry/nextjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Sentry as any).captureRequestError(...args);
};
