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

const sampleYaml = `openapi: "3.0.0"
info:
  title: YAML API
  version: "1.0.0"
  description: A YAML test API
servers:
  - url: https://api.yaml-test.io
tags:
  - name: Users
    description: User operations
paths:
  /users:
    get:
      tags:
        - Users
      summary: List users
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                    name:
                      type: string
`;

let tmpDir: string;
let specPath: string;
let yamlPath: string;
let ymlPath: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'swagent-cli-test-'));
  specPath = join(tmpDir, 'openapi.json');
  yamlPath = join(tmpDir, 'openapi.yaml');
  ymlPath = join(tmpDir, 'openapi.yml');
  await writeFile(specPath, JSON.stringify(sampleSpec), 'utf-8');
  await writeFile(yamlPath, sampleYaml, 'utf-8');
  await writeFile(ymlPath, sampleYaml, 'utf-8');
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

describe('swagent CLI YAML support', () => {
  it('generates docs from .yaml file', async () => {
    const outDir = join(tmpDir, 'out-yaml');
    const { stdout } = await exec('node', [CLI, 'generate', yamlPath, '-o', outDir]);

    expect(stdout).toContain('YAML API');
    expect(stdout).toContain('llms.txt');

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# YAML API');
    expect(llms).toContain('List users');
  });

  it('generates docs from .yml file', async () => {
    const outDir = join(tmpDir, 'out-yml');
    const { stdout } = await exec('node', [CLI, 'generate', ymlPath, '-o', outDir, '-f', 'llms-txt']);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# YAML API');
  });

  it('generates all formats from YAML', async () => {
    const outDir = join(tmpDir, 'out-yaml-all');
    await exec('node', [CLI, 'generate', yamlPath, '-o', outDir]);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# YAML API');

    const human = await readFile(join(outDir, 'to-humans.md'), 'utf-8');
    expect(human).toContain('# YAML API');

    const html = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('YAML API');
  });

  it('respects --title flag with YAML input', async () => {
    const outDir = join(tmpDir, 'out-yaml-title');
    await exec('node', [CLI, 'generate', yamlPath, '-o', outDir, '-t', 'Custom YAML Title', '-f', 'llms-txt']);

    const llms = await readFile(join(outDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# Custom YAML Title');
  });
});
