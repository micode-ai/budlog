import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  StateGraph,
  START,
  END,
  interrupt,
  Command,
  Annotation,
} from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { SiteToolsService } from './site-tools.service';
import { ChatContext, ChatResult, PendingAction, ResumeResult } from '../types';

const CHAT_MODEL = 'gpt-4o';

// Graph state: per-message inputs + working fields + terminal result.
const CaptureState = Annotation.Root({
  text: Annotation<string>(),
  accountId: Annotation<string>(),
  userId: Annotation<string>(),
  language: Annotation<string>(),
  activeSiteId: Annotation<string | null>(),
  activeSiteName: Annotation<string | null>(),
  sites: Annotation<{ id: string; name: string }[]>(),
  source: Annotation<'voice' | 'manual' | 'photo'>(),
  actions: Annotation<PendingAction[]>(),
  siteId: Annotation<string | null>(),
  siteName: Annotation<string>(),
  decision: Annotation<'approve' | 'reject' | null>(),
  result: Annotation<ChatResult | null>(),
  saved: Annotation<boolean>(),
});
type CaptureStateT = typeof CaptureState.State;

/**
 * LangGraph capture pipeline: a foreman message becomes journal actions through
 * a stateful graph — `reason` (GPT-4o function calling via LangChain) → `confirm`
 * (human-in-the-loop `interrupt`, state durably checkpointed in Postgres) →
 * `persist`. The bot starts the graph and resumes it on ✅/❌ via the thread id.
 * LangSmith traces every run when LANGSMITH_TRACING is set.
 */
@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);
  private modelWithTools!: ReturnType<ChatOpenAI['bindTools']>;
  private saver!: PostgresSaver;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private graph!: any;

  constructor(
    private readonly config: ConfigService,
    private readonly siteTools: SiteToolsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const model = new ChatOpenAI({
      model: CHAT_MODEL,
      temperature: 0.2,
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    this.modelWithTools = model.bindTools(this.siteTools.getToolDefinitions());

    try {
      // Keep the checkpointer tables in their own schema so they don't collide
      // with the Prisma-managed `public` schema (which would show up as drift).
      this.saver = PostgresSaver.fromConnString(
        this.config.get<string>('DATABASE_URL') as string,
        { schema: 'langgraph' },
      );
      await this.saver.setup();
      this.graph = this.buildGraph();
      this.logger.log('LangGraph capture pipeline ready (Postgres checkpointer)');
    } catch (err) {
      this.logger.error(`Failed to init LangGraph checkpointer: ${err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.saver?.end?.();
  }

  /** Run capture for a new message. Returns a terminal result, or a `confirm`
   * carrying the thread id to resume after the foreman taps ✅/❌. */
  async start(
    text: string,
    ctx: ChatContext,
    source: 'voice' | 'manual' | 'photo',
  ): Promise<ChatResult> {
    const threadId = randomBytes(8).toString('hex');
    const cfg = { configurable: { thread_id: threadId } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await this.graph.invoke(
      {
        text,
        accountId: ctx.accountId,
        userId: ctx.userId,
        language: ctx.language,
        activeSiteId: ctx.activeSiteId,
        activeSiteName: ctx.activeSiteName,
        sites: ctx.sites,
        source,
      },
      cfg,
    );

    const pending = r.__interrupt__?.[0]?.value;
    if (pending) {
      return {
        kind: 'confirm',
        threadId,
        actions: pending.actions,
        siteId: pending.siteId,
        siteName: pending.siteName,
      };
    }
    return r.result as ChatResult;
  }

  /** Resume a paused capture graph with the foreman's decision. */
  async resume(threadId: string, decision: 'approve' | 'reject'): Promise<ResumeResult> {
    const cfg = { configurable: { thread_id: threadId } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await this.graph.invoke(new Command({ resume: decision }), cfg);
    return { saved: !!r.saved, siteId: r.siteId ?? null, siteName: r.siteName ?? '' };
  }

  // ── graph ──

  private buildGraph() {
    const reason = async (state: CaptureStateT): Promise<Partial<CaptureStateT>> => {
      const ai = await this.modelWithTools.invoke([
        new SystemMessage(this.buildSystemPrompt(state)),
        new HumanMessage(state.text),
      ]);
      const toolCalls = (ai.tool_calls ?? []) as { name?: string; args?: Record<string, unknown> }[];
      const replyText = (typeof ai.content === 'string' ? ai.content : '').trim() || '🤔';

      if (toolCalls.length === 0) {
        return { result: { kind: 'reply', text: replyText } };
      }

      const { actions, setActiveSiteName } = this.siteTools.parseLangchainToolCalls(toolCalls);
      const stamped = actions.map((a) =>
        a.type === 'work' ? { ...a, source: state.source } : a,
      );
      const resolved = setActiveSiteName
        ? this.siteTools.resolveSite(state.sites, setActiveSiteName)
        : null;

      if (stamped.length > 0) {
        const targetSiteId = resolved?.id ?? state.activeSiteId;
        if (!targetSiteId) {
          return {
            result:
              setActiveSiteName && !resolved
                ? { kind: 'unknown_site', requested: setActiveSiteName }
                : { kind: 'need_active_site' },
          };
        }
        const siteName = state.sites.find((s) => s.id === targetSiteId)?.name ?? '';
        return { actions: stamped, siteId: targetSiteId, siteName };
      }

      if (setActiveSiteName) {
        return {
          result: resolved
            ? { kind: 'set_active_site', siteId: resolved.id, siteName: resolved.name }
            : { kind: 'unknown_site', requested: setActiveSiteName },
        };
      }
      return { result: { kind: 'reply', text: replyText } };
    };

    const confirm = (state: CaptureStateT): Partial<CaptureStateT> => {
      // Pauses the graph; state is checkpointed until the bot resumes with a decision.
      const decision = interrupt({
        actions: state.actions,
        siteId: state.siteId,
        siteName: state.siteName,
      }) as 'approve' | 'reject';
      return { decision };
    };

    const persist = async (state: CaptureStateT): Promise<Partial<CaptureStateT>> => {
      for (const action of state.actions) {
        await this.siteTools.executeAction(action, {
          accountId: state.accountId,
          userId: state.userId,
          siteId: state.siteId as string,
        });
      }
      return { saved: true };
    };

    return new StateGraph(CaptureState)
      .addNode('reason', reason)
      .addNode('confirm', confirm)
      .addNode('persist', persist)
      .addEdge(START, 'reason')
      .addConditionalEdges('reason', (s: CaptureStateT) =>
        s.actions && s.actions.length > 0 ? 'confirm' : END,
      )
      .addConditionalEdges('confirm', (s: CaptureStateT) =>
        s.decision === 'approve' ? 'persist' : END,
      )
      .addEdge('persist', END)
      .compile({ checkpointer: this.saver });
  }

  private buildSystemPrompt(state: CaptureStateT): string {
    const today = new Date().toISOString().slice(0, 10);
    const siteList = state.sites?.length
      ? state.sites.map((s) => `- ${s.name}`).join('\n')
      : '(no sites yet)';
    return [
      'You are BudLog, an assistant that keeps a construction site journal for a foreman.',
      `Today's date is ${today}.`,
      `Active site: ${state.activeSiteName ?? 'none selected'}.`,
      "The foreman's sites:",
      siteList,
      '',
      'When the foreman reports work done, materials used/delivered, or plans for upcoming days, call the matching tool.',
      'If a single message mixes an activity and material quantities, use log_work_with_materials.',
      'Never invent quantities or dates — if a date is not stated, omit it (the system defaults to today, or tomorrow for plans).',
      `If the message is just conversation or a question, answer briefly and in the user's language ("${state.language}").`,
      `Always write any free-text reply in the user's language ("${state.language}").`,
    ].join('\n');
  }
}
