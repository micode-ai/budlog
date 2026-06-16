import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';

/**
 * Voice → text via OpenAI Whisper. Domain-agnostic.
 */
@Injectable()
export class WhisperService {
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    // wrapOpenAI adds LangSmith tracing when LANGSMITH_TRACING is set; no-op otherwise.
    this.openai = wrapOpenAI(
      new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') }),
    );
  }

  async transcribe(
    audioBuffer: Buffer,
    language?: string,
    mimeType?: string,
  ): Promise<{ text: string; language: string; duration: number }> {
    const detectedMime = mimeType || this.detectMimeType(audioBuffer);
    const ext = this.mimeToExt(detectedMime);

    const arrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: detectedMime });
    const file = new File([blob], `audio.${ext}`, { type: detectedMime });

    const response = await this.openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: language || undefined,
      response_format: 'verbose_json',
    });

    return {
      text: response.text,
      language: response.language || language || 'en',
      duration: response.duration || 0,
    };
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer.length < 12) return 'audio/m4a';
    if (buffer.slice(4, 8).toString() === 'ftyp') return 'audio/m4a';
    if (buffer.slice(0, 4).toString() === 'RIFF') return 'audio/wav';
    if (buffer.slice(0, 4).toString() === 'OggS') return 'audio/ogg';
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)
      return 'audio/webm';
    if (
      buffer.slice(0, 3).toString() === 'ID3' ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    )
      return 'audio/mpeg';
    if (buffer.slice(0, 4).toString() === 'fLaC') return 'audio/flac';
    return 'audio/m4a';
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/flac': 'flac',
    };
    return map[mime] || 'm4a';
  }
}
