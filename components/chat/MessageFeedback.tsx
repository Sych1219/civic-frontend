'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import type { MessageFeedback as MessageFeedbackData, FeedbackRequest, FeedbackResponse } from '@/types/api';

type FeedbackState =
  | 'idle'
  | 'awaiting_comment'
  | 'submitting'
  | 'submitted_up'
  | 'submitted_down';

interface MessageFeedbackProps {
  sessionId: string;
  msgIndex: number;
  backendBase: string;
  initialFeedback?: MessageFeedbackData | null;
}

function initialState(feedback?: MessageFeedbackData | null): FeedbackState {
  if (!feedback) return 'idle';
  return feedback.rating === 'up' ? 'submitted_up' : 'submitted_down';
}

export default function MessageFeedback({
  sessionId,
  msgIndex,
  backendBase,
  initialFeedback,
}: MessageFeedbackProps) {
  const [state, setState] = useState<FeedbackState>(initialState(initialFeedback));
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  async function submitFeedback(payload: FeedbackRequest, next: FeedbackState) {
    setState('submitting');
    try {
      const res = await fetch(
        `${backendBase}/${sessionId}/messages/${msgIndex}/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      await res.json() as FeedbackResponse;
      setState(next);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '提交失败，请重试');
      setState('idle');
      setTimeout(() => setToast(null), 3000);
    }
  }

  const isSubmitting = state === 'submitting';

  return (
    <div className="mt-2 flex flex-col gap-1">
      {toast && (
        <p className="text-xs text-red-500">{toast}</p>
      )}

      <div className="flex items-center gap-1">
        {/* 👍 button */}
        <button
          type="button"
          disabled={isSubmitting || state === 'submitted_up' || state === 'submitted_down' || state === 'awaiting_comment'}
          onClick={() => submitFeedback({ rating: 'up' }, 'submitted_up')}
          className={`p-1 rounded transition-colors ${
            state === 'submitted_up'
              ? 'text-blue-500'
              : 'text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
          aria-label="有帮助"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ThumbsUp className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 👎 button */}
        <button
          type="button"
          disabled={isSubmitting || state === 'submitted_up' || state === 'submitted_down'}
          onClick={() => {
            if (state === 'idle') setState('awaiting_comment');
          }}
          className={`p-1 rounded transition-colors ${
            state === 'submitted_down'
              ? 'text-red-500'
              : state === 'awaiting_comment'
              ? 'text-red-400'
              : 'text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
          aria-label="没有帮助"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ThumbsDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {state === 'awaiting_comment' && (
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="告诉我哪里不对（可选）"
            disabled={isSubmitting}
            className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-50"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() =>
                submitFeedback(
                  { rating: 'down', comment: comment.trim() || null },
                  'submitted_down'
                )
              }
              className="text-xs px-2.5 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
              提交
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setState('idle')}
              className="text-xs px-2.5 py-1 text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
