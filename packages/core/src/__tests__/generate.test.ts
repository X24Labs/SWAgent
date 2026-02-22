import { describe, it, expect } from 'vitest';
import { generate } from '../core/generate.js';
import { sampleSpec, emptySpec } from './fixtures/sample-spec.js';

describe('generate', () => {
  it('returns all three output formats', () => {
    const output = generate(sampleSpec);
    expect(output).toHaveProperty('llmsTxt');
    expect(output).toHaveProperty('humanDocs');
    expect(output).toHaveProperty('htmlLanding');
  });

  it('all outputs are non-empty strings', () => {
    const output = generate(sampleSpec);
    expect(typeof output.llmsTxt).toBe('string');
    expect(typeof output.humanDocs).toBe('string');
    expect(typeof output.htmlLanding).toBe('string');
    expect(output.llmsTxt.length).toBeGreaterThan(0);
    expect(output.humanDocs.length).toBeGreaterThan(0);
    expect(output.htmlLanding.length).toBeGreaterThan(0);
  });

  it('passes options to all generators', () => {
    const output = generate(sampleSpec, { title: 'Override Title' });
    expect(output.llmsTxt).toContain('# Override Title');
    expect(output.humanDocs).toContain('# Override Title');
    expect(output.htmlLanding).toContain('Override Title');
  });

  it('handles empty spec without crashing', () => {
    const output = generate(emptySpec);
    expect(output.llmsTxt).toContain('# API');
    expect(output.humanDocs).toContain('# API');
    expect(output.htmlLanding).toContain('<!DOCTYPE html>');
  });

  it('llmsTxt is token-optimized (smaller than humanDocs)', () => {
    const output = generate(sampleSpec);
    expect(output.llmsTxt.length).toBeLessThan(output.humanDocs.length);
  });

  it('htmlLanding is valid HTML', () => {
    const output = generate(sampleSpec);
    expect(output.htmlLanding).toContain('<!DOCTYPE html>');
    expect(output.htmlLanding).toContain('</html>');
  });
});
