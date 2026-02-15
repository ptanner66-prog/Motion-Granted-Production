'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Clock, DollarSign, FileText, Zap, Scale, Shield, Info } from 'lucide-react';

interface MotionType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tier: 'A' | 'B' | 'C' | 'D';
  base_price_cents: number;
  typical_turnaround_days: number;
  rush_available: boolean;
  min_turnaround_days: number;
  required_documents: string[];
  typical_page_range: { min: number; max: number };
}

interface MotionTypeSelectorProps {
  value?: string;
  onChange: (motionType: MotionType | null) => void;
  jurisdiction?: 'federal' | 'state';
  className?: string;
}

const TIER_INFO = {
  A: {
    name: 'Procedural/Administrative',
    description: 'Simple procedural motions - Extensions, Continuances, Pro Hac Vice',
    icon: FileText,
    color: 'text-gray-600 bg-gray-50 border-gray-200',
    badge: 'bg-gray-100 text-gray-700',
  },
  B: {
    name: 'Intermediate',
    description: 'Standard motions with moderate complexity - Motion to Compel, Demurrer',
    icon: Scale,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  C: {
    name: 'Complex/Dispositive',
    description: 'Complex dispositive motions - MSJ, MSA, Preliminary Injunction, TRO',
    icon: Shield,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
  },
  D: {
    name: 'Specialized/Enterprise',
    description: 'Multi-party, cross-border, or enterprise-scale motions',
    icon: Zap,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
  },
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function MotionTypeSelector({
  value,
  onChange,
  jurisdiction = 'federal',
  className,
}: MotionTypeSelectorProps) {
  const [motionTypes, setMotionTypes] = useState<MotionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<'all' | 'A' | 'B' | 'C' | 'D'>('all');

  useEffect(() => {
    async function fetchMotionTypes() {
      try {
        const response = await fetch(`/api/motion-types?jurisdiction=${jurisdiction}`);
        if (!response.ok) throw new Error('Failed to fetch motion types');

        const data = await response.json();
        setMotionTypes(data.motionTypes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load motion types');
      } finally {
        setLoading(false);
      }
    }

    fetchMotionTypes();
  }, [jurisdiction]);

  const filteredTypes = motionTypes.filter(mt => {
    const matchesSearch = searchQuery === '' ||
      mt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mt.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mt.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTier = selectedTier === 'all' || mt.tier === selectedTier;

    return matchesSearch && matchesTier;
  });

  const selectedMotionType = motionTypes.find(mt => mt.id === value);

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="h-10 bg-muted animate-pulse rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 text-center text-destructive', className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search motion types..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={selectedTier} onValueChange={(v) => setSelectedTier(v as typeof selectedTier)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="A">Tier A</TabsTrigger>
            <TabsTrigger value="B">Tier B</TabsTrigger>
            <TabsTrigger value="C">Tier C</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tier Legend */}
      <div className="flex gap-4 text-sm">
        {Object.entries(TIER_INFO).map(([tier, info]) => (
          <TooltipProvider key={tier}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <info.icon className={cn('h-4 w-4', info.color.split(' ')[0])} />
                  <span className="text-muted-foreground">{info.name}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{info.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Motion Type Grid */}
      <ScrollArea className="h-[400px] pr-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTypes.map((mt) => {
            const tierInfo = TIER_INFO[mt.tier];
            const isSelected = value === mt.id;

            return (
              <Card
                key={mt.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  isSelected && 'ring-2 ring-primary',
                  tierInfo.color
                )}
                onClick={() => onChange(isSelected ? null : mt)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge variant="outline" className={tierInfo.badge}>
                        {mt.code}
                      </Badge>
                    </div>
                    <tierInfo.icon className={cn('h-5 w-5', tierInfo.color.split(' ')[0])} />
                  </div>
                  <CardTitle className="text-base">{mt.name}</CardTitle>
                  {mt.description && (
                    <CardDescription className="text-xs line-clamp-2">
                      {mt.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      <span>{formatPrice(mt.base_price_cents)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{mt.typical_turnaround_days} days</span>
                    </div>
                    {mt.rush_available && (
                      <div className="flex items-center gap-1 text-orange-600">
                        <Zap className="h-3 w-3" />
                        <span>Rush</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredTypes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No motion types found matching your criteria
          </div>
        )}
      </ScrollArea>

      {/* Selected Motion Type Details */}
      {selectedMotionType && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Selected: {selectedMotionType.name}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Base Price</div>
                <div className="font-medium">{formatPrice(selectedMotionType.base_price_cents)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Turnaround</div>
                <div className="font-medium">{selectedMotionType.typical_turnaround_days} days</div>
              </div>
              <div>
                <div className="text-muted-foreground">Rush Available</div>
                <div className="font-medium">
                  {selectedMotionType.rush_available
                    ? `Yes (${selectedMotionType.min_turnaround_days} days min)`
                    : 'No'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Typical Length</div>
                <div className="font-medium">
                  {selectedMotionType.typical_page_range.min}-{selectedMotionType.typical_page_range.max} pages
                </div>
              </div>
            </div>

            {selectedMotionType.required_documents && selectedMotionType.required_documents.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  Required Documents
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedMotionType.required_documents.map((doc, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {doc.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default MotionTypeSelector;
