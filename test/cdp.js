// A tiny Chrome DevTools Protocol client, with no dependencies, so the UI can be
// driven for real: an HTTP upgrade and WebSocket frames. Copied from Newsx
// (test/cdp.js), unchanged.
import http from 'http';
import crypto from 'crypto';
import net from 'net';
import fs from 'fs';

function httpJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    }).on('error', reject);
  });
}

class WS {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.handlers = [];
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const key = crypto.randomBytes(16).toString('base64');
      const socket = net.connect(Number(u.port), u.hostname, () => {
        socket.write(
          'GET ' + u.pathname + u.search + ' HTTP/1.1\r\n' +
          'Host: ' + u.host + '\r\n' +
          'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
      });
      socket.once('data', (chunk) => {
        const headerEnd = chunk.indexOf('\r\n\r\n');
        if (!chunk.slice(0, headerEnd).toString().includes('101')) {
          return reject(new Error('WebSocket upgrade refused'));
        }
        const ws = new WS(socket);
        if (chunk.length > headerEnd + 4) {
          ws.buffer = chunk.slice(headerEnd + 4);
          ws.drain();
        }
        resolve(ws);
      });
      socket.on('error', reject);
    });
  }
  drain() {
    for (;;) {
      const frame = this.readFrame();
      if (!frame) return;
      for (const fn of this.handlers) fn(frame);
    }
  }
  readFrame() {
    const b = this.buffer;
    if (b.length < 2) return null;
    const len0 = b[1] & 0x7f;
    let offset = 2, len = len0;
    if (len0 === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); offset = 4; }
    else if (len0 === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); offset = 10; }
    if (b.length < offset + len) return null;
    const payload = b.slice(offset, offset + len).toString('utf8');
    this.buffer = b.slice(offset + len);
    return payload;
  }
  send(text) {
    const payload = Buffer.from(text, 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81; header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81; header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }
  onMessage(fn) { this.handlers.push(fn); }
  close() { try { this.socket.destroy(); } catch (e) {} }
}

/**
 * Connect to a running Chrome and drive one page.
 *
 * Through the browser's own endpoint and a flattened session on the page,
 * rather than the page's endpoint: current Chrome swaps a page's renderer on
 * navigation, and a connection straight to the page is left talking to the
 * document it started with.
 */
async function attach(port) {
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await httpJson(port, '/json/version');
      if (version && version.webSocketDebuggerUrl) break;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!version || !version.webSocketDebuggerUrl) throw new Error('Chrome did not open its debugging port');
  const ws = await WS.connect(version.webSocketDebuggerUrl);

  let nextId = 1;
  let sessionId = null;
  const pending = new Map();
  const events = [];
  const listeners = [];
  ws.onMessage((raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && (!sessionId || msg.sessionId === sessionId)) {
      events.push(msg);
      for (const fn of listeners) fn(msg);
    }
  });

  const raw = (method, params = {}, session) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    // Generous: the machine running this may be busy, and a wedged renderer is
    // a real failure worth waiting to be sure of rather than a flaky guess.
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('Timed out: ' + method)); }
    }, 30000);
  });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    const { targetInfos } = await raw('Target.getTargets');
    target = targetInfos.find((t) => t.type === 'page' && t.url.startsWith('http')) || targetInfos.find((t) => t.type === 'page' && !t.url.startsWith('chrome'));
    if (!target) await new Promise((r) => setTimeout(r, 150));
  }
  if (!target) throw new Error('No page target in Chrome');
  sessionId = (await raw('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
  const send = (method, params = {}) => raw(method, params, sessionId);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');

  const api = {
    send, events,
    on: (fn) => listeners.push(fn),
    /** Evaluate an expression in the page; awaits promises. */
    async eval(expression) {
      const res = await send('Runtime.evaluate', {
        expression: '(function(){' + expression + '})()',
        awaitPromise: true, returnByValue: true,
      });
      if (res.exceptionDetails) {
        const ex = res.exceptionDetails;
        throw new Error('page error: ' + (ex.exception && (ex.exception.description || ex.exception.value) || ex.text));
      }
      return res.result.value;
    },
    async navigate(url) {
      await send('Page.navigate', { url });
      await api.waitFor('document.readyState === "complete"');
    },
    async waitFor(condition, timeout = 12000) {
      const start = Date.now();
      for (;;) {
        const okNow = await api.eval('return !!(' + condition + ');').catch(() => false);
        if (okNow) return true;
        if (Date.now() - start > timeout) throw new Error('Timed out waiting for: ' + condition);
        await new Promise((r) => setTimeout(r, 120));
      }
    },
    async screenshot(file) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
      return file;
    },
    key(params) { return send('Input.dispatchKeyEvent', params); },
    async press(key, { ctrl = false, shift = false, code, keyCode, text } = {}) {
      const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0);
      const base = { key, code: code || key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
      // Keys that insert something (Enter, plain characters) only reach the page
      // as editing commands when the event carries its text.
      const payload = text !== undefined ? text : (key === 'Enter' ? '\r' : undefined);
      await api.key({ ...base, type: payload !== undefined && !ctrl ? 'keyDown' : 'rawKeyDown', ...(payload !== undefined && !ctrl ? { text: payload } : {}) });
      await api.key({ ...base, type: 'keyUp' });
    },
    close: () => ws.close(),
  };
  return api;
}

export { attach, WS, httpJson };
