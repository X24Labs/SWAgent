import { describe, it, expect } from 'vitest';
import { generateHumanDocs } from '../core/generators/human-docs.js';
import { sampleSpec, emptySpec, minimalSpec, noAuthSpec } from './fixtures/sample-spec.js';

describe('generateHumanDocs', () => {
  it('generates valid output for sample spec', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('# Pet Store API');
    expect(result).toContain('**Version:** 1.0.0');
    expect(result).toContain('**Base URL:** https://api.petstore.io');
  });

  it('includes table of contents', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('## Table of Contents');
    expect(result).toContain('[Authentication]');
    expect(result).toContain('[Pets]');
    expect(result).toContain('[Orders]');
  });

  it('includes authentication section', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('## Authentication');
    expect(result).toContain('### JWT Bearer Token');
    expect(result).toContain('### API Key');
    expect(result).toContain('Authorization: Bearer <token>');
    expect(result).toContain('X-API-Key:');
  });

  it('includes endpoint details with method and path', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('`GET` /pets');
    expect(result).toContain('`POST` /pets');
    expect(result).toContain('`DELETE` /pets/{petId}');
  });

  it('includes path parameter tables', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('**Path Parameters:**');
    expect(result).toContain('| `petId` |');
  });

  it('includes query parameter tables', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('**Query Parameters:**');
    expect(result).toContain('| `page` |');
    expect(result).toContain('| `limit` |');
  });

  it('includes request body schemas', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('**Request Body:**');
    expect(result).toContain('"email"');
    expect(result).toContain('(required)');
  });

  it('includes response schemas', () => {
    const result = generateHumanDocs(sampleSpec);
    expect(result).toContain('**Response 200:**');
  });

  it('handles empty spec', () => {
    const result = generateHumanDocs(emptySpec);
    expect(result).toContain('# API');
  });

  it('handles minimal spec', () => {
    const result = generateHumanDocs(minimalSpec);
    expect(result).toContain('# Minimal API');
    expect(result).toContain('Ping');
  });

  it('handles spec without auth', () => {
    const result = generateHumanDocs(noAuthSpec);
    expect(result).toContain('# Public API');
    expect(result).not.toContain('## Authentication');
  });

  it('respects custom title', () => {
    const result = generateHumanDocs(sampleSpec, { title: 'My API' });
    expect(result).toContain('# My API');
  });
});
