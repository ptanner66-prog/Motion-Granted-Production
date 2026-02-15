'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  FileText,
  Cpu,
  Brain,
  Hash,
  Zap,
  Code,
  MessageSquare,
  AlertCircle,
  Pencil,
  Save,
  X,
  RotateCcw,
  Clock,
  Check,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ── Types ────────────────────────────────────────────────────────────────────

interface TierRouting {
  model: string | null;
  thinkingBudget: number | null;
  maxTokens: number;
}

interface PhaseData {
  index: number;
  key: string;
  registryKey: string;
  name: string;
  mode: 'CODE' | 'CHAT';
  promptText: string;
  wordCount: number;
  charCount: number;
  version: string;
  editVersion: number | null;
  lastEditor: string | null;
  lastUpdated: string | null;
  routing: {
    A: TierRouting;
    B: TierRouting;
    C: TierRouting;
    D: TierRouting;
  };
  stages: Record<string, { A: TierRouting; B: TierRouting; C: TierRouting; D: TierRouting }> | null;
}

interface PromptsResponse {
  phases: PhaseData[];
  version: string;
  updatedAt: string;
}

interface VersionEntry {
  id: string;
  phase: string;
  phaseKey: string;
  editVersion: number;
  wordCount: number;
  charCount: number;
  editedBy: string | null;
  editNote: string | null;
  createdAt: string;
  promptContent: string;
}

interface SaveResult {
  success: boolean;
  edit_version?: number;
  word_count?: number;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatModelName(model: string | null): string {
  if (!model) return 'No LLM';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('gpt-4')) return 'GPT-4 Turbo';
  return model;
}

function modelBadgeVariant(model: string | null): 'info' | 'purple' | 'secondary' | 'emerald' | 'warning' {
  if (!model) return 'secondary';
  if (model.includes('opus')) return 'purple';
  if (model.includes('sonnet')) return 'info';
  if (model.includes('haiku')) return 'emerald';
  if (model.includes('gpt')) return 'warning';
  return 'secondary';
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function phaseLabel(registryKey: string): string {
  return registryKey;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="rounded-xl border border-gray-100 bg-white p-6">
            <div className="flex items-center gap-4">
              <div className="h-5 w-16 rounded bg-gray-200" />
              <div className="h-5 w-48 rounded bg-gray-200" />
              <div className="ml-auto flex gap-2">
                <div className="h-5 w-20 rounded-full bg-gray-200" />
                <div className="h-5 w-20 rounded-full bg-gray-200" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
        <p className="text-sm font-medium text-gray-900 mb-1">Failed to load prompts</p>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        <button
          onClick={onRetry}
          className="text-sm font-medium text-teal-600 hover:text-teal-700 underline"
        >
          Try again
        </button>
      </CardContent>
    </Card>
  );
}

function TierRoutingBadges({ routing }: { routing: PhaseData['routing'] }) {
  const tiers = (['A', 'B', 'C', 'D'] as const).map((tier) => {
    const route = routing[tier];
    const label = formatModelName(route.model);
    const variant = modelBadgeVariant(route.model);
    const hasET = route.thinkingBudget && route.thinkingBudget > 0;

    return (
      <span key={tier} className="inline-flex items-center gap-1">
        <span className="text-xs text-gray-400 font-medium">{tier}:</span>
        <Badge variant={variant} className="text-[11px]">
          {label}
          {hasET && (
            <Zap className="ml-0.5 h-3 w-3 inline" />
          )}
        </Badge>
      </span>
    );
  });

  return <div className="flex flex-wrap items-center gap-2">{tiers}</div>;
}

function StageRoutingTable({ stages }: { stages: NonNullable<PhaseData['stages']> }) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Multi-Stage Routing
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="pb-2 pr-4 font-medium">Stage</th>
              <th className="pb-2 pr-4 font-medium">Tier A</th>
              <th className="pb-2 pr-4 font-medium">Tier B</th>
              <th className="pb-2 pr-4 font-medium">Tier C</th>
              <th className="pb-2 font-medium">Tier D</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stages).map(([stageName, tierRouting]) => (
              <tr key={stageName} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-4 font-medium text-gray-700">{stageName}</td>
                {(['A', 'B', 'C', 'D'] as const).map((tier) => {
                  const route = tierRouting[tier];
                  return (
                    <td key={tier} className="py-2 pr-4">
                      <Badge variant={modelBadgeVariant(route.model)} className="text-[11px]">
                        {formatModelName(route.model)}
                      </Badge>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Version History Panel ────────────────────────────────────────────────────

function VersionHistoryPanel({
  phaseKey,
  onRestore,
}: {
  phaseKey: string;
  onRestore: (content: string, version: number) => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersions() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/prompts/${phaseKey}/versions?limit=20`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setVersions(data.versions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      } finally {
        setLoading(false);
      }
    }
    fetchVersions();
  }, [phaseKey]);

  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
        Loading version history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-gray-400">
        No version history available yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                v{v.editVersion}
              </span>
              <span className="text-xs text-gray-400">
                {formatNumber(v.wordCount)} words
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              {v.editedBy && <span>by {v.editedBy}</span>}
              <span>{formatTimestamp(v.createdAt)}</span>
            </div>
            {v.editNote && (
              <p className="text-xs text-gray-500 mt-0.5 italic truncate">
                {v.editNote}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRestore(v.promptContent, v.editVersion)}
            className="shrink-0 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Restore
          </Button>
        </div>
      ))}
    </div>
  );
}

// ── Phase Card (with editing) ────────────────────────────────────────────────

function PhaseCard({
  phase,
  isExpanded,
  onToggle,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  editContent,
  onEditContentChange,
  originalContent,
  saving,
  saveResult,
  onClearSaveResult,
}: {
  phase: PhaseData;
  isExpanded: boolean;
  onToggle: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  editContent: string;
  onEditContentChange: (content: string) => void;
  originalContent: string;
  saving: boolean;
  saveResult: SaveResult | null;
  onClearSaveResult: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChanges = editContent !== originalContent;
  const currentWordCount = isEditing ? wordCount(editContent) : phase.wordCount;
  const originalWordCount = wordCount(originalContent);
  const wordDiff = currentWordCount - originalWordCount;

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  // Clear save result after 4 seconds
  useEffect(() => {
    if (saveResult) {
      const timer = setTimeout(onClearSaveResult, 4000);
      return () => clearTimeout(timer);
    }
  }, [saveResult, onClearSaveResult]);

  function handleRestore(content: string, _version: number) {
    onEditContentChange(content);
    setShowHistory(false);
  }

  return (
    <Card className="transition-shadow hover:shadow-md">
      {/* Card Header (clickable to expand/collapse) */}
      <button
        onClick={onToggle}
        className="w-full text-left focus:outline-none focus:ring-2 focus:ring-teal/20 rounded-xl"
        aria-expanded={isExpanded}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-teal-600 font-semibold shrink-0">
                    Phase {phaseLabel(phase.registryKey)}
                  </span>
                  <span className="text-gray-300 shrink-0">&mdash;</span>
                  <span className="truncate">{phase.name}</span>
                </CardTitle>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {phase.editVersion && phase.editVersion > 1 && (
                <Badge variant="outline" className="text-[11px]">
                  edit v{phase.editVersion}
                </Badge>
              )}
              <Badge variant={phase.mode === 'CHAT' ? 'info' : 'secondary'} className="text-[11px]">
                {phase.mode === 'CHAT' ? (
                  <MessageSquare className="mr-1 h-3 w-3 inline" />
                ) : (
                  <Code className="mr-1 h-3 w-3 inline" />
                )}
                {phase.mode}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                <Hash className="mr-0.5 h-3 w-3 inline" />
                {formatNumber(phase.wordCount)} words
              </Badge>
            </div>
          </div>
          <div className="ml-7 mt-2">
            <TierRoutingBadges routing={phase.routing} />
          </div>
        </CardHeader>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent>
          <div className="space-y-4">
            {/* Routing detail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(['A', 'B', 'C', 'D'] as const).map((tier) => {
                const route = phase.routing[tier];
                return (
                  <div key={tier} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Tier {tier}
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Brain className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-gray-600">Model:</span>
                        <Badge variant={modelBadgeVariant(route.model)} className="text-[11px]">
                          {formatModelName(route.model)}
                        </Badge>
                      </div>
                      {route.thinkingBudget && route.thinkingBudget > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-gray-600">Thinking:</span>
                          <span className="font-mono text-gray-800">
                            {formatNumber(route.thinkingBudget)} tokens
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-gray-600">Max tokens:</span>
                        <span className="font-mono text-gray-800">
                          {formatNumber(route.maxTokens)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Multi-stage routing for CIV phases */}
            {phase.stages && <StageRoutingTable stages={phase.stages} />}

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
              <span>{formatNumber(phase.wordCount)} words</span>
              <span>{formatNumber(phase.charCount)} characters</span>
              <span>Version {phase.version}</span>
              {phase.lastEditor && (
                <span>Last edited by {phase.lastEditor}</span>
              )}
              {phase.lastUpdated && (
                <span>{formatTimestamp(phase.lastUpdated)}</span>
              )}
            </div>

            {/* Prompt Section — Edit or View */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <FileText className="h-3.5 w-3.5 inline mr-1" />
                  System Prompt
                </p>
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowHistory(!showHistory); }}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" />
                      {showHistory ? 'Hide History' : 'Version History'}
                    </button>
                  )}
                  {!isEditing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
                      className="text-xs"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onCancelEdit(); setShowHistory(false); }}
                        disabled={saving}
                        className="text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onSave(); }}
                        disabled={!hasChanges || saving}
                        className="text-xs"
                      >
                        {saving ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3 mr-1" />
                        )}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Save result toast */}
              {saveResult && (
                <div
                  className={`mb-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${
                    saveResult.success
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {saveResult.success ? (
                    <>
                      <Check className="h-4 w-4 shrink-0" />
                      Saved — version {saveResult.edit_version} ({formatNumber(saveResult.word_count ?? 0)} words)
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {saveResult.error || 'Failed to save. Please try again.'}
                    </>
                  )}
                </div>
              )}

              {/* Edit indicators */}
              {isEditing && (
                <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
                  <span>{formatNumber(currentWordCount)} words</span>
                  {hasChanges && (
                    <span className={wordDiff > 0 ? 'text-emerald-600' : wordDiff < 0 ? 'text-amber-600' : ''}>
                      {wordDiff > 0 ? '+' : ''}{formatNumber(wordDiff)} words changed
                    </span>
                  )}
                  {!hasChanges && (
                    <span className="text-gray-400">No changes</span>
                  )}
                </div>
              )}

              {/* Version history panel */}
              {isEditing && showHistory && (
                <div className="mb-3 border border-gray-200 rounded-lg p-3 bg-white">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Version History
                  </p>
                  <VersionHistoryPanel
                    phaseKey={phase.key}
                    onRestore={handleRestore}
                  />
                </div>
              )}

              {/* Editor textarea or read-only display */}
              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => onEditContentChange(e.target.value)}
                  disabled={saving}
                  className="w-full min-h-[500px] rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-mono text-gray-700 leading-relaxed transition-all duration-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 focus:outline-none disabled:opacity-50 resize-y"
                  spellCheck={false}
                />
              ) : (
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-gray-700 leading-relaxed overflow-y-auto max-h-[500px] whitespace-pre-wrap break-words">
                  {phase.promptText}
                </pre>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PhasePromptViewer() {
  const [data, setData] = useState<PromptsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit state
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/prompts');
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: PromptsResponse = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // Unsaved changes warning
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (editingPhase && editContent !== originalContent) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editingPhase, editContent, originalContent]);

  const filteredPhases = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.phases;

    const q = searchQuery.toLowerCase();
    return data.phases.filter(
      (phase) =>
        phase.name.toLowerCase().includes(q) ||
        phase.registryKey.toLowerCase().includes(q) ||
        phase.promptText.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  const totalWords = useMemo(() => {
    if (!data) return 0;
    return data.phases.reduce((sum, p) => sum + p.wordCount, 0);
  }, [data]);

  const handleToggle = (key: string) => {
    // Don't collapse if currently editing this phase
    if (editingPhase === key) return;
    setExpandedPhase((prev) => (prev === key ? null : key));
  };

  function handleStartEdit(phase: PhaseData) {
    setEditingPhase(phase.key);
    setEditContent(phase.promptText);
    setOriginalContent(phase.promptText);
    setSaveResult(null);
    // Ensure the phase is expanded
    setExpandedPhase(phase.key);
  }

  function handleCancelEdit() {
    setEditingPhase(null);
    setEditContent('');
    setOriginalContent('');
    setSaveResult(null);
  }

  async function handleSave(phaseKey: string) {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_key: phaseKey,
          content: editContent,
        }),
      });
      const result: SaveResult = await res.json();

      if (result.success) {
        setSaveResult(result);
        setOriginalContent(editContent);
        // Refresh to pick up new word count, version, etc.
        await fetchPrompts();
      } else {
        setSaveResult({ success: false, error: result.error });
      }
    } catch {
      setSaveResult({ success: false, error: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const handleClearSaveResult = useCallback(() => {
    setSaveResult(null);
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
          AI Phase Prompts
        </h1>
        <p className="text-gray-500 mt-1">
          View and edit the system prompts that drive each phase of motion generation
        </p>
      </div>

      {/* Summary Stats */}
      {data && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Phases</p>
              <p className="text-2xl font-bold text-navy mt-1">{data.phases.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Words</p>
              <p className="text-2xl font-bold text-navy mt-1">{formatNumber(totalWords)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Version</p>
              <p className="text-2xl font-bold text-navy mt-1">{data.version}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</p>
              <p className="text-2xl font-bold text-navy mt-1">{data.updatedAt}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      {data && !loading && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Filter phases by name or prompt content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          {searchQuery && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              {filteredPhases.length} of {data.phases.length} phases
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {loading && <LoadingSkeleton />}
      {error && <ErrorState message={error} onRetry={fetchPrompts} />}
      {data && !loading && !error && (
        <div className="space-y-3">
          {filteredPhases.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  No phases match &ldquo;{searchQuery}&rdquo;
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredPhases.map((phase) => (
              <PhaseCard
                key={phase.key}
                phase={phase}
                isExpanded={expandedPhase === phase.key}
                onToggle={() => handleToggle(phase.key)}
                isEditing={editingPhase === phase.key}
                onStartEdit={() => handleStartEdit(phase)}
                onCancelEdit={handleCancelEdit}
                onSave={() => handleSave(phase.key)}
                editContent={editingPhase === phase.key ? editContent : ''}
                onEditContentChange={setEditContent}
                originalContent={editingPhase === phase.key ? originalContent : phase.promptText}
                saving={saving && editingPhase === phase.key}
                saveResult={editingPhase === phase.key ? saveResult : null}
                onClearSaveResult={handleClearSaveResult}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
