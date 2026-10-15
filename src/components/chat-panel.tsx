'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Network, RotateCcw } from 'lucide-react';
import { TypingText } from '@/components/typing-text';
import { Spinner } from '@/components/spinner';
import { Markdown } from '@/components/markdown';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, SchemaMetadata } from '@/mcp/utils/postgres-inspector';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTION_POOL: string[] = [
  // Impacto al borrar columnas
  '¿Qué pasa si borro la columna customer_id de orders?',
  '¿Qué se rompe si elimino la columna email de users?',
  '¿Qué impacto tiene borrar product_id de order_items?',
  '¿Qué ocurre si elimino la columna category_id de products?',
  '¿Qué pasa si borro organization_id de users?',
  '¿Qué se rompe si elimino la columna order_id de payments?',
  '¿Qué impacto tiene borrar price de products?',
  '¿Y si elimino la columna id de orders?',
  '¿Qué pasa si borro created_at de customers?',
  '¿Qué se rompe si elimino la columna quantity de inventory?',
  '¿Qué impacto tiene borrar rating de reviews?',
  '¿Y si elimino performed_by de audit_logs?',

  // Impacto al eliminar tablas
  '¿Qué se rompe si elimino la tabla products?',
  '¿Qué pasa si elimino la tabla orders?',
  '¿Qué impacto tiene borrar la tabla customers?',
  '¿Qué se rompe si elimino la tabla users?',
  '¿Y si elimino la tabla categories?',
  '¿Qué pasa si borro la tabla payments?',
  '¿Qué ocurre si elimino la tabla order_items?',
  '¿Qué impacto tiene borrar la tabla inventory?',

  // Renombrar columnas
  '¿Qué pasa si renombro price en products?',
  '¿Qué impacto tiene renombrar email en users?',
  '¿Y si renombro total_amount en orders?',
  '¿Qué se rompe si renombro customer_id en orders?',
  '¿Qué pasa si renombro name en categories?',

  // Dependencias (linaje)
  '¿Quién depende de la columna email de users?',
  '¿Qué depende de la tabla customers?',
  '¿Quién usa la columna customer_id de orders?',
  '¿Qué objetos dependen de la columna category_id de products?',
  '¿Qué vistas dependen de la tabla orders?',
  '¿Qué depende de la columna product_id de order_items?',
  '¿Quién usa la columna order_id de shipments?',

  // Esquema
  '¿Qué tablas hay en la base de datos?',
  '¿Qué columnas tiene la tabla orders?',
  '¿Cuántas vistas hay en el esquema?',
  '¿Qué funciones están definidas?',
  '¿Qué tablas tienen claves foráneas?',
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent): void => {
      if (el.scrollHeight <= el.clientHeight + 2) {
        event.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-400 transition hover:border-stone-300 hover:text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-200"
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
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
                  <Network className="h-4 w-4 text-orange-600" />
                  Pregúntame sobre tu base de datos
                </div>
                <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">
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
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs text-stone-600 transition hover:border-orange-300 hover:bg-orange-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const isUser = m.role === 'user';
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] break-words rounded-xl px-3 py-2 text-sm ${
                    isUser
                      ? 'whitespace-pre-wrap bg-orange-600 text-white'
                      : 'border border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'
                  }`}
                >
                  {isUser ? (
                    m.content
                  ) : isLast ? (
                    <TypingText text={m.content} render={(t) => <Markdown text={t} />} />
                  ) : (
                    <Markdown text={m.content} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-stone-400">
            <Spinner />
            Pensando…
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 p-3 dark:border-stone-700">
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
            rows={1}
            placeholder="Escribe tu pregunta…"
            className="no-scrollbar max-h-[160px] flex-1 resize-none overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-snug text-stone-900 placeholder:text-stone-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:bg-stone-800"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white transition hover:bg-stone-700 disabled:bg-stone-300"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
