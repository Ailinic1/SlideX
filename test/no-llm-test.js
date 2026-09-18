// The guard: there is no AI in SlideX, and this is what keeps it that way.
//
// Every "generation" here is a seeded random number generator and rules - the
// same mulberry32 Newsx uses, and the same promise its generate.js makes in its
// first lines. Nothing asks a model anything, and nothing can: there is no
// network call in the program at all, and no dependency to hide one in.
//
// So this walks the whole source tree and fails on:
//
//   - a hostname belonging to a model API,
//   - an import of a model SDK,
//   - a key that looks like a model API key,
//   - any outbound HTTP at all from the browser or the server, other than to
//     127.0.0.1 - because a program that works on a plane cannot have one,
//   - a dependency in package.json, since a dependency could carry any of the
//     above in without any of it appearing here.
//
// It is deliberately blunt. A false positive is a minute spent renaming
// something; a false negative is the promise broken.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, assert, run } from './harness.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.venv', '__pycache__', 'assets', 'docs', 'desktop']);
const TEXT = /\.(js|mjs|cjs|json|html|css|py|sh|bat|md|yml|yaml|txt)$/i;

/** Every file worth reading, as {rel, text}. */
function sources() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = path.join(dir, entry.name);
      const here = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, here);
      } else if (TEXT.test(entry.name)) {
        out.push({ rel: here, text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(ROOT, '');
  // This file names every one of the things it forbids, so it cannot check
  // itself without failing.
  return out.filter((f) => f.rel !== 'test/no-llm-test.js');
}

const FILES = sources();

/** Where a pattern matches, with the line, for a failure worth reading. */
function findAll(pattern) {
  const hits = [];
  for (const file of FILES) {
    const lines = file.text.split('\n');
    lines.forEach((line, i) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) hits.push(file.rel + ':' + (i + 1) + ': ' + line.trim().slice(0, 140));
    });
  }
  return hits;
}

test('the source tree names no model API', () => {
  const hosts = [
    'api\\.openai\\.com', 'api\\.anthropic\\.com', 'generativelanguage\\.googleapis\\.com',
    'api\\.cohere\\.ai', 'api\\.mistral\\.ai', 'api\\.groq\\.com', 'api\\.together\\.xyz',
    'api\\.replicate\\.com', 'api-inference\\.huggingface\\.co', 'api\\.deepseek\\.com',
    'openai\\.azure\\.com', 'bedrock-runtime\\.[a-z0-9-]+\\.amazonaws\\.com',
    'api\\.perplexity\\.ai', 'api\\.x\\.ai', 'openrouter\\.ai', 'api\\.fireworks\\.ai',
    'localhost:11434', '127\\.0\\.0\\.1:11434',
  ];
  const hits = findAll(new RegExp(hosts.join('|'), 'i'));
  assert.deepStrictEqual(hits, [], 'a model API hostname is in the source:\n  ' + hits.join('\n  '));
});

test('the source tree imports no model SDK', () => {
  const sdks = [
    'openai', '@openai/[\\w-]+', '@anthropic-ai/[\\w-]+', 'anthropic',
    '@google/generative-ai', '@google/genai', 'google-generativeai', 'generativeai',
    'langchain', '@langchain/[\\w-]+', 'llamaindex', 'llama-index',
    '@huggingface/[\\w-]+', 'transformers', 'cohere-ai', '@mistralai/[\\w-]+',
    'replicate', 'ollama', '@aws-sdk/client-bedrock[\\w-]*', 'vercel-ai', '\\bai\\b',
    'onnxruntime[\\w-]*', '@xenova/transformers', 'gpt-3', 'gpt-4', 'tiktoken',
  ];
  // import x from 'sdk' / require('sdk') / from sdk import / import sdk
  const js = new RegExp('(?:from\\s*|require\\s*\\(\\s*)[\'"](?:' + sdks.join('|') + ')[\'"/]', 'i');
  const py = new RegExp('^\\s*(?:from\\s+(?:' + sdks.join('|') + ')|import\\s+(?:' + sdks.join('|') + '))\\b', 'i');
  const hits = [...findAll(js), ...findAll(py)];
  assert.deepStrictEqual(hits, [], 'a model SDK is imported:\n  ' + hits.join('\n  '));
});

test('nothing looks like a model API key', () => {
  const hits = findAll(/\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{30,}|hf_[A-Za-z0-9]{30,})\b/);
  assert.deepStrictEqual(hits, [], 'something that looks like an API key is in the source:\n  ' + hits.join('\n  '));
});

test('no "generate from a prompt", "rewrite this", or any other model-shaped feature', () => {
  // The words themselves are fine - "generate a deck style" is a feature here -
  // so what is forbidden is the machinery: a chat turn, a completion, a prompt
  // sent somewhere, an embedding.
  const hits = findAll(/\b(chat\.completions|completions\.create|messages\.create|model:\s*['"](?:gpt|claude|gemini|llama|mistral|o[134])|embeddings\.create|\.generateContent\(|system_prompt|systemPrompt)\b/i);
  assert.deepStrictEqual(hits, [], 'a model call is in the source:\n  ' + hits.join('\n  '));
});

test('nothing reaches the internet at all', () => {
  // The editor talks to its own server on 127.0.0.1, and that is the only
  // conversation the program has. Anything that could open a socket to
  // somewhere else, and any request whose address is not this machine, fails
  // here. The test folder is exempt: the API tests run two servers and talk to
  // them, and the UI tests drive a browser through a local socket.
  const program = FILES.filter((f) => /^(src|web)\//.test(f.rel) || /^(slidex\.py|SlideX\.sh|SlideX\.bat)$/i.test(f.rel));
  // Ways to reach out that have no local-only use at all.
  const never = /\b(XMLHttpRequest|EventSource|navigator\.sendBeacon|WebSocket)\b|\brequests\.(get|post|put|request)\b|\bsocket\.(create_connection|socket)\(\s*['"]/;
  // Ways that do, but only to this machine.
  const maybe = /\bfetch\s*\(|\bhttps?\.(get|request)\s*\(|\burlopen\s*\(|\bcurl\b|\bwget\b/;
  const here = /127\.0\.0\.1|localhost|\blocal\b/;
  const hits = [];
  for (const file of program) {
    file.text.split('\n').forEach((line, i) => {
      const where = file.rel + ':' + (i + 1) + ': ' + line.trim().slice(0, 140);
      if (/^\s*(\/\/|\*|#|REM\b)/i.test(line)) return;
      if (never.test(line)) { hits.push(where); return; }
      if (!maybe.test(line)) return;
      // A request with an absolute address is only allowed to this machine; a
      // relative one can only go to the server that served the page, which is
      // this program.
      const absolute = line.match(/[a-z]+:\/\/[^\s'"`)]+/i);
      if (absolute && !here.test(absolute[0])) hits.push(where);
    });
  }
  assert.deepStrictEqual(hits, [], 'something reaches out of the machine:\n  ' + hits.join('\n  '));
});

test('every address in the source is either this machine or a link in prose', () => {
  // Only this machine, the XML namespace an SVG has to name, and the handful
  // of places the documentation tells somebody to go and get something. Every
  // one of these is a link a person clicks, never an address the program
  // fetches: nothing in src/ or web/ asks any of them for anything, which the
  // test above is what proves.
  const allowed = [
    /^https?:\/\/127\.0\.0\.1/, /^https?:\/\/localhost/,
    /^https?:\/\/www\.w3\.org\//,
    /^https:\/\/github\.com\//,
    /^https:\/\/nodejs\.org/,
    /^https:\/\/www\.python\.org/,
    /^https:\/\/pywebview\.flowrey\.dev/,
    /^https:\/\/bottlepy\.org/,
    /^https:\/\/pyinstaller\.org/,
    /^https:\/\/jrsoftware\.org/,
  ];
  const hits = [];
  for (const file of FILES) {
    for (const m of file.text.matchAll(/https?:\/\/[^\s'"`)\]}>,;]+/g)) {
      const url = m[0].replace(/[.,]$/, '');
      if (allowed.some((ok) => ok.test(url))) continue;
      hits.push(file.rel + ': ' + url);
    }
  }
  assert.deepStrictEqual(hits, [], 'an address that is not this machine:\n  ' + hits.join('\n  '));
});

test('there are no npm dependencies to hide one in', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.dependencies || {}, {}, 'SlideX has a dependency');
  assert.strictEqual(pkg.devDependencies, undefined, 'SlideX has a dev dependency');
  assert.ok(!fs.existsSync(path.join(ROOT, 'node_modules')), 'node_modules exists');
  assert.ok(!fs.existsSync(path.join(ROOT, 'package-lock.json')), 'a lockfile exists');
});

test('the generator says in its own words that there is no AI in it', () => {
  // Not decoration: if somebody ever takes this line out, the reason to keep
  // the promise has gone with it, and this test should be the thing that asks
  // why.
  const generate = FILES.find((f) => f.rel === 'web/shared/generate.js');
  assert.ok(generate, 'web/shared/generate.js is missing');
  assert.ok(/No AI: a seeded random number generator and rules\./.test(generate.text),
    'generate.js no longer says how it works');
  const patterns = FILES.find((f) => f.rel === 'web/shared/patterns.js');
  assert.ok(/No AI: a seeded random number generator and rules\./.test(patterns.text),
    'patterns.js no longer says how it works');
});

await run('SlideX: no model APIs, no SDKs, nothing off this machine');
