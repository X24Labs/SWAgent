import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI = resolve(import.meta.dirname, '../../dist/index.js');

const sampleSpec = {
  openapi: '3.0.0',
  info: { title: 'Test CLI API', version: '1.0.0', description: 'A test API for CLI' },
  servers: [{ url: 'https://api.test.io' }],
  tags: [{ name: 'Items', description: 'Item operations' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
  paths: {
    '/items': {
      get: {
        tags: ['Items'],
        summary: 'List items',
        responses: { '200': { description: 'OK' } },
      },
      post: {
        tags: ['Items'],
        summary: 'Create item',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
  },
};

let tmpDir: string;
let specPath: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'swagent-cli-test-'));
  specPath = join(tmpDir, 'openapi.json');
  await writeFile(specPath, JSON.stringify(sampleSpec), 'utf-8');
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('swagent CLI', () => {
  it('shows help with --help', async () => {
    const { stdout } = await exec('node', [CLI, '--help']);
    expect(stdout).toContain('swagent - AI-first API documentation generator');
    expect(stdout).toContain('generate');
    expect(stdout).toContain('--output-dir');
    expect(stdout).toContain('--base-url');
    expect(stdout).toContain('--format');
  });

  it('shows version with --version', async () => {
    const { stdout } = await exec('node', [CLI, '--version']);
    expect(stdout.trim()).toBe('0.1.0');
  });

  it('generates all formats by default', async () => {
    const outDir = join(tmpDir, 'out-all');
    const { stdout } = await exec('node', [CLI, 'generate', specPath, '-o', outDir]);

    expect(stdout).toContain('Test CLI API');
    expect(stdout).toContain('llms.txt');
    expect(stdout).toContain('to-humans.md');
    expect(stdout).toContain('index.html');

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# Test CLI API');

    const human = await readFile(join(outDir, 'to-humans.md'), 'utf-8');
    expect(human).toContain('# Test CLI API');

    const html = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('generates only llms-txt with -f llms-txt', async () => {
    const outDir = join(tmpDir, 'out-llms');
    await exec('node', [CLI, 'generate', specPath, '-o', outDir, '-f', 'llms-txt']);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# Test CLI API');

    // Other files should not exist
    await expect(readFile(join(outDir, 'to-humans.md'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(outDir, 'index.html'), 'utf-8')).rejects.toThrow();
  });

  it('generates only human docs with -f human', async () => {
    const outDir = join(tmpDir, 'out-human');
    await exec('node', [CLI, 'generate', specPath, '-o', outDir, '-f', 'human']);

    const human = await readFile(join(outDir, 'to-humans.md'), 'utf-8');
    expect(human).toContain('# Test CLI API');

    await expect(readFile(join(outDir, 'llms.txt'), 'utf-8')).rejects.toThrow();
  });

  it('generates only HTML with -f html', async () => {
    const outDir = join(tmpDir, 'out-html');
    await exec('node', [CLI, 'generate', specPath, '-o', outDir, '-f', 'html']);

    const html = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');

    await expect(readFile(join(outDir, 'llms.txt'), 'utf-8')).rejects.toThrow();
  });

  it('respects --base-url flag', async () => {
    const outDir = join(tmpDir, 'out-base');
    await exec('node', [CLI, 'generate', specPath, '-o', outDir, '-b', 'https://custom.api.io']);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('Base: https://custom.api.io');
  });

  it('respects --title flag', async () => {
    const outDir = join(tmpDir, 'out-title');
    await exec('node', [CLI, 'generate', specPath, '-o', outDir, '-t', 'My Custom Title']);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# My Custom Title');
  });

  it('exits with error for missing spec argument', async () => {
    try {
      await exec('node', [CLI, 'generate']);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.code).not.toBe(0);
    }
  });

  it('exits with error for invalid spec file', async () => {
    try {
      await exec('node', [CLI, 'generate', '/nonexistent/spec.json']);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.stderr || err.stdout).toContain('Error');
    }
  });

  it('creates output directory if it does not exist', async () => {
    const outDir = join(tmpDir, 'nested', 'deep', 'dir');
    await exec('node', [CLI, 'generate', specPath, '-o', outDir, '-f', 'llms-txt']);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# Test CLI API');
  });
});
