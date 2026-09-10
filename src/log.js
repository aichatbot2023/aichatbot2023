import { config } from './config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, msg, meta) {
  if (LEVELS[level] > active) return;
  const line = { ts: new Date().toISOString(), level, msg, ...meta };
  process.stdout.write(JSON.stringify(line) + '\n');
}

export const log = {
  error: (m, meta) => emit('error', m, meta),
  warn: (m, meta) => emit('warn', m, meta),
  info: (m, meta) => emit('info', m, meta),
  debug: (m, meta) => emit('debug', m, meta),
};

// Token se NIKAD ne loguje u celosti.
export function maskToken(token) {
  if (!token) return null;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
