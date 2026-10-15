'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw } from 'lucide-react';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, SchemaMetadata } from '@/mcp/utils/postgres-inspector';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTION_POOL: string[] = [
  '¿Qué pasa si borro la columna customer_id de orders?',
  '¿Quién depende de la columna email de users?',
  '¿Qué se rompe si elimino la tabla products?',
  '¿Qué pasa si renombro price en products?',
  '¿Qué depende de la tabla customers?',
  '¿Qué pasa si borro product_id de order_items?',
  '¿Qué se rompe si elimino la tabla orders?',
];

function pickSuggestions(count: number): string[] {
  return [...SUGGESTION_POOL].sort(() => Math.random() - 0.5).slice(0, count);
}

export interface ChatPanelProps {
  onResult: (graph: GraphDefinition | null, impact: DdlImpact | null) => void;
  schema?: SchemaMetadata | null;
  onStart?: () => void;
  expanded?: boolean;
  hideTitle?: boolean;
}

export function ChatPanel({
  onResult,
  schema = null,
  onStart,
  expanded = false,
  hideTitle = false,
}: ChatPanelProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(() => pickSuggestions(3));
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function send(text?: string): Promise<void> {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const isFirst = messages.length === 0;
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);
    setSuggestions(pickSuggestions(3));
    if (isFirst && onStart) onStart();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, schema }),
      });
      const data = (await res.json()) as {
        reply?: string;
        graph?: GraphDefinition | null;
        impact?: DdlImpact | null;
        error?: string;
      };

      if (data.error) {
        throw new Error(data.error);
      }

      setMessages([...next, { role: 'assistant', content: data.reply ?? 'No obtuve respuesta.' }]);
      onResult(data.graph ?? null, data.impact ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function clearChat(): void {
    setMessages([]);
    setError(null);
    setSuggestions(pickSuggestions(3));
    onResult(null, null);
  }

  return (
    <div className={expanded ? 'flex h-full flex-col' : 'flex flex-col'}>
      {expanded && messages.length > 0 && (
        <div className="flex justify-end px-3 pt-2">
          <button
            type="button"
            onClick={clearChat}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-400 transition hover:border-stone-300 hover:text-stone-600"
          >
            <RotateCcw className="h-3 w-3" />
            Nueva conversación
          </button>
        </div>
      )}

      <div ref={scrollRef} className={expanded ? 'flex-1 overflow-y-auto p-4' : 'p-4'}>
        {messages.length === 0 && (
          <div className="space-y-3">
            {!hideTitle && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                  Pregúntame sobre tu base de datos
                </div>
                <p className="text-xs leading-relaxed text-stone-500">
                  Escribe en lenguaje natural, por ejemplo:
                </p>
              </>
            )}
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs text-stone-600 transition hover:border-orange-300 hover:bg-orange-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-orange-600 text-white'
                    : 'border border-stone-200 bg-white text-stone-700'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-stone-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
            Pensando…
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            onWheel={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight <= el.clientHeight + 1) {
                e.preventDefault();
              }
            }}
            rows={1}
            placeholder="Escribe tu pregunta…"
            className="no-scrollbar max-h-[160px] flex-1 resize-none overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-snug text-stone-900 placeholder:text-stone-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white transition hover:bg-orange-700 disabled:bg-stone-300"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
