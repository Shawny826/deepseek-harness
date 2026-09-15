import { pathToFileURL } from 'node:url';

const target = process.env.APPDATA + '/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const { runCli } = await import(pathToFileURL(target).href);
await runCli();
