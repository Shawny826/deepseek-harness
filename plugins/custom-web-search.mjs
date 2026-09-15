/**
 * Unified Web Search Provider for DeepSeek Harness (ctx.web)
 * Supports both Gemini (Google Search Grounding) and Grok/GPT (Messages web search format)
 * running through your unified relay (e.g. cliapi.supersyj.com).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const name = 'custom-web-search';
// cordis only accepts an array of service names here (or a service-name -> intercept map);
// an { required, optional } wrapper is parsed as service names and leaves the plugin pending.
export const inject = ['web'];

const DEFAULT_BASE_URL = 'https://cliapi.supersyj.com/v1';
const DEFAULT_MODEL = 'gemini-3.7-flash-high';
const DEFAULT_FALLBACK_MODELS = ['gemini-3.8-flash-high', 'grok-4.5', 'gpt-6-astra'];
const PER_MODEL_TIMEOUT_MS = 25000;

function getFallbackApiKey() {
  if (process.env.CPA_API_KEY) return process.env.CPA_API_KEY;
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const credPath = join(homedir(), '.dsh', '.credentials.yaml');
    if (existsSync(credPath)) {
      const txt = readFileSync(credPath, 'utf8');
      const m = txt.match(/CPA_API_KEY:\s*(\S+)/) || txt.match(/DEEPSEEK_API_KEY:\s*(\S+)/);
      if (m) return m[1];
    }
  } catch {}
  return '';
}

async function resolveApiKey(ctx, config) {
  if (config.apiKey) return config.apiKey;
  if (config.relay?.apiKey) return config.relay.apiKey;
  if (config.grok?.apiKey) return config.grok.apiKey;

  const envName = config.apiKeyEnv || 'CPA_API_KEY';
  const credentials = ctx.get ? ctx.get('credentials') : null;
  if (credentials?.resolve) {
    try {
      const hit = await credentials.resolve(envName);
      if (hit?.value) return hit.value;
    } catch {}
  }
  if (process.env[envName]) return process.env[envName];
  return getFallbackApiKey();
}

function extractMarkdownLinks(text, sources, seen) {
  if (!text) return;
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)\"\']+)\)/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    const title = match[1].trim();
    let url = match[2].trim();
    url = url.replace(/[\.,;:!\?]+$/, '');
    if (!seen.has(url) && url.startsWith('http')) {
      seen.add(url);
      sources.push({
        url,
        title: title || url,
        snippet: ''
      });
    }
  }
}

async function searchWithGemini(origin, apiKey, model, query, signal) {
  const url = `${origin}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `Perform a web search and answer with sources: ${query}` }]
        }
      ],
      tools: [
        {
          googleSearch: {}
        }
      ]
    }),
    signal
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const content = parts
    .filter(p => !p.thought)
    .map(p => p.text)
    .filter(Boolean)
    .join('\n') || '';

  const sources = [];
  const seen = new Set();

  // 1. Extract from Google Search Grounding metadata
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title || uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({
        url: uri,
        title: title || uri,
        snippet: ''
      });
    }
  }

  // 2. Extract markdown links from response prose
  extractMarkdownLinks(content, sources, seen);

  return {
    content: content.trim(),
    sources,
    truncated: false
  };
}

async function searchWithMessages(origin, apiKey, model, query, signal) {
  const url = `${origin}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Perform a web search for the query: ${query}`
        }
      ],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5
        }
      ]
    }),
    signal
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Model ${model} returned HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.type === 'error' || data.error) {
    const msg = data.error?.message || data.message || JSON.stringify(data);
    throw new Error(`Model ${model} error: ${msg}`);
  }

  let content = '';
  const sources = [];
  const seen = new Set();

  for (const block of data.content || []) {
    if (block.type === 'text' && block.text) {
      content += block.text + '\n';
    } else if (block.type === 'web_search_tool_result') {
      for (const item of block.content || []) {
        if (item.type === 'web_search_result' && item.url && !seen.has(item.url)) {
          seen.add(item.url);
          sources.push({
            url: item.url,
            title: item.title || item.url,
            snippet: ''
          });
        }
      }
    }
  }

  // Extract markdown links from response prose
  extractMarkdownLinks(content, sources, seen);

  return {
    content: content.trim(),
    sources,
    truncated: false
  };
}

export function apply(ctx, config = {}) {
  const provider = {
    id: 'relay-search',
    available() {
      return true;
    },
    async search(request, signal) {
      const apiKey = await resolveApiKey(ctx, config);
      if (!apiKey) {
        throw new Error('API key is not configured (provide apiKey/apiKeyEnv in config or set CPA_API_KEY)');
      }

      const baseURL = (config.baseURL || config.relay?.baseURL || DEFAULT_BASE_URL).replace(/\/+$/, '');
      const origin = new URL(baseURL).origin;
      const primaryModel = config.model || config.relay?.model || DEFAULT_MODEL;
      const fallbackModels = config.fallbackModels || config.relay?.fallbackModels || DEFAULT_FALLBACK_MODELS.filter(m => m !== primaryModel);
      const modelsToTry = [primaryModel, ...fallbackModels];

      let lastError = null;

      for (const model of modelsToTry) {
        if (signal?.aborted) throw new Error('Search aborted');
        try {
          const timeoutSignal = AbortSignal.timeout(PER_MODEL_TIMEOUT_MS);
          const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

          const isGemini = model.toLowerCase().includes('gemini');
          const result = isGemini
            ? await searchWithGemini(origin, apiKey, model, request.query, combinedSignal)
            : await searchWithMessages(origin, apiKey, model, request.query, combinedSignal);

          if (result.sources.length > 0 || result.content.length > 0) {
            return result;
          }
        } catch (err) {
          if (signal?.aborted) throw err;
          lastError = err;
        }
      }

      throw lastError || new Error('All configured models failed to return web search results');
    }
  };

  ctx.web.registerSearchProvider(provider);
}
