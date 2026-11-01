export function textToPdf(text: string): Blob {
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines: string[] = [];
  text.replace(/\t/g, '    ').split(/\r?\n/).forEach((raw) => {
    let line = raw;
    do { lines.push(line.slice(0, 90)); line = line.slice(90); } while (line.length);
  });
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 58) pages.push(lines.slice(i, i + 58));
  if (!pages.length) pages.push(['']);
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'
  ];
  pages.forEach((page, i) => {
    const stream = `BT /F1 9 Tf 12 TL 40 800 Td ${page.map((l) => `(${clean(l)}) Tj T*`).join(' ')} ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((obj, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}
