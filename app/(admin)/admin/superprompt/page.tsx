import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PhasePromptViewer } from '@/components/admin/phase-prompt-viewer';

export const metadata: Metadata = {
  title: 'AI Phase Prompts - Admin',
  description: 'View the system prompts that drive each phase of motion generation.',
};

export default async function PromptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect('/admin');
  }

  return <PhasePromptViewer />;
}
