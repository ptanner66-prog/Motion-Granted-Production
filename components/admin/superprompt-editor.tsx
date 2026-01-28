'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Plus,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  Star,
  Edit3,
  X,
  Info,
  Upload,
  FileUp,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  motionTypes: string[];
  template: string;
  systemPrompt: string | null;
  maxTokens: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SuperpromptEditorProps {
  initialTemplates: Template[];
  availablePlaceholders: Record<string, string>;
}

// Helper to estimate tokens (~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Helper to format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SuperpromptEditor({
  initialTemplates,
  availablePlaceholders,
}: SuperpromptEditorProps) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplates.find((t) => t.isDefault)?.id || initialTemplates[0]?.id || null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state - increased default maxTokens for Opus
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    motionTypes: '*',
    template: '',
    systemPrompt: '',
    maxTokens: 32000, // Increased for long motions
    isDefault: false,
  });

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  // Detect placeholders in template
  const detectPlaceholders = useCallback((text: string) => {
    const found = text.match(/\{\{[A-Z_]+\}\}/g) || [];
    const unique = [...new Set(found)];
    const valid = unique.filter((p) => p in availablePlaceholders);
    const invalid = unique.filter((p) => !(p in availablePlaceholders));
    return { valid, invalid };
  }, [availablePlaceholders]);

  const { valid: validPlaceholders, invalid: invalidPlaceholders } = detectPlaceholders(
    isEditing || isCreating ? formData.template : selectedTemplate?.template || ''
  );

  // File upload handler
  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setMessage(null);

    try {
      let text = '';

      if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        // Plain text files
        text = await file.text();
      } else if (file.name.endsWith('.docx')) {
        // For DOCX, we need to send to an API endpoint to parse
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/superprompt/parse-docx', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to parse DOCX file');
        }

        const data = await response.json();
        text = data.text;
      } else {
        throw new Error('Unsupported file type. Please use .txt, .md, or .docx');
      }

      // Update the form with the file content
      setFormData((prev) => ({
        ...prev,
        template: text,
        name: prev.name || file.name.replace(/\.(txt|md|docx)$/i, ''),
      }));

      setMessage({
        type: 'success',
        text: `Loaded ${formatSize(file.size)} (${text.length.toLocaleString()} chars, ~${estimateTokens(text).toLocaleString()} tokens)`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to read file',
      });
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Start editing
  const handleEdit = () => {
    if (!selectedTemplate) return;
    setFormData({
      name: selectedTemplate.name,
      description: selectedTemplate.description || '',
      motionTypes: selectedTemplate.motionTypes.join(', '),
      template: selectedTemplate.template,
      systemPrompt: selectedTemplate.systemPrompt || '',
      maxTokens: selectedTemplate.maxTokens,
      isDefault: selectedTemplate.isDefault,
    });
    setIsEditing(true);
    setIsCreating(false);
  };

  // Start creating new
  const handleNew = () => {
    setFormData({
      name: '',
      description: '',
      motionTypes: '*',
      template: '',
      systemPrompt: 'You are an expert legal motion drafter using the superprompt workflow. Follow the structured phases exactly. Produce professional, court-ready legal documents with proper formatting and verified citations.',
      maxTokens: 32000, // High limit for long motions
      isDefault: templates.length === 0,
    });
    setIsCreating(true);
    setIsEditing(false);
    setSelectedId(null);
  };

  // Cancel editing
  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (templates.length > 0 && !selectedId) {
      setSelectedId(templates[0].id);
    }
  };

  // Save template
  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const motionTypesArray = formData.motionTypes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        ...(isEditing ? { id: selectedId } : {}),
        name: formData.name,
        description: formData.description,
        motionTypes: motionTypesArray.length > 0 ? motionTypesArray : ['*'],
        template: formData.template,
        systemPrompt: formData.systemPrompt || null,
        maxTokens: formData.maxTokens,
        isDefault: formData.isDefault,
      };

      const response = await fetch('/api/superprompt/templates', {
        method: isCreating ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save template');
      }

      // Update local state
      if (isCreating) {
        setTemplates((prev) => [data.template, ...prev]);
        setSelectedId(data.template.id);
      } else {
        setTemplates((prev) =>
          prev.map((t) => (t.id === selectedId ? data.template : t))
        );
      }

      // If we set this as default, unset others locally
      if (formData.isDefault) {
        setTemplates((prev) =>
          prev.map((t) => ({
            ...t,
            isDefault: t.id === (data.template?.id || selectedId),
          }))
        );
      }

      setIsEditing(false);
      setIsCreating(false);
      setMessage({ type: 'success', text: 'Template saved successfully!' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save template',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete template
  const handleDelete = async () => {
    if (!selectedId || !confirm('Are you sure you want to delete this template?')) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/superprompt/templates?id=${selectedId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      setTemplates((prev) => prev.filter((t) => t.id !== selectedId));
      setSelectedId(templates.find((t) => t.id !== selectedId)?.id || null);
      setMessage({ type: 'success', text: 'Template deleted!' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to delete template',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Copy placeholder to clipboard
  const copyPlaceholder = (placeholder: string) => {
    navigator.clipboard.writeText(placeholder);
    setMessage({ type: 'success', text: `Copied ${placeholder}` });
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Template List */}
      <div className="lg:col-span-1 space-y-4">
        <Card className="bg-white border-gray-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-navy">Templates</CardTitle>
              <Button size="sm" onClick={handleNew} disabled={isEditing || isCreating}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No templates yet. Create your first one!
              </p>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    if (!isEditing && !isCreating) {
                      setSelectedId(template.id);
                    }
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedId === template.id
                      ? 'border-teal bg-teal/5'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${isEditing || isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={isEditing || isCreating}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-navy">{template.name}</span>
                    </div>
                    {template.isDefault && (
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                    {template.description || 'No description'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Updated {new Date(template.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Available Placeholders */}
        <Card className="bg-white border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-navy flex items-center gap-2">
              <Info className="h-4 w-4" />
              Available Placeholders
            </CardTitle>
            <CardDescription>Click to copy</CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto">
            <div className="space-y-1">
              {Object.entries(availablePlaceholders).map(([placeholder, description]) => (
                <button
                  key={placeholder}
                  onClick={() => copyPlaceholder(placeholder)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 group"
                >
                  <code className="text-xs font-mono text-teal group-hover:text-teal/80">
                    {placeholder}
                  </code>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor */}
      <div className="lg:col-span-2">
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-navy">
                  {isCreating
                    ? 'New Template'
                    : isEditing
                    ? 'Edit Template'
                    : selectedTemplate?.name || 'Select a Template'}
                </CardTitle>
                <CardDescription>
                  {isCreating || isEditing
                    ? 'Paste your lawyer\'s superprompt and use placeholders for dynamic data'
                    : 'View and manage your motion generation template'}
                </CardDescription>
              </div>
              {!isEditing && !isCreating && selectedTemplate && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleEdit}>
                    <Edit3 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {(isEditing || isCreating) && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving || !formData.name || !formData.template}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Message */}
            {message && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {message.text}
              </div>
            )}

            {(isEditing || isCreating) ? (
              <>
                {/* Name & Description */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Main Motion Template v2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="motionTypes">Motion Types (comma-separated, or * for all)</Label>
                    <Input
                      id="motionTypes"
                      value={formData.motionTypes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, motionTypes: e.target.value }))}
                      placeholder="*, Motion to Dismiss, Motion for Summary Judgment"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of this template"
                  />
                </div>

                {/* The Superprompt - File Upload + Textarea */}
                <div className="space-y-2">
                  <Label htmlFor="template">Superprompt Template *</Label>

                  {/* File Upload Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                      isDragging
                        ? 'border-teal bg-teal/5'
                        : 'border-gray-300 hover:border-gray-400'
                    } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.docx"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    {isUploading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 text-teal animate-spin" />
                        <span className="text-gray-600">Processing file...</span>
                      </div>
                    ) : (
                      <>
                        <FileUp className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 font-medium">
                          Drop your superprompt file here, or click to browse
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Supports .txt, .md, .docx • No size limit
                        </p>
                      </>
                    )}
                  </div>

                  {/* Token/Character Stats */}
                  {formData.template && (
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{formData.template.length.toLocaleString()} characters</span>
                      <span>~{estimateTokens(formData.template).toLocaleString()} tokens</span>
                      <span className={estimateTokens(formData.template) > 100000 ? 'text-amber-600' : 'text-green-600'}>
                        {estimateTokens(formData.template) > 100000 ? '⚠️ Large prompt' : '✓ Within limits'}
                      </span>
                    </div>
                  )}

                  {/* Textarea for editing/viewing */}
                  <Textarea
                    id="template"
                    value={formData.template}
                    onChange={(e) => setFormData((prev) => ({ ...prev, template: e.target.value }))}
                    placeholder="Upload a file above or paste your lawyer's superprompt here. Use placeholders like {{CASE_NUMBER}}, {{STATEMENT_OF_FACTS}}, etc."
                    className="min-h-[400px] font-mono text-sm"
                  />
                </div>

                {/* Placeholder Detection */}
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-navy">Detected Placeholders:</p>
                  {validPlaceholders.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {validPlaceholders.map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-mono"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  {invalidPlaceholders.length > 0 && (
                    <div>
                      <p className="text-xs text-amber-600 mb-1">Unrecognized (will not be replaced):</p>
                      <div className="flex flex-wrap gap-1">
                        {invalidPlaceholders.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-mono"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {validPlaceholders.length === 0 && invalidPlaceholders.length === 0 && (
                    <p className="text-sm text-gray-500">No placeholders detected yet</p>
                  )}
                </div>

                {/* System Prompt */}
                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt (optional)</Label>
                  <Textarea
                    id="systemPrompt"
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                    placeholder="Optional system prompt for Claude"
                    className="min-h-[80px]"
                  />
                </div>

                {/* Options */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Set as default template</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="maxTokens" className="text-sm">Max tokens:</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      value={formData.maxTokens}
                      onChange={(e) => setFormData((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) || 16000 }))}
                      className="w-24"
                    />
                  </div>
                </div>
              </>
            ) : selectedTemplate ? (
              <>
                {/* View mode */}
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-sm text-gray-500">Motion Types</p>
                      <p className="text-navy font-medium">
                        {selectedTemplate.motionTypes.join(', ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Max Output Tokens</p>
                      <p className="text-navy font-medium">{selectedTemplate.maxTokens.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Template Size</p>
                      <p className="text-navy font-medium">{selectedTemplate.template.length.toLocaleString()} chars</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Est. Input Tokens</p>
                      <p className="text-navy font-medium">~{estimateTokens(selectedTemplate.template).toLocaleString()}</p>
                    </div>
                  </div>

                  {selectedTemplate.description && (
                    <div>
                      <p className="text-sm text-gray-500">Description</p>
                      <p className="text-navy">{selectedTemplate.description}</p>
                    </div>
                  )}

                  {/* Placeholder Detection */}
                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-navy">Placeholders Used:</p>
                    {validPlaceholders.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {validPlaceholders.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-mono"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No placeholders detected</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-500">Template</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedTemplate.template);
                          setMessage({ type: 'success', text: 'Template copied!' });
                          setTimeout(() => setMessage(null), 2000);
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="p-4 bg-gray-50 rounded-lg text-sm font-mono text-navy whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto overflow-x-hidden w-full">
                      {selectedTemplate.template}
                    </pre>
                  </div>

                  {selectedTemplate.systemPrompt && (
                    <div>
                      <p className="text-sm text-gray-500 mb-2">System Prompt</p>
                      <pre className="p-4 bg-gray-50 rounded-lg text-sm font-mono text-navy whitespace-pre-wrap break-words overflow-x-hidden w-full">
                        {selectedTemplate.systemPrompt}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a template or create a new one</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
