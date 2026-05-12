// Dev-only Vite middleware that lets the in-app level editor write level
// JSON directly into content/levels/ via a POST request. Skipped in
// production builds (`apply: 'serve'`).
//
// Wire format:
//   POST /__editor/save
//   body: { id: number, json: <LevelDef-shaped object> }
//   200: { ok: true, path: <relative path written> }
//   400: { ok: false, error: <message> }
//
// Safety:
//   - id must be a positive integer; filename is `${id padded to 3}.json`.
//   - Target path is resolved and asserted to live inside content/levels.
//   - JSON is re-stringified server-side (pretty-printed) so the file
//     stays diff-friendly.

import type { Plugin } from 'vite';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function editorSavePlugin(opts: { contentDir: string }): Plugin {
  const levelsDir = path.resolve(opts.contentDir, 'levels');
  return {
    name: 'editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/save', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        try {
          const body = await readJson(req);
          if (typeof body.id !== 'number' || !Number.isInteger(body.id) || body.id <= 0) {
            return sendJson(res, 400, { ok: false, error: 'id must be a positive integer' });
          }
          if (!body.json || typeof body.json !== 'object') {
            return sendJson(res, 400, { ok: false, error: 'json field missing or not an object' });
          }
          // Sanity check: payload must look like a LevelDef. Prevents
          // accidental clobbers from incomplete test payloads. Full Zod
          // validation is done client-side in the editor before send.
          const j = body.json as Record<string, unknown>;
          const requiredFields = ['id', 'name', 'tutorialKey', 'map', 'terrain', 'players', 'nodes', 'winCondition'];
          for (const k of requiredFields) {
            if (!(k in j)) {
              return sendJson(res, 400, { ok: false, error: `payload missing required field '${k}'` });
            }
          }
          if (j.id !== body.id) {
            return sendJson(res, 400, { ok: false, error: `payload.json.id (${String(j.id)}) does not match payload.id (${body.id})` });
          }
          if (!Array.isArray(j.nodes) || !Array.isArray(j.players)) {
            return sendJson(res, 400, { ok: false, error: 'nodes and players must be arrays' });
          }
          const padded = String(body.id).padStart(3, '0');
          const filename = `${padded}.json`;
          const target = path.resolve(levelsDir, filename);
          // Prevent path traversal — target must be inside levelsDir.
          if (!target.startsWith(levelsDir + path.sep) && target !== levelsDir) {
            return sendJson(res, 400, { ok: false, error: 'invalid path' });
          }
          const text = JSON.stringify(body.json, null, 2) + '\n';
          await fs.mkdir(levelsDir, { recursive: true });
          await fs.writeFile(target, text, 'utf-8');
          return sendJson(res, 200, { ok: true, path: `content/levels/${filename}` });
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: (err as Error).message });
        }
      });
    },
  };
}

async function readJson(req: { on: (ev: string, cb: (chunk: unknown) => void) => void }): Promise<{ id?: number; json?: unknown }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: unknown) => {
      chunks.push(chunk as Buffer);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
