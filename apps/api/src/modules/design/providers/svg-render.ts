interface SchemaRoom {
  name?: string;
  approxWidthM?: number;
  approxLengthM?: number;
}
interface DesignSchema {
  rooms?: SchemaRoom[];
  notes?: string;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string),
  );
}

/** Pure renderer: lays each room out as a scaled rectangle in a simple wrapping grid with a label.
 *  Tolerant of missing/garbage input — always returns a well-formed <svg> string, never throws. */
export function renderSchemaSvg(schema: DesignSchema | null | undefined): string {
  const rooms = Array.isArray(schema?.rooms) ? (schema!.rooms as SchemaRoom[]) : [];
  const pad = 16;
  const scale = 28;
  const cols = Math.max(1, Math.ceil(Math.sqrt(rooms.length || 1)));
  const cellW = 5 * scale + pad;
  const cellH = 5 * scale + pad + 16;
  const rects: string[] = [];

  rooms.forEach((room, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = Math.min(5, Math.max(1, Number(room.approxWidthM) || 3)) * scale;
    const h = Math.min(5, Math.max(1, Number(room.approxLengthM) || 3)) * scale;
    const x = pad + col * cellW;
    const y = pad + row * cellH;
    const label = escapeXml(String(room.name ?? `Room ${i + 1}`)).slice(0, 40);
    rects.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3f4f6" stroke="#374151" stroke-width="2"/>` +
        `<text x="${x + 6}" y="${y + 18}" font-family="sans-serif" font-size="13" fill="#111827">${label}</text>`,
    );
  });

  const totalRows = Math.max(1, Math.ceil((rooms.length || 1) / cols));
  const width = pad + cols * cellW;
  const height = pad + totalRows * cellH + 24;
  const note = schema?.notes ? escapeXml(String(schema.notes)).slice(0, 120) : 'Draft — dimensions approximate';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    rects.join('') +
    `<text x="${pad}" y="${height - 8}" font-family="sans-serif" font-size="11" fill="#6b7280">${note}</text>` +
    `</svg>`
  );
}
