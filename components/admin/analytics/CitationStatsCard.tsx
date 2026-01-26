'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scale, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface Citation {
  verification_status: string;
  source: string;
  created_at: string;
}

interface CitationStats {
  total_citations: number;
  verified_count: number;
  flagged_count: number;
  failed_count: number;
  courtlistener_success_rate: number;
  pacer_success_rate: number;
}

export function CitationStatsCard() {
  const [stats, setStats] = useState<CitationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCitationStats();
  }, []);

  async function fetchCitationStats() {
    try {
      const supabase = createClient();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: citations, error: citationsError } = await supabase
        .from('verified_citations')
        .select('verification_status, source, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (citationsError) throw citationsError;

      const allCitations = (citations || []) as Citation[];
      const total = allCitations.length;
      const verified = allCitations.filter((c: Citation) => c.verification_status === 'verified').length;
      const flagged = allCitations.filter((c: Citation) => c.verification_status === 'flagged').length;
      const failed = allCitations.filter((c: Citation) =>
        c.verification_status === 'failed' || c.verification_status === 'not_found'
      ).length;

      const courtlistenerCitations = allCitations.filter((c: Citation) => c.source === 'courtlistener');
      const pacerCitations = allCitations.filter((c: Citation) => c.source === 'pacer');

      const courtlistenerSuccess = courtlistenerCitations.length > 0
        ? (courtlistenerCitations.filter((c: Citation) => c.verification_status === 'verified').length / courtlistenerCitations.length) * 100
        : 0;
      const pacerSuccess = pacerCitations.length > 0
        ? (pacerCitations.filter((c: Citation) => c.verification_status === 'verified').length / pacerCitations.length) * 100
        : 0;

      setStats({
        total_citations: total,
        verified_count: verified,
        flagged_count: flagged,
        failed_count: failed,
        courtlistener_success_rate: parseFloat(courtlistenerSuccess.toFixed(1)),
        pacer_success_rate: parseFloat(pacerSuccess.toFixed(1))
      });
    } catch (err) {
      console.error('Error fetching citation stats:', err);
      setError('Failed to load citation statistics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-teal-500" />
            Citation Verification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse"><div className="h-32 bg-gray-100 rounded" /></div>
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-teal-500" />
            Citation Verification
          </CardTitle>
        </CardHeader>
        <CardContent><p className="text-red-500">{error || 'No data available'}</p></CardContent>
      </Card>
    );
  }

  const verifiedPercent = stats.total_citations > 0 ? (stats.verified_count / stats.total_citations) * 100 : 0;
  const flaggedPercent = stats.total_citations > 0 ? (stats.flagged_count / stats.total_citations) * 100 : 0;
  const failedPercent = stats.total_citations > 0 ? (stats.failed_count / stats.total_citations) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-teal-500" />
          Citation Verification (Last 30 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-slate-900">{stats.total_citations}</div>
          <div className="text-sm text-gray-500">Total Citations Verified</div>
        </div>

        <div className="relative h-32 mb-4">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="20"
              strokeDasharray={`${verifiedPercent * 2.51} ${251 - verifiedPercent * 2.51}`}
              transform="rotate(-90 50 50)" />
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f59e0b" strokeWidth="20"
              strokeDasharray={`${flaggedPercent * 2.51} ${251 - flaggedPercent * 2.51}`}
              strokeDashoffset={`${-verifiedPercent * 2.51}`}
              transform="rotate(-90 50 50)" />
            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="20"
              strokeDasharray={`${failedPercent * 2.51} ${251 - failedPercent * 2.51}`}
              strokeDashoffset={`${-(verifiedPercent + flaggedPercent) * 2.51}`}
              transform="rotate(-90 50 50)" />
          </svg>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="flex items-center justify-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">{stats.verified_count}</span>
            </div>
            <div className="text-xs text-gray-500">Verified</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="font-medium">{stats.flagged_count}</span>
            </div>
            <div className="text-xs text-gray-500">Flagged</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="font-medium">{stats.failed_count}</span>
            </div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">CourtListener Success</span>
            <span className="font-medium">{stats.courtlistener_success_rate}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">PACER Success</span>
            <span className="font-medium">{stats.pacer_success_rate}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
