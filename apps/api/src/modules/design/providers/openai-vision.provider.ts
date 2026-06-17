import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';
import { DesignProviderKind } from '@prisma/client';
import { DesignProvider, DesignInput, DesignResult } from './design-provider.interface';
import { renderSchemaSvg } from './svg-render';

const SYSTEM = `You are an architect's assistant. Analyze the floor-plan image (and any requirements) and
return STRICT JSON only (no prose, no markdown) of the form:
{"rooms":[{"name":string,"approxWidthM":number,"approxLengthM":number}],"notes":string}
Dimensions are approximate. If you cannot read the plan, return {"rooms":[],"notes":"<reason>"}.`;

/** MVP design provider — GPT-4o vision → draft schema JSON + a locally-rendered SVG floor plan.
 *  Wrapped with LangSmith tracing (no-op unless LANGSMITH_TRACING is set), mirroring OcrService. */
@Injectable()
export class OpenAiVisionProvider implements DesignProvider {
  readonly name: DesignProviderKind = 'openai';
  private readonly logger = new Logger(OpenAiVisionProvider.name);
  private readonly openai: OpenAI;

  constructor(config: ConfigService) {
    this.openai = wrapOpenAI(new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') }));
  }

  async generate(input: DesignInput): Promise<DesignResult[]> {
    const userParts: any[] = [
      {
        type: 'text',
        text: input.requirements
          ? `Client requirements: ${input.requirements}\nProduce the schema JSON.`
          : 'Produce the schema JSON for this floor plan.',
      },
    ];
    if (input.planImageBase64) {
      userParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.mimeType || 'image/png'};base64,${input.planImageBase64}`,
          detail: 'high',
        },
      });
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userParts },
      ],
      max_tokens: 1200,
    });

    const raw = response.choices[0]?.message?.content || '';
    const schemaData = this.parseSchema(raw);
    const svg = renderSchemaSvg(schemaData.parseError ? { rooms: [] } : schemaData);

    return [
      { kind: 'schema', provider: 'openai', data: schemaData },
      { kind: 'svg', provider: 'openai', data: { svg } },
    ];
  }

  /** Strip ```json fences and parse; on failure return a tolerant {parseError, raw} object. */
  private parseSchema(raw: string): any {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through
    }
    this.logger.warn('Vision output was not valid JSON; storing raw text.');
    return { parseError: true, raw: raw.slice(0, 2000) };
  }
}
