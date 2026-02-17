'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle, Loader2, Send, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface QuickApproveButtonProps {
  orderId: string;
  orderNumber: string;
}

export function QuickApproveButton({ orderId, orderNumber }: QuickApproveButtonProps) {
  const [isApproving, setIsApproving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

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
        title: 'Motion Approved & Delivered',
        description: 'The DOCX has been generated and the client has been notified.',
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

  return (
    <Card className="bg-teal-50 border-teal-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-teal-800">
          <CheckCircle className="h-5 w-5" />
          Ready for Review
        </CardTitle>
        <CardDescription className="text-teal-700">
          Order {orderNumber} has a generated motion ready for approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-teal-700">
          Review the motion in the Claude Chat tab. When satisfied, click below to:
        </p>
        <ul className="text-sm text-teal-700 space-y-1 ml-4 list-disc">
          <li>Generate the DOCX</li>
          <li>Save as deliverable</li>
          <li>Email the client</li>
        </ul>
        <Button
          onClick={handleApprove}
          disabled={isApproving}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        >
          {isApproving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Approving & Delivering...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Approve & Deliver to Client
            </>
          )}
        </Button>
        <p className="text-xs text-teal-600 text-center">
          Need changes? Use the Claude Chat tab to revise first.
        </p>
      </CardContent>
    </Card>
  );
}
