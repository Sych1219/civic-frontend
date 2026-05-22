'use client';

import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Loader2, MapPin, X, Car, Camera, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact, ChatResponse, TaxiArtifactData, CameraArtifactData, SSEEvent } from '@/types/api';

interface ThinkingStep {
  tool: string;
  status: 'running' | 'done';
  output?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: ChatResponse;
  thinkingSteps?: ThinkingStep[];
  sessionTitle?: string;
}

interface ChatPanelProps {
  onDataReceived: (data: ChatResponse) => void;
  backendUrl?: string;
  sessionId?: string;
}

const QUICK_SUGGESTIONS = [
  'How many taxis in Punggol?',
  'Is CTE jammed?',
  'Show all cameras',
  'Taxis near Orchard Road',
];

function getLoadingMessage(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('taxi')) return 'Fetching taxi data…';
  if (q.includes('camera') || q.includes('cctv')) return 'Loading camera feeds…';
  if (q.includes('traffic') || q.includes('jam') || q.includes('congestion') || q.includes('cte') || q.includes('expressway')) return 'Checking traffic conditions…';
  return 'Searching…';
}

export default function ChatPanel({
  onDataReceived,
  backendUrl = 'http://localhost:8000/api/v1/chat',
  sessionId = 'default',
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I can help you query Singapore\'s public data — taxi availability, traffic cameras, road conditions, and more. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Searching…');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      thinkingSteps: [],
    };

    setMessages(prev => [...prev, userMessage, assistantPlaceholder]);
    setInput('');
    setIsLoading(true);
    setLoadingMessage(getLoadingMessage(trimmed));

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, session_id: sessionId }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('text/event-stream')) {
        // SSE streaming mode
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let collectedAnswer = '';
        let collectedArtifacts: ChatResponse['artifacts'] = [];
        let activeThinkingStep: ThinkingStep | null = null;

        const updateAssistant = (updater: (msg: Message) => Message) => {
          setMessages(prev => prev.map(m => m.id === assistantId ? updater(m) : m));
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let event: SSEEvent;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (event.type === 'tool_start') {
              activeThinkingStep = { tool: event.tool, status: 'running' };
              updateAssistant(m => ({
                ...m,
                thinkingSteps: [...(m.thinkingSteps ?? []), activeThinkingStep!],
              }));
            } else if (event.type === 'tool_end') {
              updateAssistant(m => ({
                ...m,
                thinkingSteps: (m.thinkingSteps ?? []).map(s =>
                  s.tool === event.tool && s.status === 'running'
                    ? { ...s, status: 'done', output: event.output }
                    : s
                ),
              }));
              activeThinkingStep = null;
            } else if (event.type === 'token') {
              collectedAnswer += event.content;
              updateAssistant(m => ({ ...m, content: collectedAnswer }));
            } else if (event.type === 'done') {
              collectedAnswer = event.answer;
              // Lazy-load full artifact data by artifact_id
              const sessionsBase = new URL(backendUrl).origin + '/api/sessions';
              const fetched = await Promise.all(
                event.artifacts
                  .filter(a => a.artifact_id)
                  .map(a =>
                    fetch(`${sessionsBase}/${sessionId}/artifacts/${a.artifact_id}`)
                      .then(r => r.ok ? r.json() : null)
                      .then(data => data ? { type: a.type as Artifact['type'], data } : null)
                      .catch(() => null)
                  )
              );
              collectedArtifacts = fetched.filter((a): a is Artifact => a !== null);
              const chatResponse: ChatResponse = {
                answer: event.answer,
                artifacts: collectedArtifacts,
              };
              updateAssistant(m => ({ ...m, content: collectedAnswer, data: chatResponse }));
              onDataReceived(chatResponse);
            } else if (event.type === 'title') {
              updateAssistant(m => ({ ...m, sessionTitle: event.title }));
            } else if (event.type === 'error') {
              updateAssistant(m => ({
                ...m,
                content: `Sorry, something went wrong: ${event.error}`,
              }));
            }
          }
        }
      } else {
        // Fallback: plain JSON response
        const data: ChatResponse = await response.json();
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: data.answer, data } : m
        ));
        onDataReceived(data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Sorry, I couldn't fetch the data. ${error instanceof Error ? error.message : 'Please try again.'}` }
          : m
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const renderThinkingSteps = (steps: ThinkingStep[]) => {
    if (steps.length === 0) return null;
    return (
      <div className="mb-2 space-y-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
            <Wrench className="w-3 h-3 flex-shrink-0" />
            <span className={step.status === 'running' ? 'animate-pulse' : ''}>
              {step.status === 'running' ? `Calling ${step.tool}…` : `${step.tool} ✓`}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderMessageBadge = (message: Message) => {
    const artifacts = message.data?.artifacts ?? [];
    if (artifacts.length === 0) return null;

    const badges = artifacts.flatMap((artifact, i) => {
      if (artifact.type === 'taxi_data') {
        const raw = (artifact.data as TaxiArtifactData).raw;
        if (raw?.type === 'spatial_query') return [
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium">
            <Car className="w-3 h-3" />
            {raw.taxi_count} taxis · {raw.context?.zone_name ?? raw.context?.type ?? 'area'}
          </span>,
        ];
        if (raw?.type === 'timeline') return [
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
            <Car className="w-3 h-3" />
            {raw.snapshots.length} snapshots · {raw.context?.zone_name ?? raw.context?.type ?? 'area'}
          </span>,
        ];
      }
      if (artifact.type === 'traffic_cameras') return [
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-medium">
          <Camera className="w-3 h-3" />
          {(artifact.data as CameraArtifactData).cameras?.length ?? 0} cameras
        </span>,
      ];
      return [];
    });

    if (badges.length === 0) return null;
    return (
      <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-1.5">
        {badges}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500 rounded-lg">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Civic Assistant</h2>
            <p className="text-sm text-slate-500">Singapore public APIs for officer decision support</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-900 rounded-bl-sm'
              }`}
            >
              {message.role === 'assistant' && renderThinkingSteps(message.thinkingSteps ?? [])}
              <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-headings:my-1.5 prose-strong:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4">
                {message.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                ) : message.role === 'assistant' && isLoading ? (
                  <span className="text-slate-400 animate-pulse">Thinking…</span>
                ) : null}
              </div>
              <p suppressHydrationWarning className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
                {message.timestamp.toLocaleTimeString()}
              </p>
              {renderMessageBadge(message)}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-500">{loadingMessage}</span>
                <button
                  onClick={handleCancel}
                  className="ml-1 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                  aria-label="Cancel request"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-t border-slate-200">
        <form onSubmit={handleSubmit} className="flex space-x-3">
          <input
            id="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Singapore public data…"
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <SendHorizontal className="w-5 h-5" />}
          </button>
        </form>

        {!input.trim() && !isLoading && (
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => sendMessage(suggestion)}
                className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-transparent text-slate-700 rounded-lg transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
