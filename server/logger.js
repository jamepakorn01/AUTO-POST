/**
 * Structured logging: ISO timestamp, level, message, optional JSON meta.
 * Appends to server/logs/app.log (directory created on first write).
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

function formatLine(level, msg, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta && typeof meta === 'object' && Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `[${ts}] ${String(level).toUpperCase()} ${msg}${metaStr ? ` ${metaStr}` : ''}`;
}

function write(level, msg, meta) {
  const line = `${formatLine(level, msg, meta)}\n`;
  const out = line.trimEnd();
  if (level === 'error') {
    console.error(out);
  } else {
    console.log(out);
  }
  try {
    ensureLogDir();
    fs.appendFileSync(path.join(LOG_DIR, 'app.log'), line);
  } catch (_) {
    /* ignore disk errors */
  }
}

module.exports = {
  info(msg, meta) {
    write('info', msg, meta);
  },
  warn(msg, meta) {
    write('warn', msg, meta);
  },
  error(msg, meta) {
    write('error', msg, meta);
  },
};
