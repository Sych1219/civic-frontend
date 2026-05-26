import type { RawMessageBlock as RawMessageBlockType } from '@/types/api';

interface Props {
  block: RawMessageBlockType;
}

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

const ROLE_STYLES: Record<string, { header: string; label: string }> = {
  system:    { header: 'bg-purple-100 text-purple-800 border-purple-200', label: 'SYSTEM' },
  user:      { header: 'bg-blue-100 text-blue-800 border-blue-200',       label: 'USER' },
  assistant: { header: 'bg-green-100 text-green-800 border-green-200',    label: 'ASSISTANT' },
  tool:      { header: 'bg-amber-100 text-amber-800 border-amber-200',    label: 'TOOL_RESULT' },
};

export default function RawMessageBlock({ block }: Props) {
  const styles = ROLE_STYLES[block.role] ?? ROLE_STYLES.user;

  let label = styles.label;
  if (block.role === 'assistant' && block.tool_name) {
    label = `ASSISTANT (tool_use: ${block.tool_name})`;
  } else if (block.role === 'tool' && block.tool_name) {
    label = `TOOL_RESULT (${block.tool_name})`;
  }
  if (block.is_history) {
    label += ' (history)';
  }

  const isJson = block.role === 'assistant' && block.tool_name || block.role === 'tool';
  const body = isJson ? prettyJson(block.content) : block.content;

  return (
    <div className={`rounded border ${block.is_history ? 'opacity-60 border-l-4 border-l-slate-300' : ''}`}>
      <div className={`px-3 py-1 text-xs font-mono font-semibold rounded-t border-b ${styles.header}`}>
        {label}
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 bg-white rounded-b leading-relaxed max-h-[800px] overflow-y-auto">
        {body}
        {block.truncated && (
          <span className="text-slate-400"> … (truncated at 32 KB)</span>
        )}
      </pre>
    </div>
  );
}
