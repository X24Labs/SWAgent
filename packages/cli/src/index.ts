import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
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

Examples:
  swagent generate ./openapi.json
  swagent generate https://api.example.com/openapi.json
  swagent generate ./spec.json -o ./docs -b https://api.example.com
  swagent generate ./spec.json -f llms-txt
`.trim();

type Format = 'llms-txt' | 'human' | 'html' | 'all';

async function loadSpec(source: string): Promise<OpenAPISpec> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch spec from ${source}: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as OpenAPISpec;
  }

  const filePath = resolve(source);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as OpenAPISpec;
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

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'output-dir': { type: 'string', short: 'o', default: './docs' },
      'base-url': { type: 'string', short: 'b' },
      format: { type: 'string', short: 'f', default: 'all' },
      title: { type: 'string', short: 't' },
      theme: { type: 'string' },
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

  console.log(`Loading spec from ${specSource}...`);
  const spec = await loadSpec(specSource);
  const title = values.title || spec.info?.title || 'API';
  console.log(`Generating docs for "${title}"...`);

  const options: SwagentOptions = {
    baseUrl: values['base-url'],
    title: values.title,
    theme: (values.theme as 'dark' | 'light') || 'dark',
  };

  const output = generate(spec, options);

  await mkdir(outputDir, { recursive: true });

  const written: string[] = [];

  if (formats.llmsTxt) {
    const path = resolve(outputDir, 'llms.txt');
    await writeFile(path, output.llmsTxt, 'utf-8');
    written.push(`  llms.txt       (${output.llmsTxt.length} bytes)`);
  }

  if (formats.human) {
    const path = resolve(outputDir, 'to-humans.md');
    await writeFile(path, output.humanDocs, 'utf-8');
    written.push(`  to-humans.md   (${output.humanDocs.length} bytes)`);
  }

  if (formats.html) {
    const path = resolve(outputDir, 'index.html');
    await writeFile(path, output.htmlLanding, 'utf-8');
    written.push(`  index.html     (${output.htmlLanding.length} bytes)`);
  }

  console.log(`\nWritten to ${outputDir}/:`);
  written.forEach((line) => console.log(line));
  console.log('\nDone.');
}

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
