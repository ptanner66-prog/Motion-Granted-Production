/**
 * Redirect old 8-step wizard to consolidated intake form (SP-14).
 *
 * The 8-step wizard has been deprecated to eliminate
 * the Step 8 stale data bug and consolidate intake.
 */

import { redirect } from 'next/navigation';

export default function OldNewOrderPage() {
  redirect('/submit');
}
