const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
function int(r, min, max) { return min + Math.floor(r() * (max - min + 1)); }
function money(n) { return Math.round(n * 100) / 100; }
function iso(ms) { return new Date(ms).toISOString(); }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function csvValue(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(file, rows) {
  if (!rows.length) { fs.writeFileSync(file, '\n'); return; }
  const keys = Object.keys(rows[0]);
  const out = [keys.join(',')];
  for (const row of rows) out.push(keys.map(k => csvValue(row[k])).join(','));
  fs.writeFileSync(file, out.join('\n') + '\n');
}
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function writeSql(file, tables, schema) {
  const chunks = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;', schema];
  for (const [name, rows] of Object.entries(tables)) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const insert = `INSERT INTO "${name}" (${cols.join(',')}) VALUES\n`;
    const vals = rows.map(row => '(' + cols.map(c => sqlLiteral(row[c])).join(',') + ')');
    for (let i = 0; i < vals.length; i += 500) chunks.push(insert + vals.slice(i, i + 500).join(',\n') + ';');
  }
  chunks.push('COMMIT;');
  fs.writeFileSync(file, chunks.join('\n\n') + '\n');
}
module.exports = { rng, pick, int, money, iso, mkdir, writeCsv, writeJson, sha256, writeSql };
