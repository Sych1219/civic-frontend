'use client';

import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Loader2, MapPin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatResponse } from '@/types/api';
import { getTaxiData } from '@/types/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: ChatResponse;
}

interface ChatPanelProps {
  onDataReceived: (data: ChatResponse) => void;
  backendUrl?: string;
}

const QUICK_SUGGESTIONS = [
  'How many taxis in Punggol?',
  'Is CTE jammed?',
  'Show all cameras',
  'Taxis near Orchard Road',
];

export default function ChatPanel({
  onDataReceived,
  backendUrl = 'http://localhost:8000/api/v1/chat',
}: ChatPanelProps) {
  // 1. State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! Ask me about taxi availability or traffic conditions anywhere in Singapore.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 2. Side effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Event handlers
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data: ChatResponse = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
        data,
      };

      setMessages(prev => [...prev, assistantMessage]);
      onDataReceived(data);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I couldn't fetch the data. ${error instanceof Error ? error.message : 'Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  // 4. Render UI
  const renderMessageBadge = (message: Message) => {
    const taxiData = message.data ? getTaxiData(message.data) : null;
    const artifact = message.data?.artifacts?.[0];

    if (taxiData?.type === 'spatial_query') return (
      <div className="mt-2 pt-2 border-t border-slate-200">
        <span className="text-xs text-slate-500">
          {taxiData.taxi_count} taxis · {taxiData.context?.zone_name ?? taxiData.context?.type ?? 'area'}
        </span>
      </div>
    );
    if (taxiData?.type === 'timeline') return (
      <div className="mt-2 pt-2 border-t border-slate-200">
        <span className="text-xs text-slate-500">
          {taxiData.snapshots.length} snapshots · {taxiData.context?.zone_name ?? taxiData.context?.type ?? 'area'}
        </span>
      </div>
    );
    if (artifact?.type === 'traffic_cameras') return (
      <div className="mt-2 pt-2 border-t border-slate-200">
        <span className="text-xs text-slate-500">
          {(artifact.data as { cameras: unknown[] }).cameras?.length ?? 0} cameras
        </span>
      </div>
    );
    return null;
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
            <p className="text-sm text-slate-500">Ask about taxis or traffic cameras</p>
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
              <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-headings:my-1.5 prose-strong:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              </div>
              <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
                {message.timestamp.toLocaleTimeString()}
              </p>
              {renderMessageBadge(message)}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                <span className="text-sm text-slate-500">Thinking...</span>
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
            placeholder="Ask about taxis or traffic cameras…"
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

        {/* Quick suggestions */}
        {messages.length === 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
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
