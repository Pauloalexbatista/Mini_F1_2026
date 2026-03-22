const fs = require('fs');
const content = fs.readFileSync('src/tracks.ts', 'utf8');
const svgPath = fs.readFileSync('bahrain_path.txt', 'utf8').trim();

let injected = content.replace('const MONZA_RAW: SplineNode[] = [', `
export function parseSvgToNodes(d: string, scale: number = 1.0, width: number = 200, sampleRate: number = 25): SplineNode[] {
  if (typeof document === 'undefined') return [];
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const length = path.getTotalLength();
  const nodes: SplineNode[] = [];
  
  let minX = Infinity, minY = Infinity;
  for (let i = 0; i < length; i += sampleRate) {
    const pt = path.getPointAtLength(i);
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
  }

  const offsetX = 3000 - minX * scale;
  const offsetY = 3000 - minY * scale;

  for (let i = 0; i < length; i += sampleRate) {
    const pt = path.getPointAtLength(i);
    nodes.push({ x: pt.x * scale + offsetX, y: pt.y * scale + offsetY, width });
  }
  return nodes;
}

const BAHRAIN_SVG = "${svgPath}";
export const BAHRAIN_NODES = parseSvgToNodes(BAHRAIN_SVG, 12.0, 250);

const MONZA_RAW: SplineNode[] = [`);

injected = injected.replace(/export const TRACKS: TrackDef\[\] = \[[\s\S]*?\];/, `export const TRACKS: TrackDef[] = [
  {
    id: 'bahrain',
    name: 'SAKHIR (BAHRAIN)',
    nodes: BAHRAIN_NODES,
  }
];`);

fs.writeFileSync('src/tracks.ts', injected);
console.log("INJECTED!");
