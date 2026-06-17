import { OpenAiVisionProvider } from './openai-vision.provider';

function makeProvider(content: string) {
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const config: any = { get: () => 'sk-test' };
  const provider = new OpenAiVisionProvider(config);
  (provider as any).openai = { chat: { completions: { create } } };
  return { provider, create };
}

describe('OpenAiVisionProvider', () => {
  it('parses a JSON schema and returns schema + svg artifacts', async () => {
    const { provider, create } = makeProvider(
      '```json\n{"rooms":[{"name":"Kitchen","approxWidthM":4,"approxLengthM":3}],"notes":"draft"}\n```',
    );
    const results = await provider.generate({ planImageBase64: 'AAAA', mimeType: 'image/png' });
    expect(create).toHaveBeenCalled();
    const schema = results.find((r) => r.kind === 'schema');
    const svg = results.find((r) => r.kind === 'svg');
    expect(schema).toBeDefined();
    expect((schema!.data as any).rooms[0].name).toBe('Kitchen');
    expect(schema!.provider).toBe('openai');
    expect(svg).toBeDefined();
    expect((svg!.data as any).svg).toContain('Kitchen');
  });

  it('tolerates non-JSON output (stores raw text, still emits an svg)', async () => {
    const { provider } = makeProvider('I could not read this plan.');
    const results = await provider.generate({ planImageBase64: 'AAAA', mimeType: 'image/png' });
    const schema = results.find((r) => r.kind === 'schema')!;
    expect((schema.data as any).parseError).toBe(true);
    expect((schema.data as any).raw).toContain('could not read');
    expect(results.find((r) => r.kind === 'svg')).toBeDefined();
  });

  it('sends the image when present and the requirements text', async () => {
    const { provider, create } = makeProvider('{"rooms":[]}');
    await provider.generate({ planImageBase64: 'IMG', mimeType: 'image/png', requirements: '3 bedrooms' });
    const arg = create.mock.calls[0][0];
    const parts = arg.messages[arg.messages.length - 1].content;
    const hasImage = parts.some((p: any) => p.type === 'image_url' && p.image_url.url.includes('IMG'));
    const hasReq = JSON.stringify(parts).includes('3 bedrooms');
    expect(hasImage).toBe(true);
    expect(hasReq).toBe(true);
  });
});
