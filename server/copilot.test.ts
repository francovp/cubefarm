import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { COPILOT_HOOK_SOURCE, writeCopilotPlugin } from './copilot.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

it('builds session-scoped instructions and lifecycle hooks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cubefarm-copilot-'));
  dirs.push(dir);
  const root = writeCopilotPlugin(dir, 'Only do the assigned task.', '/bin/node', 'http://127.0.0.1:9/api/hooks/token');
  expect(JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')).name).toBe('cubefarm-session');
  expect(fs.readFileSync(path.join(root, 'agents', 'cubefarm-session.agent.md'), 'utf8')).toContain('Only do the assigned task.');
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks.json'), 'utf8')).hooks;
  for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'ErrorOccurred', 'Notification']) {
    expect(hooks[event][0].args.slice(-2)).toEqual(['http://127.0.0.1:9/api/hooks/token', event]);
  }
});

it('reports the final message from the current Copilot turn', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cubefarm-copilot-'));
  dirs.push(dir);
  const script = path.join(dir, 'hook.cjs');
  const transcript = path.join(dir, 'events.jsonl');
  fs.writeFileSync(script, COPILOT_HOOK_SOURCE);
  fs.writeFileSync(transcript, [
    { type: 'assistant.turn_start', data: { turnId: 'old' } },
    { type: 'assistant.message', data: { content: 'old response' } },
    { type: 'assistant.turn_start', data: { turnId: 'new' } },
    { type: 'assistant.message', data: { content: 'new response' } },
  ].map((event) => JSON.stringify(event)).join('\n') + '\n');
  let received!: (body: Record<string, unknown>) => void;
  const request = new Promise<Record<string, unknown>>((resolve) => { received = resolve; });
  const server = createServer((req, res) => {
    let input = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { input += chunk; });
    req.on('end', () => { received(JSON.parse(input)); res.end('{}'); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    const child = spawn(process.execPath, [script, `http://127.0.0.1:${address.port}`, 'Stop']);
    child.stdin.end(JSON.stringify({ session_id: 'session-1', transcript_path: transcript }));
    const exit = new Promise<number | null>((resolve) => child.on('exit', resolve));
    expect(await request).toMatchObject({ hook_event_name: 'TurnComplete', session_id: 'session-1', last_assistant_message: 'new response' });
    expect(await exit).toBe(0);
  } finally {
    server.close();
  }
});
