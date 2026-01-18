'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Send, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RevisionRequest {
  id: string;
  feedback: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface RevisionRequestPanelProps {
  orderId: string;
  orderStatus: string;
}

export function RevisionRequestPanel({ orderId, orderStatus }: RevisionRequestPanelProps) {
  const [requests, setRequests] = useState<RevisionRequest[]>([]);
  const [canRequest, setCanRequest] = useState(false);
  const [revisionsUsed, setRevisionsUsed] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadRevisionStatus();
  }, [orderId]);

  const loadRevisionStatus = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/revision-request`);
      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests || []);
        setCanRequest(data.canRequestRevision);
        setRevisionsUsed(data.revisionsUsed);
      }
    } catch (error) {
      console.error('Failed to load revision status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitRevisionRequest = async () => {
    if (!feedback.trim() || feedback.trim().length < 10) {
      toast({
        title: 'Feedback too short',
        description: 'Please provide detailed feedback (at least 10 characters)',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/orders/${orderId}/revision-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit revision request');
      }

      toast({
        title: 'Revision request submitted',
        description: 'Our team will review your feedback and revise the motion.',
      });

      setFeedback('');
      loadRevisionStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit request',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: RevisionRequest['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-amber-600 border-amber-600"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />In Progress</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="text-red-600 border-red-600"><AlertCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return null;
    }
  };

  // Only show for delivered orders
  if (orderStatus !== 'draft_delivered' && orderStatus !== 'revision_delivered' && orderStatus !== 'revision_requested') {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Request Revision
        </CardTitle>
        <CardDescription>
          You have {1 - revisionsUsed} revision{1 - revisionsUsed !== 1 ? 's' : ''} remaining for this order
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Previous requests */}
        {requests.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Previous Requests</h4>
            {requests.map((request) => (
              <div key={request.id} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  {getStatusBadge(request.status)}
                  <span className="text-xs text-gray-500">
                    {new Date(request.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{request.feedback}</p>
                {request.admin_response && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-gray-500 mb-1">Admin Response:</p>
                    <p className="text-sm text-gray-600">{request.admin_response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New request form */}
        {canRequest ? (
          <div className="space-y-3">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe what changes you'd like made to the motion. Be as specific as possible about sections, arguments, or formatting that need revision..."
              className="min-h-[100px]"
              disabled={isSubmitting}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {feedback.length} characters (minimum 10)
              </span>
              <Button
                onClick={submitRevisionRequest}
                disabled={isSubmitting || feedback.trim().length < 10}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Revision Request
              </Button>
            </div>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {revisionsUsed >= 1
                ? 'You have used your free revision for this order. Contact support for additional revisions.'
                : 'A revision request is currently being processed.'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
