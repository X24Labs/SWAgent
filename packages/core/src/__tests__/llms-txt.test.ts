import { describe, it, expect } from 'vitest';
import { generateLlmsTxt } from '../core/generators/llms-txt.js';
import { generateHumanDocs } from '../core/generators/human-docs.js';
import { sampleSpec, emptySpec, minimalSpec, noAuthSpec } from './fixtures/sample-spec.js';

describe('generateLlmsTxt', () => {
  it('generates valid output for sample spec', () => {
    const result = generateLlmsTxt(sampleSpec);
    expect(result).toContain('# Pet Store API');
    expect(result).toContain('Base: https://api.petstore.io');
    expect(result).toContain('## Auth Methods');
    expect(result).toContain('## Conventions');
    expect(result).toContain('## Pets');
    expect(result).toContain('## Orders');
  });

  it('uses compact schema notation', () => {
    const result = generateLlmsTxt(sampleSpec);
    // Login body: {email*, password*}
    expect(result).toContain('{email*, password*}');
    // Pet create body has required name/species
    expect(result).toContain('name*');
    expect(result).toContain('species*');
  });

  it('uses compact auth notation', () => {
    const result = generateLlmsTxt(sampleSpec);
    expect(result).toContain('| JWT');
    expect(result).toContain('| JWT|KEY');
    expect(result).toContain('| NONE');
  });

  it('only shows 200 responses', () => {
    const result = generateLlmsTxt(sampleSpec);
    expect(result).toContain('200:');
    expect(result).not.toContain('400:');
    expect(result).not.toContain('401:');
    expect(result).not.toContain('404:');
  });

  it('is significantly smaller than human docs', () => {
    const llms = generateLlmsTxt(sampleSpec);
    const human = generateHumanDocs(sampleSpec);
    // llms.txt should be at most 75% of human docs
    expect(llms.length).toBeLessThan(human.length * 0.75);
  });

  it('respects custom title option', () => {
    const result = generateLlmsTxt(sampleSpec, { title: 'Custom API' });
    expect(result).toContain('# Custom API');
    expect(result).not.toContain('# Pet Store API');
  });

  it('respects custom baseUrl option', () => {
    const result = generateLlmsTxt(sampleSpec, { baseUrl: 'https://custom.api' });
    expect(result).toContain('Base: https://custom.api');
  });

  it('handles empty spec', () => {
    const result = generateLlmsTxt(emptySpec);
    expect(result).toContain('# API');
    expect(result).toContain('## Conventions');
  });

  it('handles minimal spec (no auth, no tags)', () => {
    const result = generateLlmsTxt(minimalSpec);
    expect(result).toContain('# Minimal API');
    expect(result).toContain('Ping');
    expect(result).not.toContain('## Auth Methods');
  });

  it('handles spec with no auth schemes', () => {
    const result = generateLlmsTxt(noAuthSpec);
    expect(result).toContain('# Public API');
    expect(result).toContain('| NONE');
    expect(result).not.toContain('## Auth Methods');
  });

  it('includes query params with compact notation', () => {
    const result = generateLlmsTxt(sampleSpec);
    expect(result).toContain('Query:');
    expect(result).toContain('?page');
    expect(result).toContain('?limit');
  });

  it('includes path params', () => {
    const result = generateLlmsTxt(sampleSpec);
    expect(result).toContain('Path:');
    expect(result).toContain(':petId');
  });
});
