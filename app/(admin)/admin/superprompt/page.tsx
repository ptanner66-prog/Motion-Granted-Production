import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SuperpromptEditor } from '@/components/admin/superprompt-editor';
import { AVAILABLE_PLACEHOLDERS } from '@/lib/workflow/superprompt-engine';

interface SuperpromptTemplateRecord {
  id: string;
  name: string;
  description: string;
  motion_types: string[];
  template: string;
  system_prompt: string | null;
  max_tokens: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const metadata: Metadata = {
  title: 'Superprompt Templates - Admin',
  description: 'Manage your AI motion generation templates.',
};

export default async function SuperpromptPage() {
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

  // Fetch existing templates
  const { data: templates } = await supabase
    .from('superprompt_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });

  const formattedTemplates = (templates || []).map((t: SuperpromptTemplateRecord) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    motionTypes: t.motion_types,
    template: t.template,
    systemPrompt: t.system_prompt,
    maxTokens: t.max_tokens,
    isDefault: t.is_default,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
          Superprompt Templates
        </h1>
        <p className="text-gray-500 mt-1">
          Upload and manage your lawyer&apos;s AI motion generation templates
        </p>
      </div>

      <SuperpromptEditor
        initialTemplates={formattedTemplates}
        availablePlaceholders={AVAILABLE_PLACEHOLDERS}
      />
    </div>
  );
}
