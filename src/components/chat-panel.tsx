'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Network, RotateCcw } from 'lucide-react';
import { TypingText } from '@/components/typing-text';
import { Spinner } from '@/components/spinner';
import { Markdown } from '@/components/markdown';
import { DatabaseBadge } from '@/components/database-badge';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';
import type { DdlImpact, SchemaMetadata } from '@/mcp/utils/postgres-inspector';
import { apiPath } from '@/lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTION_POOL: string[] = [
  // Impacto al borrar columnas
  '¿Qué pasa si borro la columna cliente_id de pedidos?',
  '¿Qué se rompe si elimino la columna email de clientes?',
  '¿Qué impacto tiene borrar producto_id de detalle_pedido?',
  '¿Qué ocurre si elimino la columna categoria_id de productos?',
  '¿Qué pasa si borro empleado_id de pedidos?',
  '¿Qué se rompe si elimino la columna pedido_id de pagos?',
  '¿Qué impacto tiene borrar precio de productos?',
  '¿Y si elimino la columna id de pedidos?',
  '¿Qué pasa si borro fecha_registro de clientes?',
  '¿Qué se rompe si elimino la columna cantidad de inventario?',
  '¿Qué impacto tiene borrar puntuacion de resenas?',
  '¿Y si elimino proveedor_id de productos?',

  // Impacto al eliminar tablas
  '¿Qué se rompe si elimino la tabla productos?',
  '¿Qué pasa si elimino la tabla pedidos?',
  '¿Qué impacto tiene borrar la tabla clientes?',
  '¿Qué se rompe si elimino la tabla empleados?',
  '¿Y si elimino la tabla categorias?',
  '¿Qué pasa si borro la tabla pagos?',
  '¿Qué ocurre si elimino la tabla detalle_pedido?',
  '¿Qué impacto tiene borrar la tabla inventario?',

  // Renombrar columnas
  '¿Qué pasa si renombro precio en productos?',
  '¿Qué impacto tiene renombrar email en clientes?',
  '¿Y si renombro total en pedidos?',
  '¿Qué se rompe si renombro cliente_id en pedidos?',
  '¿Qué pasa si renombro nombre en categorias?',

  // Dependencias (linaje)
  '¿Quién depende de la columna email de clientes?',
  '¿Qué depende de la tabla clientes?',
  '¿Quién usa la columna cliente_id de pedidos?',
  '¿Qué objetos dependen de la columna categoria_id de productos?',
  '¿Qué vistas dependen de la tabla pedidos?',
  '¿Qué depende de la columna producto_id de detalle_pedido?',
  '¿Quién usa la columna pedido_id de envios?',

  // Esquema
  '¿Qué tablas hay en la base de datos?',
  '¿Qué columnas tiene la tabla pedidos?',
  '¿Cuántas vistas hay en el esquema?',
  '¿Qué funciones están definidas?',
  '¿Qué tablas tienen claves foráneas?',
];

function pickSuggestions(pool: string[], count: number): string[] {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

export interface ChatPanelProps {
  onResult: (graph: GraphDefinition | null, impact: DdlImpact | null) => void;
  schema?: SchemaMetadata | null;
  onStart?: () => void;
  expanded?: boolean;
  hideTitle?: boolean;
  suggestions?: string[];
  databaseLabel?: string;
}

export function ChatPanel({
  onResult,
  schema = null,
  onStart,
  expanded = false,
  hideTitle = false,
  suggestions: suggestionSource,
  databaseLabel,
}: ChatPanelProps): JSX.Element {
  const pool = suggestionSource && suggestionSource.length > 0 ? suggestionSource : SUGGESTION_POOL;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(() => pickSuggestions(pool, 3));
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    setSuggestions(pickSuggestions(pool, 3));
  }, [pool]);

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
    setSuggestions(pickSuggestions(pool, 3));
    if (isFirst && onStart) onStart();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(apiPath('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, schema }),
        signal: controller.signal,
      });
      const data = (await res.json()) as {
        reply?: string;
        graph?: GraphDefinition | null;
        impact?: DdlImpact | null;
        error?: string;
      };

      if (controller.signal.aborted) return;

      if (data.error) {
        throw new Error(data.error);
      }

      setMessages([...next, { role: 'assistant', content: data.reply ?? 'No obtuve respuesta.' }]);
      onResult(data.graph ?? null, data.impact ?? null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }

  function clearChat(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
    setLoading(false);
    setSuggestions(pickSuggestions(pool, 3));
    onResult(null, null);
  }

  return (
    <div className={expanded ? 'flex h-full flex-col' : 'flex flex-col'}>
      {expanded && (
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <DatabaseBadge label={databaseLabel ?? 'Base de datos'} />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              title="Nueva conversación"
              aria-label="Nueva conversación"
              className="group flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-night-500 dark:hover:bg-night-700 dark:hover:text-night-100"
            >
              <RotateCcw className="h-[15px] w-[15px] transition-transform duration-500 ease-out group-hover:-rotate-180" />
            </button>
          )}
        </div>
      )}

      <div ref={scrollRef} className={expanded ? 'flex-1 overflow-y-auto p-4' : 'p-4'}>
        {messages.length === 0 && (
          <div className="space-y-3">
            {!hideTitle && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-night-100">
                  <Network className="h-4 w-4 text-orange-600" />
                  Pregúntame sobre tu base de datos
                </div>
                <p className="text-xs leading-relaxed text-stone-500 dark:text-night-400">
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
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs text-stone-600 transition hover:border-orange-300 hover:bg-orange-50 dark:border-night-700 dark:bg-night-800 dark:text-night-300 dark:hover:bg-night-700"
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
                      : 'border border-stone-200 bg-white text-stone-700 dark:border-night-700 dark:bg-night-800 dark:text-night-200'
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
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 p-3 dark:border-night-700">
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
            className="no-scrollbar max-h-[160px] flex-1 resize-none overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-snug text-stone-900 placeholder:text-stone-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-night-700 dark:bg-night-800 dark:text-night-100 dark:placeholder:text-night-500 dark:focus:bg-night-800"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white transition hover:bg-stone-700 disabled:bg-stone-300 dark:bg-night-100 dark:text-night-900 dark:hover:bg-white dark:disabled:bg-night-700"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
