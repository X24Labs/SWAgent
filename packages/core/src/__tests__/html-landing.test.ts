import { describe, it, expect } from 'vitest';
import { generateHtmlLanding } from '../core/generators/html-landing.js';
import { sampleSpec, emptySpec, minimalSpec, noAuthSpec } from './fixtures/sample-spec.js';

describe('generateHtmlLanding', () => {
  it('generates valid HTML', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('</html>');
  });

  it('includes project name and description', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('Pet Store API');
    expect(result).toContain('A sample API for managing pets and orders.');
  });

  it('includes stats section', () => {
    const result = generateHtmlLanding(sampleSpec);
    // 20 endpoints total
    expect(result).toContain('Endpoints');
    expect(result).toContain('Categories');
    expect(result).toContain('Version');
  });

  it('includes category cards', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('Pets');
    expect(result).toContain('Orders');
    expect(result).toContain('endpoints</span>');
  });

  it('includes format links', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('/llms.txt');
    expect(result).toContain('/to-humans.md');
    expect(result).toContain('/openapi.json');
  });

  it('includes endpoint tables', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('<table>');
    expect(result).toContain('<code>GET</code>');
    expect(result).toContain('/pets');
  });

  it('includes authentication section', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('Authentication');
    expect(result).toContain('JWT Bearer Token');
  });

  it('has zero JavaScript', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).not.toContain('<script');
  });

  it('uses dark theme CSS variables', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('--bg: #09090b');
    expect(result).toContain('--accent: #818cf8');
  });

  it('includes AI prompt suggestion by default', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('hero-prompt');
    expect(result).toContain('Tell your AI agent');
  });

  it('always includes powered-by badge and brand', () => {
    const result = generateHtmlLanding(sampleSpec);
    expect(result).toContain('SWAgent');
    expect(result).toContain('swagent.dev');
    expect(result).toContain('Powered by');
  });

  it('handles empty spec', () => {
    const result = generateHtmlLanding(emptySpec);
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('API');
  });

  it('handles minimal spec', () => {
    const result = generateHtmlLanding(minimalSpec);
    expect(result).toContain('Minimal API');
  });

  it('handles spec without auth', () => {
    const result = generateHtmlLanding(noAuthSpec);
    expect(result).not.toContain('JWT Bearer Token');
  });

  it('escapes HTML in title', () => {
    const spec = { ...sampleSpec, info: { ...sampleSpec.info, title: '<script>alert(1)</script>' } };
    const result = generateHtmlLanding(spec);
    expect(result).not.toContain('<script>alert');
    expect(result).toContain('&lt;script&gt;');
  });
});
