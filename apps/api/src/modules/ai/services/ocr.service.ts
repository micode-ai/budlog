import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';

/**
 * Vision text extraction — the domain-agnostic `extractTextFromImage`.
 * Used in Phase 2 to read text off
 * delivery-note photos; structured delivery-note parsing comes later.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    // wrapOpenAI adds LangSmith tracing when LANGSMITH_TRACING is set; no-op otherwise.
    this.openai = wrapOpenAI(
      new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') }),
    );
  }

  async extractTextFromImage(imageBase64: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract and return ALL text visible in this image. Return plain text only, preserving the layout as much as possible.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    });

    return response.choices[0]?.message?.content || '';
  }
}
