import fetch from 'node-fetch';
import { parseStudioToNodes, fuseAndComputePitLane, parseStudioControlPoints } from './src/tracks.ts';

async function run() {
    console.log("Fetching tracks from API proxy...");
    const req = await fetch('http://localhost:5173/api/tracks');
    const trackData: any = await req.json();
    console.log(`Fetched ${trackData.length} tracks.`);

    if (trackData.length > 0) {
        try {
            console.log("Parsing track data offline...");
            const parsedTracks = trackData.map((t: any) => ({
                id: t.id, name: t.name, 
                nodes: parseStudioToNodes(t.svg_data, 15.0, 250, true),
                pitNodes: fuseAndComputePitLane(
                    parseStudioControlPoints(t.svg_data, 15.0, 250, true), 
                    parseStudioControlPoints(t.pit_svg_data, 15.0, 187.5, false)
                )
            }));
            console.log(`Successfully parsed ${parsedTracks.length} tracks!`);
        } catch (e: any) {
            console.error("FAIL during map!", e.message);
        }
    }
}
run();
