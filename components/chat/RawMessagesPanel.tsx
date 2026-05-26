'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Clipboard, Download } from 'lucide-react';
import type { RawMessagesPayload } from '@/types/api';
import RawLLMCallCard from './RawLLMCallCard';

interface Props {
  payload: RawMessagesPayload | undefined;
  messageId: string;
}

export default function RawMessagesPanel({ payload, messageId }: Props) {
  const [open, setOpen] = useState(false);

  if (!payload) {
    return (
      <div className="mt-2 pt-2 border-t border-slate-200">
        <span className="text-xs text-slate-400 select-none">Raw Messages unavailable</span>
      </div>
    );
  }

  const totalTokens = payload.total_tokens ?? 0;
  const callCount = payload.calls.length;

  const summary = `${callCount} LLM call${callCount !== 1 ? 's' : ''} · ~${totalTokens.toLocaleString()} tokens`;

  function handleCopy() {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }

  function handleDownload() {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raw_messages_${messageId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full text-left text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded px-1 py-0.5 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
        <span className="font-medium text-slate-700">Raw Messages</span>
        <span className="text-slate-400 ml-1">{summary}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 max-h-[60vh] overflow-y-auto">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white sticky top-0 z-10">
            <span className="text-xs text-slate-500 flex-1 font-mono">{summary}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors"
              title="Copy JSON"
            >
              <Clipboard className="w-3 h-3" />
              Copy
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors"
              title="Download JSON"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          </div>
          <div className="space-y-2 p-2">
            {payload.calls.map((call, i) => (
              <RawLLMCallCard key={i} call={call} index={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
