import { describe, expect, it } from 'vitest';
import { handlePing, pingTool } from '../src/tools/ping.js';

describe('ping tool', () => {
  describe('definition', () => {
    it('exposes the correct tool name', () => {
      expect(pingTool.name).toBe('ping');
    });

    it('has a non-empty description', () => {
      expect(pingTool.description).toBeTruthy();
      expect(pingTool.description?.length).toBeGreaterThan(10);
    });

    it('declares an empty input schema', () => {
      expect(pingTool.inputSchema.type).toBe('object');
      expect(pingTool.inputSchema.required).toEqual([]);
    });
  });

  describe('handler', () => {
    it('returns "pong" as text content', async () => {
      const result = await handlePing({});
      expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);
    });

    it('ignores unexpected arguments', async () => {
      const result = await handlePing({ unexpected: 'value' });
      expect(result.content[0]).toMatchObject({ text: 'pong' });
    });
  });
});
