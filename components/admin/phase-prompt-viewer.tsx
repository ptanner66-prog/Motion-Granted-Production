'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

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
  routing: {
    A: TierRouting;
    B: TierRouting;
    C: TierRouting;
  };
  stages: Record<string, { A: TierRouting; B: TierRouting; C: TierRouting }> | null;
}

interface PromptsResponse {
  phases: PhaseData[];
  version: string;
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a short display name for a model string. */
function formatModelName(model: string | null): string {
  if (!model) return 'No LLM';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('gpt-4')) return 'GPT-4 Turbo';
  return model;
}

/** Returns the badge variant for a given model string. */
function modelBadgeVariant(model: string | null): 'info' | 'purple' | 'secondary' | 'emerald' | 'warning' {
  if (!model) return 'secondary';
  if (model.includes('opus')) return 'purple';
  if (model.includes('sonnet')) return 'info';
  if (model.includes('haiku')) return 'emerald';
  if (model.includes('gpt')) return 'warning';
  return 'secondary';
}

/** Formats a number with commas. */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Maps a registryKey like 'V.1' to a display label like 'V.1'. */
function phaseLabel(registryKey: string): string {
  return registryKey;
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
  const tiers = (['A', 'B', 'C'] as const).map((tier) => {
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
              <th className="pb-2 font-medium">Tier C</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stages).map(([stageName, tierRouting]) => (
              <tr key={stageName} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-4 font-medium text-gray-700">{stageName}</td>
                {(['A', 'B', 'C'] as const).map((tier) => {
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

function PhaseCard({ phase, isExpanded, onToggle }: {
  phase: PhaseData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
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

      {isExpanded && (
        <CardContent>
          <div className="space-y-4">
            {/* Routing detail */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['A', 'B', 'C'] as const).map((tier) => {
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
            </div>

            {/* Prompt text */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                <FileText className="h-3.5 w-3.5 inline mr-1" />
                System Prompt
              </p>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-gray-700 leading-relaxed overflow-y-auto max-h-[500px] whitespace-pre-wrap break-words">
                {phase.promptText}
              </pre>
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

  const fetchPrompts = async () => {
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
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

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
    setExpandedPhase((prev) => (prev === key ? null : key));
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
          AI Phase Prompts
        </h1>
        <p className="text-gray-500 mt-1">
          View the system prompts that drive each phase of motion generation
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
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
