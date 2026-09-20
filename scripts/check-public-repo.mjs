import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';

// Deliberately report paths/line numbers only; never echo matching credentials.
const git = args => execFileSync('git', args, {maxBuffer: 32 * 1024 * 1024});
const tracked = git(['ls-files', '-z']).toString().split('\0').filter(Boolean);
const candidates = [...new Set([...tracked, ...git(['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean)])];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Matrix access token', /\bsyt_[A-Za-z0-9_-]{20,}/g],
  ['OpenAI token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}/g],
];
const findings = new Set();
for (const path of tracked) {
  if (/(^|\/)\.env(?:\..*)?$/.test(path) && !path.endsWith('.env.example')) findings.add(`${path}: local environment file is in the Git index`);
  if (/\.(?:pem|key|p12|pfx|jks|har|sqlite3?|db)$/i.test(path)) findings.add(`${path}: potentially private file is in the Git index`);
}
function scan(path, buffer, origin) {
  if (buffer.includes(0)) return; // Binary assets are not scanned as source text.
  const text = buffer.toString('utf8');
  for (const [label, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) findings.add(`${path}:${text.slice(0, match.index).split('\n').length} (${origin}): possible ${label}`);
  }
}
for (const path of candidates) if (existsSync(path)) scan(path, readFileSync(path), 'working tree');
for (const path of tracked) scan(path, git(['show', `:${path}`]), 'Git index');
if (findings.size) {
  console.error([...findings].join('\n'));
  process.exitCode = 1;
} else console.log(`Public-repo check passed: ${candidates.length} files; indexed blobs also checked. This is a limited credential-format scan, not a full security audit.`);
