'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact } from '@/mcp/utils/postgres-inspector';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  '¿Qué pasa si borro la columna customer_id de orders?',
  '¿Quién depende de la columna email de users?',
  'Muéstrame las tablas de la base de datos',
];

export interface ChatPanelProps {
  onResult: (graph: GraphDefinition | null, impact: DdlImpact | null) => void;
}

export function ChatPanel({ onResult }: ChatPanelProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text?: string): Promise<void> {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as {
        reply?: string;
        graph?: GraphDefinition | null;
        impact?: DdlImpact | null;
        error?: string;
      };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Error al responder');
      }

      setMessages([...next, { role: 'assistant', content: data.reply ?? '' }]);
      onResult(data.graph ?? null, data.impact ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <Sparkles className="h-4 w-4 text-orange-600" />
              Pregúntame sobre tu base de datos
            </div>
            <p className="text-xs leading-relaxed text-stone-500">
              Escribe en lenguaje natural, por ejemplo:
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
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
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
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
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            placeholder="Escribe tu pregunta…"
            className="flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white transition hover:bg-orange-700 disabled:bg-stone-300"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
