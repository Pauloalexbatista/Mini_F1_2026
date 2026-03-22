const fs = require('fs');

const envId = process.argv[2]; 
const envName = process.argv[3]; 
const scale = parseFloat(process.argv[4] || "12.0");

const content = fs.readFileSync('src/tracks.ts', 'utf8');
const svgPath = fs.readFileSync('temp_path.txt', 'utf8').trim();

const constName = envId.toUpperCase() + '_SVG';
const nodeName = envId.toUpperCase() + '_NODES';

const declaration = `
const ${constName} = "${svgPath}";
export const ${nodeName} = parseSvgToNodes(${constName}, ${scale}, 250);

export const TRACKS: TrackDef[] = [
`;

let injected = content.replace('export const TRACKS: TrackDef[] = [', declaration);

const trackObj = `
  {
    id: '${envId}',
    name: '${envName}',
    nodes: ${nodeName},
  },`;

injected = injected.replace('export const TRACKS: TrackDef[] = [', `export const TRACKS: TrackDef[] = [${trackObj}`);

fs.writeFileSync('src/tracks.ts', injected);
console.log(`Injected ${envId}!`);
