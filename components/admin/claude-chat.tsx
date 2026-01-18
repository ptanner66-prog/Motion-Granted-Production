'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  RefreshCw,
  Copy,
  Check,
  FileText,
  Loader2,
  MessageSquare,
  Bot,
  User,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  is_motion_draft: boolean;
  sequence_number: number;
  created_at: string;
}

interface Conversation {
  id: string;
  order_id: string;
  status: string;
  generated_motion: string | null;
  created_at: string;
  updated_at: string;
}

interface ClaudeChatProps {
  orderId: string;
  orderNumber: string;
  onMotionGenerated?: (motion: string) => void;
}

export function ClaudeChat({ orderId, orderNumber, onMotionGenerated }: ClaudeChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load conversation on mount
  useEffect(() => {
    loadConversation();
  }, [orderId]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const loadConversation = async () => {
    try {
      const response = await fetch(`/api/chat?orderId=${orderId}`);
      const data = await response.json();

      if (data.conversation) {
        setConversation(data.conversation);
        setMessages(data.messages.filter((m: Message) => m.role !== 'system'));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const sendMessage = useCallback(async (messageText?: string, regenerate = false) => {
    const text = messageText || input.trim();
    if (!text && !regenerate) return;

    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');
    setInput('');

    // Add user message to UI immediately (if not regenerating without message)
    if (text && !regenerate) {
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text,
        is_motion_draft: false,
        sequence_number: messages.length + 1,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempMessage]);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          message: text || undefined,
          regenerate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.text) {
                fullContent += data.text;
                setStreamingContent(fullContent);
              }

              if (data.done) {
                // Add completed assistant message
                const assistantMessage: Message = {
                  id: data.conversationId || `assistant-${Date.now()}`,
                  role: 'assistant',
                  content: fullContent,
                  is_motion_draft: true,
                  sequence_number: messages.length + 2,
                  created_at: new Date().toISOString(),
                };

                if (regenerate) {
                  // Replace all messages for regenerate
                  setMessages([assistantMessage]);
                } else {
                  setMessages(prev => [...prev, assistantMessage]);
                }

                setStreamingContent('');
                setConversation(prev => prev ? { ...prev, generated_motion: fullContent } : null);

                if (onMotionGenerated) {
                  onMotionGenerated(fullContent);
                }
              }

              if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              // Skip non-JSON lines
            }
          }
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [input, messages.length, orderId, onMotionGenerated, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleRegenerate = () => {
    sendMessage('Please regenerate the motion, incorporating any previous feedback and improvements.', true);
  };

  const handleStartGeneration = () => {
    sendMessage('Please generate the motion based on the case information and documents provided.', true);
  };

  const copyMotion = async () => {
    const motion = conversation?.generated_motion || streamingContent;
    if (motion) {
      await navigator.clipboard.writeText(motion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copied to clipboard' });
    }
  };

  const hasMotion = conversation?.generated_motion || streamingContent;
  const displayMessages = messages.filter(m => m.role !== 'system');

  return (
    <Card className="flex flex-col h-[700px]">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Claude Chat - Order {orderNumber}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {hasMotion && (
              <Button variant="outline" size="sm" onClick={copyMotion}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? 'Copied' : 'Copy Motion'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>
        </div>
        {conversation && (
          <div className="flex gap-2 mt-2">
            <Badge variant={conversation.status === 'active' ? 'default' : 'secondary'}>
              {conversation.status}
            </Badge>
            {hasMotion && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <FileText className="h-3 w-3 mr-1" />
                Motion Generated
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 pt-0">
        {/* Messages Area */}
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          {displayMessages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No conversation yet
              </h3>
              <p className="text-gray-500 mb-4 max-w-sm">
                Start generating the motion by clicking the button below.
                Claude will use the lawyer&apos;s superprompt and the order details.
              </p>
              <Button onClick={handleStartGeneration} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Bot className="h-4 w-4 mr-2" />
                )}
                Generate Motion
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </div>
                    {message.is_motion_draft && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        Motion Draft
                      </Badge>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming content */}
              {isStreaming && streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="max-w-[85%] rounded-lg px-4 py-3 bg-gray-100 text-gray-900">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {streamingContent}
                      <span className="inline-block w-2 h-4 bg-blue-600 animate-pulse ml-1" />
                    </div>
                  </div>
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && !streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="rounded-lg px-4 py-3 bg-gray-100">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Claude is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        {(displayMessages.length > 0 || isStreaming) && (
          <div className="flex-shrink-0 pt-4 border-t">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Claude to revise the motion, clarify sections, or make specific changes..."
                className="min-h-[60px] max-h-[120px] resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="self-end"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
