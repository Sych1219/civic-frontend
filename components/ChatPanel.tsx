'use client';

import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Loader2, MapPin } from 'lucide-react';
import type { TaxiDataResponse } from '@/types/taxi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: TaxiDataResponse;
}

interface ChatPanelProps {
  onDataReceived: (data: TaxiDataResponse) => void;
  backendUrl?: string;
}

export default function ChatPanel({ 
  onDataReceived, 
  backendUrl = 'http://localhost:8000/api/query' 
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I can help you check taxi availability in Singapore. Try asking "What\'s the current taxi status?" or "Show me available taxis".',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(`session-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.content,
          session_id: sessionId,
          context: {}
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: TaxiDataResponse = await response.json();

      // Create assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateResponseMessage(data),
        timestamp: new Date(),
        data: data
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Send data to map
      if (data.status === 'success') {
        onDataReceived(data);
      }

    } catch (error) {
      console.error('Error querying backend:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I couldn't fetch the data. ${error instanceof Error ? error.message : 'Please try again.'}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateResponseMessage = (data: TaxiDataResponse): string => {
    if (data.status !== 'success') {
      return 'Unable to retrieve taxi data at the moment.';
    }

    const taxiCount = data.data.geojson.features[0]?.properties?.taxi_count || 0;
    const timestamp = data.data.geojson.features[0]?.properties?.timestamp;
    
    return `Found ${taxiCount.toLocaleString()} available taxis in Singapore. ${timestamp ? `Data updated at ${new Date(timestamp).toLocaleTimeString()}.` : ''} The map has been updated to show their locations.`;
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
            <h2 className="text-lg font-semibold text-slate-900">Taxi Assistant</h2>
            <p className="text-sm text-slate-500">Ask about taxi availability</p>
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
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              <p
                className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString()}
              </p>
              {message.data && message.data.status === 'success' && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <MapPin className="w-3 h-3" />
                    <span>
                      {message.data.data.geojson.features[0]?.properties?.taxi_count || 0} taxis
                    </span>
                  </div>
                </div>
              )}
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about taxi availability..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <SendHorizontal className="w-5 h-5" />
            )}
          </button>
        </form>

        {/* Quick suggestions */}
        {messages.length === 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setInput("What's the current taxi status?")}
              className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Current status
            </button>
            <button
              onClick={() => setInput("Show me available taxis")}
              className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Show taxis
            </button>
            <button
              onClick={() => setInput("How many taxis are available?")}
              className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Taxi count
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
