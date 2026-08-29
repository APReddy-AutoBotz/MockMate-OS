const CAPTURE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const CAPTURE_TOKEN = /\{\{capture:([A-Za-z][A-Za-z0-9_.-]{0,63})\}\}/g;
const FULL_CAPTURE_TOKEN = /^\{\{capture:([A-Za-z][A-Za-z0-9_.-]{0,63})\}\}$/;
const MAX_CAPTURES = 64;
const MAX_CAPTURES_PER_SCENARIO = 8;
const MAX_CAPTURE_STRING_BYTES = 512;
const MAX_PATTERN_LENGTH = 256;
const MAX_POINTER_LENGTH = 256;
const MAX_RESOLUTION_DEPTH = 24;
const MAX_RESOLUTION_NODES = 4096;
const MAX_RESOLVED_STRING_BYTES = 8192;

export class CaptureAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CaptureAuthorityError';
    this.code = code;
  }
}

const refuse = (code) => {
  throw new CaptureAuthorityError(code);
};

function jsonPointerValue(document, pointer) {
  if (pointer === '') return { exists: true, value: document };
  if (typeof pointer !== 'string' || pointer.length > MAX_POINTER_LENGTH || !pointer.startsWith('/')) {
    refuse('CAPTURE_POINTER_INVALID');
  }
  let current = document;
  for (const rawPart of pointer.slice(1).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { exists: false, value: undefined };
    }
    current = current[part];
  }
  return { exists: true, value: current };
}

function validateCaptureDeclaration(declaration) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) refuse('CAPTURE_DECLARATION_INVALID');
  const keys = Object.keys(declaration);
  if (keys.some((key) => !['name', 'path', 'type', 'pattern', 'maxLength'].includes(key))) refuse('CAPTURE_DECLARATION_INVALID');
  const { name, path, type, pattern, maxLength } = declaration;
  if (typeof name !== 'string' || !CAPTURE_NAME.test(name)) refuse('CAPTURE_NAME_INVALID');
  if (typeof path !== 'string' || path.length > MAX_POINTER_LENGTH || (path !== '' && !path.startsWith('/'))) refuse('CAPTURE_POINTER_INVALID');
  if (type !== undefined && !['string', 'number', 'boolean'].includes(type)) refuse('CAPTURE_TYPE_INVALID');
  if (pattern !== undefined) {
    if (type !== 'string' || typeof pattern !== 'string' || !pattern || pattern.length > MAX_PATTERN_LENGTH) refuse('CAPTURE_PATTERN_INVALID');
    try { new RegExp(pattern); } catch { refuse('CAPTURE_PATTERN_INVALID'); }
  }
  if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > MAX_CAPTURE_STRING_BYTES)) {
    refuse('CAPTURE_MAX_LENGTH_INVALID');
  }
  if (maxLength !== undefined && type !== 'string') refuse('CAPTURE_MAX_LENGTH_INVALID');
  return declaration;
}

function validateCapturedScalar(value, declaration) {
  if (value === null || ['object', 'undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) refuse('CAPTURE_VALUE_NOT_SCALAR');
  if (!['string', 'number', 'boolean'].includes(typeof value)) refuse('CAPTURE_VALUE_NOT_SCALAR');
  if (declaration.type && typeof value !== declaration.type) refuse('CAPTURE_VALUE_TYPE_MISMATCH');
  if (typeof value === 'number' && !Number.isFinite(value)) refuse('CAPTURE_VALUE_INVALID_NUMBER');
  if (typeof value === 'string') {
    const maxLength = declaration.maxLength ?? MAX_CAPTURE_STRING_BYTES;
    if (Buffer.byteLength(value, 'utf8') > maxLength) refuse('CAPTURE_VALUE_TOO_LARGE');
    if (declaration.pattern && !new RegExp(declaration.pattern).test(value)) refuse('CAPTURE_VALUE_PATTERN_MISMATCH');
  }
  return value;
}

function resolveString(input, values) {
  if (!input.includes('{{capture:')) return input;
  const full = FULL_CAPTURE_TOKEN.exec(input);
  if (full) {
    if (!values.has(full[1])) refuse('CAPTURE_REFERENCE_UNKNOWN');
    return values.get(full[1]);
  }
  let replaced = '';
  let cursor = 0;
  CAPTURE_TOKEN.lastIndex = 0;
  for (const match of input.matchAll(CAPTURE_TOKEN)) {
    const name = match[1];
    if (!values.has(name)) refuse('CAPTURE_REFERENCE_UNKNOWN');
    replaced += input.slice(cursor, match.index) + String(values.get(name));
    cursor = match.index + match[0].length;
  }
  replaced += input.slice(cursor);
  if (replaced.includes('{{capture:')) refuse('CAPTURE_REFERENCE_MALFORMED');
  if (Buffer.byteLength(replaced, 'utf8') > MAX_RESOLVED_STRING_BYTES) refuse('CAPTURE_RESOLUTION_TOO_LARGE');
  return replaced;
}

function resolveValue(input, values, state, depth = 0) {
  if (depth > MAX_RESOLUTION_DEPTH) refuse('CAPTURE_RESOLUTION_TOO_DEEP');
  state.nodes += 1;
  if (state.nodes > MAX_RESOLUTION_NODES) refuse('CAPTURE_RESOLUTION_TOO_COMPLEX');
  if (typeof input === 'string') return resolveString(input, values);
  if (Array.isArray(input)) return input.map((value) => resolveValue(value, values, state, depth + 1));
  if (input && typeof input === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      if (key.includes('{{capture:')) refuse('CAPTURE_REFERENCE_IN_KEY');
      output[key] = resolveValue(value, values, state, depth + 1);
    }
    return output;
  }
  return input;
}

export function createCaptureStore() {
  const values = new Map();
  const owners = new Map();

  return Object.freeze({
    captureFromResponse(scenarioId, declarations, responseJson) {
      if (typeof scenarioId !== 'string' || !scenarioId || scenarioId.length > 128) refuse('CAPTURE_SCENARIO_ID_INVALID');
      if (declarations === undefined) return 0;
      if (!Array.isArray(declarations) || declarations.length > MAX_CAPTURES_PER_SCENARIO) refuse('CAPTURE_DECLARATIONS_INVALID');
      if (values.size + declarations.length > MAX_CAPTURES) refuse('CAPTURE_LIMIT_EXCEEDED');

      const pending = [];
      const seen = new Set();
      for (const rawDeclaration of declarations) {
        const declaration = validateCaptureDeclaration(rawDeclaration);
        if (seen.has(declaration.name) || values.has(declaration.name)) refuse('CAPTURE_NAME_DUPLICATE');
        seen.add(declaration.name);
        const resolved = jsonPointerValue(responseJson, declaration.path);
        if (!resolved.exists) refuse('CAPTURE_POINTER_MISSING');
        pending.push([declaration.name, validateCapturedScalar(resolved.value, declaration)]);
      }

      for (const [name, value] of pending) {
        values.set(name, value);
        owners.set(name, scenarioId);
      }
      return pending.length;
    },

    resolve(input) {
      return resolveValue(input, values, { nodes: 0 });
    },

    has(name) {
      return values.has(name);
    },

    ownerOf(name) {
      return owners.get(name) ?? null;
    },

    count() {
      return values.size;
    },

    names() {
      return Object.freeze([...values.keys()]);
    },

    clear() {
      values.clear();
      owners.clear();
    },
  });
}
