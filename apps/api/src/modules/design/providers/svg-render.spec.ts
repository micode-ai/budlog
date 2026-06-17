import { renderSchemaSvg } from './svg-render';

describe('renderSchemaSvg', () => {
  it('renders a labelled rect per room and is valid-ish SVG', () => {
    const svg = renderSchemaSvg({
      rooms: [
        { name: 'Kitchen', approxWidthM: 4, approxLengthM: 3 },
        { name: 'Bedroom', approxWidthM: 5, approxLengthM: 4 },
      ],
    });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Kitchen');
    expect(svg).toContain('Bedroom');
    expect((svg.match(/<rect /g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('escapes room names and tolerates a missing/garbage schema', () => {
    const svg = renderSchemaSvg({ rooms: [{ name: '<script>x</script>' }] } as any);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(renderSchemaSvg(null as any)).toMatch(/^<svg /);
    expect(renderSchemaSvg({} as any)).toContain('</svg>');
  });
});
