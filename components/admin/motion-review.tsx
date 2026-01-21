'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, Loader2, Send, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface MotionReviewProps {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
}

export function MotionReview({ orderId, orderNumber, orderStatus }: MotionReviewProps) {
  const [motion, setMotion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    loadMotion();
  }, [orderId]);

  const loadMotion = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat?orderId=${orderId}`);
      const data = await response.json();

      if (data.conversation?.generated_motion) {
        setMotion(data.conversation.generated_motion);
      } else {
        setMotion(null);
      }
    } catch (err) {
      setError('Failed to load motion');
      console.error('Failed to load motion:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);

    try {
      const response = await fetch('/api/chat/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve motion');
      }

      toast({
        title: 'Motion Approved & Delivered!',
        description: 'PDF generated, saved as deliverable, and client notified.',
      });

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve motion',
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-white border-gray-200">
        <CardContent className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-4 text-gray-500">Loading motion...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-50 border-red-200">
        <CardContent className="p-12 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
          <p className="mt-4 text-red-700">{error}</p>
          <Button onClick={loadMotion} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!motion) {
    return (
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-gray-300" />
          <p className="mt-4 text-gray-500 font-medium">No motion generated yet</p>
          <p className="mt-2 text-sm text-gray-400">
            Use the Claude Chat tab to generate a motion for this order.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Check if already delivered
  const isDelivered = ['draft_delivered', 'completed', 'revision_delivered'].includes(orderStatus);

  return (
    <div className="space-y-4">
      {/* Approve Button - Prominent at top */}
      {!isDelivered && (
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-green-800">
              <CheckCircle className="h-5 w-5" />
              Motion Ready for Review
            </CardTitle>
            <CardDescription className="text-green-700">
              Review the motion below. When satisfied, click to approve and deliver to client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleApprove}
              disabled={isApproving}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6"
              size="lg"
            >
              {isApproving ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Generating PDF & Delivering...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5 mr-2" />
                  Approve & Deliver to Client
                </>
              )}
            </Button>
            <p className="text-xs text-green-600 text-center mt-3">
              This will generate a PDF, save it as a deliverable, and email the client.
            </p>
          </CardContent>
        </Card>
      )}

      {isDelivered && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <p className="text-blue-800 font-medium">
              This motion has been delivered to the client.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Motion Content */}
      <Card className="bg-white border-gray-200">
        <CardHeader className="border-b border-gray-200">
          <CardTitle className="text-lg flex items-center gap-2 text-navy">
            <FileText className="h-5 w-5 text-gray-400" />
            Generated Motion
          </CardTitle>
          <CardDescription>
            Order {orderNumber}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="p-6">
              <pre className="whitespace-pre-wrap font-mono text-sm text-gray-700 leading-relaxed">
                {motion}
              </pre>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
