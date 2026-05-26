'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { RawLLMCall } from '@/types/api';
import RawMessageBlock from './RawMessageBlock';

interface Props {
  call: RawLLMCall;
  index: number;
}

const PHASE_STYLES: Record<string, string> = {
  planner:     'bg-indigo-100 text-indigo-800 border-indigo-200',
  agent:       'bg-emerald-100 text-emerald-800 border-emerald-200',
  synthesizer: 'bg-amber-100 text-amber-800 border-amber-200',
  title:       'bg-slate-100 text-slate-700 border-slate-200',
};

function formatMeta(call: RawLLMCall): string {
  const parts: string[] = [call.model];
  if (call.duration_ms != null) parts.push(`${(call.duration_ms / 1000).toFixed(2)}s`);
  const tok = (call.input_tokens ?? 0) + (call.output_tokens ?? 0);
  if (tok > 0) parts.push(`~${tok.toLocaleString()} tok`);
  return parts.join(', ');
}

function formatPhaseLabel(call: RawLLMCall): string {
  if (call.phase === 'agent' && call.agent) return `${call.agent} agent`;
  if (call.phase === 'title') return 'title generator';
  return call.phase;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function RawLLMCallCard({ call, index }: Props) {
  const [open, setOpen] = useState(true);
  const headerStyle = PHASE_STYLES[call.phase] ?? PHASE_STYLES.title;
  const meta = formatMeta(call);
  const phaseLabel = formatPhaseLabel(call);
  const headerText = call.skipped_reason
    ? `Call ${index} · ${phaseLabel} (skipped)`
    : `Call ${index} · ${phaseLabel} (${meta})`;

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left font-mono font-semibold border-b ${headerStyle} hover:brightness-95 transition-all`}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        <span>{headerText}</span>
      </button>

      {open && (
        <div className="bg-slate-50 p-2 space-y-2">
          {call.skipped_reason ? (
            <p className="text-slate-400 italic px-1">{call.skipped_reason}</p>
          ) : (
            <>
              {call.messages.map((block, i) => (
                <RawMessageBlock key={i} block={block} />
              ))}

              {call.output_structured != null && (
                <div className="rounded border border-slate-200">
                  <div className="px-3 py-1 text-xs font-mono font-semibold bg-slate-100 text-slate-700 border-b rounded-t">
                    OUTPUT (structured: Plan)
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 bg-white rounded-b leading-relaxed">
                    {prettyJson(call.output_structured)}
                  </pre>
                </div>
              )}

              {call.output_structured == null && call.output != null && (
                <div className="rounded border border-slate-200">
                  <div className="px-3 py-1 text-xs font-mono font-semibold bg-slate-100 text-slate-700 border-b rounded-t">
                    OUTPUT
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 bg-white rounded-b leading-relaxed">
                    {call.output}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
