'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Clock, CheckCircle, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface RevisionRequest {
  id: string;
  feedback: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface AdminRevisionRequestsProps {
  orderId: string;
}

export function AdminRevisionRequests({ orderId }: AdminRevisionRequestsProps) {
  const [requests, setRequests] = useState<RevisionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminResponse, setAdminResponse] = useState('');
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    loadRequests();
  }, [orderId]);

  const loadRequests = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/revision-request`);
      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to load revision requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markInProgress = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const response = await fetch(`/api/admin/revision-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      if (response.ok) {
        toast({ title: 'Marked as in progress' });
        loadRequests();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const markComplete = async (requestId: string) => {
    if (!adminResponse.trim()) {
      toast({ title: 'Please add a response to the client', variant: 'destructive' });
      return;
    }

    setProcessingId(requestId);
    try {
      const response = await fetch(`/api/admin/revision-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          admin_response: adminResponse.trim(),
        }),
      });

      if (response.ok) {
        toast({ title: 'Revision completed and client notified' });
        setAdminResponse('');
        loadRequests();
        router.refresh();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to complete revision', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: RevisionRequest['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-amber-600 border-amber-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" />In Progress</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return null;
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'in_progress');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
          <MessageSquare className="h-5 w-5" />
          Client Revision Requests
        </CardTitle>
        <CardDescription className="text-amber-700">
          {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingRequests.map((request) => (
          <div key={request.id} className="border border-amber-200 rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              {getStatusBadge(request.status)}
              <span className="text-xs text-gray-500">
                {new Date(request.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-3">{request.feedback}</p>

            {request.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => markInProgress(request.id)}
                disabled={processingId === request.id}
                className="w-full"
              >
                {processingId === request.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Start Working on Revision
              </Button>
            )}

            {request.status === 'in_progress' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Use Claude Chat to make the revisions, then complete below:
                </p>
                <Textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  placeholder="Add a note for the client about the changes made..."
                  className="min-h-[60px] text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => markComplete(request.id)}
                  disabled={processingId === request.id || !adminResponse.trim()}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {processingId === request.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Complete & Redeliver
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
