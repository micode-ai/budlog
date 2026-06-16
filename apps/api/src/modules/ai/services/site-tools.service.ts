import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SitesService } from '../../sites/sites.service';
import { PendingAction, ParsedToolCalls } from '../types';

/**
 * Construction function-calling tools for the foreman bot. Mirrors the ABA
 * ai-tools pattern but maps to the site journal instead of finance entities.
 *
 * Pure parsing (`parseToolCalls`) is separated from persistence (`executeAction`)
 * so the LLM-output → service-call mapping is unit-testable without OpenAI.
 */
@Injectable()
export class SiteToolsService {
  constructor(private readonly sites: SitesService) {}

  getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'log_work',
          description:
            'Record work done on the construction site. Use when the foreman describes an activity performed (e.g. "poured the foundation", "finished drywall on 2nd floor").',
          parameters: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'What work was done' },
              workDate: {
                type: 'string',
                description: 'ISO date (YYYY-MM-DD). Default to today if not stated.',
              },
            },
            required: ['description'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'log_materials',
          description:
            'Record materials used/delivered on the site. Use when the foreman mentions quantities of materials (e.g. "40 bags of cement", "2 pallets of brick").',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Material name' },
                    quantity: { type: 'number', description: 'Amount used' },
                    unit: { type: 'string', description: 'Unit, e.g. bags, m3, pcs, kg' },
                  },
                  required: ['name', 'quantity'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'log_work_with_materials',
          description:
            'Record work AND the materials it consumed in one go. Use when a single utterance mixes an activity with material quantities (e.g. "poured the foundation, used 40 bags of cement").',
          parameters: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'What work was done' },
              workDate: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                  },
                  required: ['name', 'quantity'],
                },
              },
            },
            required: ['description', 'items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'plan_next',
          description:
            'Record a plan for upcoming work (e.g. "electrician comes tomorrow", "pour the slab on Friday").',
          parameters: {
            type: 'object',
            properties: {
              note: { type: 'string', description: 'The planned activity' },
              forDate: {
                type: 'string',
                description: 'ISO date (YYYY-MM-DD) the plan is for. Default tomorrow.',
              },
            },
            required: ['note'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_active_site',
          description:
            'Switch the active construction site by name. Use when the foreman says they are now working on a different site (e.g. "switch to Dom Kowalski").',
          parameters: {
            type: 'object',
            properties: {
              siteName: { type: 'string', description: 'The site to switch to' },
            },
            required: ['siteName'],
          },
        },
      },
    ];
  }

  /**
   * Pure transform of OpenAI tool calls into structured actions + an optional
   * site switch. No I/O — unit-tested directly.
   */
  parseToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  ): ParsedToolCalls {
    const actions: PendingAction[] = [];
    let setActiveSiteName: string | undefined;

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        continue;
      }
      const name = this.applyCall(call.function.name, args, actions);
      if (name) setActiveSiteName = name;
    }

    return { actions, setActiveSiteName };
  }

  /**
   * Same transform for LangChain/LangGraph tool calls (args already an object).
   * Used by the LangGraph capture flow.
   */
  parseLangchainToolCalls(
    toolCalls: { name?: string; args?: Record<string, unknown> }[],
  ): ParsedToolCalls {
    const actions: PendingAction[] = [];
    let setActiveSiteName: string | undefined;
    for (const call of toolCalls || []) {
      if (!call?.name) continue;
      const name = this.applyCall(call.name, call.args || {}, actions);
      if (name) setActiveSiteName = name;
    }
    return { actions, setActiveSiteName };
  }

  /**
   * Shape-agnostic core: maps one tool call (name + parsed args) into pending
   * actions; returns a site name if it was a `set_active_site` call.
   */
  private applyCall(
    name: string,
    args: Record<string, unknown>,
    actions: PendingAction[],
  ): string | undefined {
    switch (name) {
      case 'set_active_site':
        return typeof args.siteName === 'string' ? args.siteName : undefined;
      case 'log_work':
        if (typeof args.description === 'string') {
          actions.push({
            type: 'work',
            description: args.description,
            workDate: typeof args.workDate === 'string' ? args.workDate : undefined,
            source: 'voice',
          });
        }
        return undefined;
      case 'log_materials':
        actions.push(...this.parseItems(args.items));
        return undefined;
      case 'log_work_with_materials':
        if (typeof args.description === 'string') {
          actions.push({
            type: 'work',
            description: args.description,
            workDate: typeof args.workDate === 'string' ? args.workDate : undefined,
            source: 'voice',
          });
        }
        actions.push(...this.parseItems(args.items));
        return undefined;
      case 'plan_next':
        if (typeof args.note === 'string') {
          actions.push({
            type: 'plan',
            note: args.note,
            forDate: typeof args.forDate === 'string' ? args.forDate : undefined,
          });
        }
        return undefined;
      default:
        return undefined;
    }
  }

  private parseItems(raw: unknown): PendingAction[] {
    if (!Array.isArray(raw)) return [];
    const out: PendingAction[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item.name === 'string' &&
        typeof item.quantity === 'number'
      ) {
        out.push({
          type: 'material',
          name: item.name,
          quantity: item.quantity,
          unit: typeof item.unit === 'string' ? item.unit : undefined,
        });
      }
    }
    return out;
  }

  /** Case-insensitive fuzzy match of a spoken site name against the account's sites. */
  resolveSite(
    sites: { id: string; name: string }[],
    spokenName: string,
  ): { id: string; name: string } | null {
    const needle = spokenName.trim().toLowerCase();
    if (!needle) return null;
    return (
      sites.find((s) => s.name.toLowerCase() === needle) ||
      sites.find((s) => s.name.toLowerCase().includes(needle)) ||
      sites.find((s) => needle.includes(s.name.toLowerCase())) ||
      null
    );
  }

  /**
   * Persist one confirmed action against a concrete site. Work-with-materials is
   * split into a work entry plus material entries linked to it.
   */
  async executeAction(
    action: PendingAction,
    ctx: { accountId: string; userId: string; siteId: string },
  ): Promise<void> {
    const { accountId, userId, siteId } = ctx;
    switch (action.type) {
      case 'work':
        await this.sites.addWorkEntry(accountId, userId, {
          siteId,
          description: action.description,
          workDate: action.workDate,
          source: action.source,
        });
        break;
      case 'material':
        await this.sites.addMaterialEntry(accountId, userId, {
          siteId,
          name: action.name,
          quantity: action.quantity,
          unit: action.unit,
        });
        break;
      case 'plan':
        await this.sites.addWorkEntry(accountId, userId, {
          siteId,
          description: action.note,
          workDate: action.forDate ?? this.tomorrowIso(),
          source: 'manual',
        });
        break;
    }
  }

  private tomorrowIso(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
}
