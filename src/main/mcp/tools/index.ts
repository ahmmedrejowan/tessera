/**
 * Everything an agent can do, gathered from the groups. A tool is written once: the server offers
 * it, the tools page lists it, the skill file is written from it, and the history names it.
 */
import { BRING } from './bring';
import { DANGER } from './danger';
import { LINK } from './link';
import { ORGANISE } from './organise';
import { READ } from './read';
import { REMOVE } from './remove';
import { SYSTEM } from './system';
import { z } from 'zod';
import type { Tool } from './shared';

export type { Tool, ToolContext } from './shared';

export const TOOLS: Tool[] = [...READ, ...ORGANISE, ...LINK, ...BRING, ...REMOVE, ...SYSTEM, ...DANGER];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** The catalogue as the window and the skill file see it. */
export const toolCatalogue = () =>
  TOOLS.map((t) => ({
    name: t.name,
    group: t.group,
    title: t.title,
    summary: t.summary,
    schema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>,
  }));
