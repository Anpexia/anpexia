/**
 * Logger estruturado (JSON em linha única) para facilitar busca nos logs do
 * Railway. Cada evento carrega timestamp, nível e campos arbitrários.
 */
type Fields = Record<string, unknown>;

function emit(stream: 'log' | 'warn' | 'error', level: string, event: string, fields?: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(fields || {}) });
  // eslint-disable-next-line no-console
  console[stream](line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit('log', 'info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', 'warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', 'error', event, fields),
};

/** Extrai detalhes seguros de uma exceção para log (mensagem completa + stack). */
export function describeError(err: unknown): { name: string; message: string; code?: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      code: (err as any).code,
      stack: err.stack,
    };
  }
  return { name: 'NonError', message: String(err) };
}
