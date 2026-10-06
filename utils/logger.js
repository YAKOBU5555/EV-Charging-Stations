/**
 * Minimal levelled logger. Never logs credentials, tokens or secrets.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = () => (LEVELS[process.env.LOG_LEVEL] !== undefined ? LEVELS[process.env.LOG_LEVEL] : LEVELS.info);

const SENSITIVE = ['password', 'passwordhash', 'token', 'jwt', 'secret', 'authorization'];

function redact(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const clone = Array.isArray(meta) ? [...meta] : { ...meta };
  for (const key of Object.keys(clone)) {
    if (SENSITIVE.includes(key.toLowerCase())) clone[key] = '[redacted]';
    else if (clone[key] && typeof clone[key] === 'object') clone[key] = redact(clone[key]);
  }
  return clone;
}

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel()) return;
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const payload = meta ? ` ${JSON.stringify(redact(meta))}` : '';
  (level === 'error' ? console.error : console.log)(line + payload);
}

module.exports = {
  error: (m, meta) => write('error', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  info: (m, meta) => write('info', m, meta),
  debug: (m, meta) => write('debug', m, meta)
};
