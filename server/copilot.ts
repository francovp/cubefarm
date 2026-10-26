import fs from 'node:fs';
import path from 'node:path';

// A private, session-scoped Copilot plugin adds the office's instructions and lifecycle hooks without changing the
// manager's Copilot configuration or the repository being worked on.
export function writeCopilotPlugin(dir: string, instructions: string, hookScript: string, hookUrl: string): string {
  const root = path.join(dir, 'copilot-plugin');
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ name: 'cubefarm-session', version: '1.0.0', agents: 'agents/', hooks: 'hooks.json' }));
  fs.writeFileSync(path.join(root, 'agents', 'cubefarm-session.agent.md'), `---\nname: cubefarm-session\ndescription: The coding agent running in cubefarm\n---\n${instructions}\n`);
  const entry = (event: string) => [{ type: 'command', exec: process.execPath, args: [hookScript, hookUrl, event], timeoutSec: 15 }];
  fs.writeFileSync(path.join(root, 'hooks.json'), JSON.stringify({
    version: 1,
    hooks: {
      SessionStart: entry('SessionStart'),
      UserPromptSubmit: entry('UserPromptSubmit'),
      Stop: entry('Stop'),
      ErrorOccurred: entry('ErrorOccurred'),
      Notification: entry('Notification'),
    },
  }));
  return root;
}

/** The CLI runs this helper for each hook. Stop reads only the final assistant message in the current transcript turn. */
export const COPILOT_HOOK_SOURCE = String.raw`const fs = require('node:fs');
const url = process.argv[2];
const event = process.argv[3];

function finalMessage(file) {
  if (!file) return '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, 4 * 1024 * 1024);
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, size - length);
      const lines = buf.toString('utf8').split('\n');
      let answer = '';
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.type === 'assistant.turn_start') answer = '';
          if (item.type === 'assistant.message' && typeof item.data?.content === 'string') answer = item.data.content;
        } catch { /* an incomplete first or last line */ }
      }
      return answer;
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const body = JSON.parse(input || '{}');
    body.hook_event_name = event;
    if (event === 'Stop') {
      body.hook_event_name = 'TurnComplete';
      body.last_assistant_message = finalMessage(body.transcript_path);
    } else if (event === 'ErrorOccurred') {
      body.hook_event_name = 'TurnError';
      body.error = body.error?.message || 'Copilot CLI error';
    }
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) process.exitCode = 1;
  } catch { process.exitCode = 1; }
});`;
