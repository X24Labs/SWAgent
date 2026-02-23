import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { generate, type OpenAPISpec, type SwagentOptions } from '@swagent/core';

const VERSION = '0.1.0';

const HELP = `
swagent - AI-first API documentation generator

Usage:
  swagent generate <spec>     Generate docs from an OpenAPI spec
  swagent --help              Show this help message
  swagent --version           Show version

Arguments:
  <spec>                      Path to OpenAPI JSON/YAML file, or URL

Options:
  -o, --output-dir <dir>      Output directory (default: ./docs)
  -b, --base-url <url>        Base URL for the API
  -f, --format <format>       Output format: llms-txt, human, html, all (default: all)
  -t, --title <title>         Override API title
  --theme <theme>             Theme: dark, light (default: dark)
  -w, --watch                 Watch spec file for changes and regenerate

Examples:
  swagent generate ./openapi.json
  swagent generate ./openapi.yaml
  swagent generate https://api.example.com/openapi.json
  swagent generate ./spec.json -o ./docs -b https://api.example.com
  swagent generate ./spec.yaml -f llms-txt
  swagent generate ./spec.json -o ./docs --watch
`.trim();

type Format = 'llms-txt' | 'human' | 'html' | 'all';

function isYamlSource(source: string): boolean {
  const ext = extname(source).toLowerCase();
  return ext === '.yaml' || ext === '.yml';
}

function parseSpec(content: string, source: string): OpenAPISpec {
  if (isYamlSource(source)) {
    return parseYaml(content) as OpenAPISpec;
  }

  // Try JSON first, fall back to YAML for URLs or ambiguous content
  try {
    return JSON.parse(content) as OpenAPISpec;
  } catch {
    return parseYaml(content) as OpenAPISpec;
  }
}

async function loadSpec(source: string): Promise<OpenAPISpec> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch spec from ${source}: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return parseSpec(text, source);
  }

  const filePath = resolve(source);
  const content = await readFile(filePath, 'utf-8');
  return parseSpec(content, source);
}

function getFormats(format: Format): { llmsTxt: boolean; human: boolean; html: boolean } {
  switch (format) {
    case 'llms-txt':
      return { llmsTxt: true, human: false, html: false };
    case 'human':
      return { llmsTxt: false, human: true, html: false };
    case 'html':
      return { llmsTxt: false, human: false, html: true };
    case 'all':
      return { llmsTxt: true, human: true, html: true };
    default:
      throw new Error(`Unknown format: ${format}. Use: llms-txt, human, html, all`);
  }
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

interface GenerateContext {
  specSource: string;
  outputDir: string;
  formats: { llmsTxt: boolean; human: boolean; html: boolean };
  options: SwagentOptions;
}

async function generateDocs(ctx: GenerateContext): Promise<void> {
  const spec = await loadSpec(ctx.specSource);
  const title = ctx.options.title || spec.info?.title || 'API';
  const output = generate(spec, ctx.options);

  await mkdir(ctx.outputDir, { recursive: true });

  const written: string[] = [];

  if (ctx.formats.llmsTxt) {
    const path = resolve(ctx.outputDir, 'llms.txt');
    await writeFile(path, output.llmsTxt, 'utf-8');
    written.push(`  llms.txt       (${output.llmsTxt.length} bytes)`);
  }

  if (ctx.formats.human) {
    const path = resolve(ctx.outputDir, 'to-humans.md');
    await writeFile(path, output.humanDocs, 'utf-8');
    written.push(`  to-humans.md   (${output.humanDocs.length} bytes)`);
  }

  if (ctx.formats.html) {
    const path = resolve(ctx.outputDir, 'index.html');
    await writeFile(path, output.htmlLanding, 'utf-8');
    written.push(`  index.html     (${output.htmlLanding.length} bytes)`);
  }

  console.log(`Generated docs for "${title}" in ${ctx.outputDir}/:`);
  written.forEach((line) => console.log(line));
}

function isUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'output-dir': { type: 'string', short: 'o', default: './docs' },
      'base-url': { type: 'string', short: 'b' },
      format: { type: 'string', short: 'f', default: 'all' },
      title: { type: 'string', short: 't' },
      theme: { type: 'string' },
      watch: { type: 'boolean', short: 'w' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.version) {
    console.log(VERSION);
    return;
  }

  const command = positionals[0];
  const specSource = positionals[1];

  if (command !== 'generate' || !specSource) {
    console.error(HELP);
    process.exit(1);
  }

  const outputDir = resolve(values['output-dir']!);
  const format = values.format as Format;
  const formats = getFormats(format);

  const options: SwagentOptions = {
    baseUrl: values['base-url'],
    title: values.title,
    theme: (values.theme as 'dark' | 'light') || 'dark',
  };

  const ctx: GenerateContext = { specSource, outputDir, formats, options };

  // Validate --watch before doing anything
  if (values.watch && isUrl(specSource)) {
    console.error('Error: --watch is not supported with URL specs. Use a local file.');
    process.exit(1);
  }

  // Initial generation
  console.log(`Loading spec from ${specSource}...`);
  await generateDocs(ctx);
  console.log('');

  if (!values.watch) {
    console.log('Done.');
    return;
  }

  const filePath = resolve(specSource);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  console.log(`Watching ${specSource} for changes... (press Ctrl+C to stop)\n`);

  watch(filePath, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`[${timestamp()}] Change detected, regenerating...`);
      try {
        await generateDocs(ctx);
        console.log(`[${timestamp()}] Done.\n`);
      } catch (err: any) {
        console.error(`[${timestamp()}] Error: ${err.message}\n`);
      }
    }, 300);
  });
}

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
