export interface JsonFormatResult {
  ok: true;
  content: string;
  changed: boolean;
}

export interface JsonFormatError {
  ok: false;
  message: string;
}

export type JsonFormatOutcome = JsonFormatResult | JsonFormatError;

/** Pretty-print JSON with stable 2-space indent. */
export function formatJsonDocument(raw: string, space = 2): JsonFormatOutcome {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) {
    return { ok: true, content: '\n', changed: raw !== '\n' };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const pretty = `${JSON.stringify(parsed, null, space)}\n`;
    return {
      ok: true,
      content: pretty,
      changed: pretty !== raw.replace(/\r\n/g, '\n'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // JSON.parse messages like: Unexpected token } in JSON at position 12
    return {
      ok: false,
      message: msg.replace(/^JSON\.parse:\s*/i, ''),
    };
  }
}

/** Minify JSON to a single line. */
export function minifyJsonDocument(raw: string): JsonFormatOutcome {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) {
    return { ok: true, content: '\n', changed: raw !== '\n' };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const mini = `${JSON.stringify(parsed)}\n`;
    return {
      ok: true,
      content: mini,
      changed: mini !== raw.replace(/\r\n/g, '\n'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: msg.replace(/^JSON\.parse:\s*/i, ''),
    };
  }
}
