import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

function conversationsDir(workspacePath: string): string {
  const hash = crypto.createHash('md5').update(workspacePath).digest('hex');
  return path.join(os.homedir(), '.iodine', hash, 'conversations');
}

// GET /api/conversations?workspacePath=...  →  last 3 conversations, newest first
router.get('/conversations', (req, res) => {
  const workspacePath = req.query.workspacePath as string | undefined;
  if (!workspacePath) return res.json([]);
  const dir = conversationsDir(workspacePath);
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const records: unknown[] = [];
    for (const f of files) {
      try {
        records.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
      } catch { /* skip malformed */ }
    }
    (records as { timestamp: number }[]).sort((a, b) => b.timestamp - a.timestamp);
    return res.json(records.slice(0, 3));
  } catch {
    return res.json([]);
  }
});

// POST /api/conversations  — save / overwrite one conversation
router.post('/conversations', (req, res) => {
  const { workspacePath, id, timestamp, history, uiMessages } =
    req.body as { workspacePath?: string; id?: string; timestamp?: number; history?: unknown; uiMessages?: unknown };
  if (!workspacePath || !id) return res.status(400).json({ error: 'workspacePath and id are required' });
  const dir = conversationsDir(workspacePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ id, timestamp: timestamp ?? Date.now(), history: history ?? [], uiMessages: uiMessages ?? [] }, null, 2),
  );
  res.json({ ok: true });
});

// DELETE /api/conversations?workspacePath=...  — clear all conversations for workspace
router.delete('/conversations', (req, res) => {
  const workspacePath = req.query.workspacePath as string | undefined;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath is required' });
  const dir = conversationsDir(workspacePath);
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const f of files) fs.unlinkSync(path.join(dir, f));
  } catch { /* dir may not exist — that's fine */ }
  res.json({ ok: true });
});

export default router;
