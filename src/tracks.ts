export interface SplineNode {
  x: number;
  y: number;
  width: number;
  nodeIndex?: number;
  distFromStart?: number;
  isTight?: boolean;
  isApexTight?: boolean;
  isExtendedTight?: boolean;
  maxWallRadius?: number;
}

export interface TrackDef {
  id: string;
  name: string;
  nodes: SplineNode[];
  pitNodes?: SplineNode[];
  drsZones?: { start: number; end: number }[];
  svg_data?: string;
  pit_svg_data?: string;
}

// Catmull-Rom Spline Interpolation for smooth tracks
export function computeSpline(nodes: SplineNode[], isClosed = true, pStartTangent?: SplineNode, pEndTangent?: SplineNode): SplineNode[] {
  if (nodes.length < 2) return nodes;

  const spline: SplineNode[] = [];
  const len = nodes.length;
  let runningDist = 0;
  // An open spline has (len - 1) segments between nodes.
  const numSegments = isClosed ? len : len - 1;

  for (let i = 0; i < numSegments; i++) {
    // Duplicate end-nodes for tangents if the path is open, OR use injected C1 perfectly continuous tangents!
    const p0 = isClosed ? nodes[(i - 1 + len) % len] : (i === 0 && pStartTangent ? pStartTangent : nodes[Math.max(0, i - 1)]);
    const p1 = nodes[i];
    const p2 = isClosed ? nodes[(i + 1) % len] : nodes[i + 1];
    const p3 = isClosed ? nodes[(i + 2) % len] : (i === numSegments - 1 && pEndTangent ? pEndTangent : nodes[Math.min(len - 1, i + 2)]);

    // Calculate physical distance to ensure uniform density curves!
    const dist = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
    // 1 point strictly every 20 pixels for high-res curve tracking.
    const steps = Math.max(10, Math.floor(dist / 20));

    for (let t = 0; t < 1; t += 1 / steps) {
      const t2 = t * t;
      const t3 = t2 * t;

      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );

      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );

      // Interpolate width linearly along the segment
      const width = p1.width + (p2.width - p1.width) * t;

      if (spline.length > 0) {
          const last = spline[spline.length - 1];
          runningDist += Math.sqrt((x - last.x)**2 + (y - last.y)**2);
      }
      spline.push({ x, y, width, nodeIndex: i, distFromStart: runningDist });
    }
  }

  // ==========================================
  // O(N^2) VORONOI WALL SQUEEZING CALCULATION
  // Se aproximares pistas, reduz a relva para Muro Limpo (Street Circuit mode!)
  // ==========================================
  const totalLen = isClosed ? (spline[spline.length - 1]?.distFromStart || 0) : 0;
  for (let i = 0; i < spline.length; i++) {
        let minOtherDistSq = Infinity;
        for (let j = 0; j < spline.length; j++) {
             // Use physical path length instead of array indices to protect extremely tight hairpins
             let d1 = spline[i].distFromStart || 0;
             let d2 = spline[j].distFromStart || 0;
             let pathDist = Math.abs(d1 - d2);
             if (isClosed && pathDist > totalLen / 2) pathDist = totalLen - pathDist;
             
             const distSq = (spline[i].x - spline[j].x)**2 + (spline[i].y - spline[j].y)**2;
             const physicalD = Math.sqrt(distSq);
             
             // SEGREDOS DOS HAIRPINS: Uma reta não se deve aniquilar a si mesma!
             // Só medimos perigo se for outra pista vizinha longe (pathDist > 1000) 
             // OU se for um gancho apertado onde a fita andou mais 1.5x do que o voo do pássaro!
             if (pathDist > 1000 || (pathDist > 150 && pathDist > physicalD * 1.5)) {
                 if (distSq < minOtherDistSq) minOtherDistSq = distSq;
             }
        }
        
        const standardMaxR = spline[i].width * 1.70; // 425px limit as documented
        // Baseamos no 1.70w puro. Mas se um vizinho fechar o cerco, o Muro de Betão encolhe cortando a relva!
        spline[i].maxWallRadius = Math.max(spline[i].width * 0.70, Math.min(standardMaxR, (Math.sqrt(minOtherDistSq) / 2) - 2));
  }

  // ==========================================
  // O(N) GEOMETRY PRE-CALCULATION FOR 60FPS Rescue!
  // ==========================================
  for (let i = 0; i < spline.length; i++) {
        const pIdx = isClosed ? (i - 5 + spline.length) % spline.length : Math.max(0, i - 5);
        const nIdx = isClosed ? (i + 5) % spline.length : Math.min(spline.length - 1, i + 5);
        const prev = spline[pIdx];
        const curr = spline[i];
        const next = spline[nIdx];
        
        if (pIdx === i || nIdx === i) continue;

        let a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        let a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
        let diff = a2 - a1;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        
        if (Math.abs(diff) > 0.02) spline[i].isTight = true;
  }

  // Helper to flag distance-based zones mathematically
  const flagZones = (range: number, flagProp: 'isApexTight' | 'isExtendedTight') => {
      let lastTightDist = -10000;
      for (let i = 0; i < spline.length; i++) {
            const d = spline[i].distFromStart || 0;
            if (spline[i].isTight) lastTightDist = d;
            if (d - lastTightDist <= range) spline[i][flagProp] = true;
      }
      lastTightDist = 1000000;
      for (let i = spline.length - 1; i >= 0; i--) {
            const d = spline[i].distFromStart || 0;
            if (spline[i].isTight) lastTightDist = d;
            if (lastTightDist - d <= range) spline[i][flagProp] = true;
      }
      
      if (isClosed) {
          const totalLen = spline[spline.length - 1].distFromStart || 0;
          lastTightDist = -10000;
          for(let i=spline.length-1; i>=0; i--) {
             if (spline[i].isTight) {
                 lastTightDist = (spline[i].distFromStart || 0) - totalLen;
                 break;
             }
          }
          for (let i = 0; i < spline.length; i++) {
                const d = spline[i].distFromStart || 0;
                if (d - lastTightDist <= range) spline[i][flagProp] = true;
          }
          lastTightDist = 1000000;
          for(let i=0; i<spline.length; i++) {
             if (spline[i].isTight) {
                 lastTightDist = (spline[i].distFromStart || 0) + totalLen;
                 break;
             }
          }
          for (let i = spline.length - 1; i >= 0; i--) {
                const d = spline[i].distFromStart || 0;
                if (lastTightDist - d <= range) spline[i][flagProp] = true;
          }
      }
  };

  // 1: Zonas Amarelas (-20% grip, 500px de distância de aviso)
  flagZones(500, 'isExtendedTight');
  
  // 2: Zonas de Apex Brutal (-30% grip, 100px no coração do gancho)
  flagZones(100, 'isApexTight');

  return spline;
}

export function parseSvgToNodes(d: string, scale: number = 1.0, width: number = 200, sampleRate: number = 25): SplineNode[] {
  if (typeof document === 'undefined') return [];
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const length = path.getTotalLength();
  const nodes: SplineNode[] = [];
  
  const WORLD_OFFSET_X = 2000;
  const WORLD_OFFSET_Y = 2000;

  for (let i = 0; i < length; i += sampleRate) {
    const pt = path.getPointAtLength(i);
    nodes.push({ x: pt.x * scale + WORLD_OFFSET_X, y: pt.y * scale + WORLD_OFFSET_Y, width });
  }
  return nodes;
}

export function parseStudioControlPoints(d: string, scale: number = 15.0, width: number = 200, isClosed: boolean = true): SplineNode[] {
  const regex = /([ML])\s*([0-9\.-]+),([0-9\.-]+)/g;
  const controlPoints: SplineNode[] = [];
  const WORLD_OFFSET_X = 2000;
  const WORLD_OFFSET_Y = 2000;

  let match;
  while ((match = regex.exec(d)) !== null) {
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    controlPoints.push({ x: x * scale + WORLD_OFFSET_X, y: y * scale + WORLD_OFFSET_Y, width });
  }

  if (controlPoints.length < 2) return [];

  if (isClosed && controlPoints.length > 2) {
    const first = controlPoints[0];
    const last = controlPoints[controlPoints.length - 1];
    const distSq = (last.x - first.x)**2 + (last.y - first.y)**2;
    if (distSq < (30 * scale)**2) {
       controlPoints.pop();
    }
  }
  return controlPoints;
}

export function parseStudioToNodes(d: string, scale: number = 15.0, width: number = 200, isClosed: boolean = true): SplineNode[] {
  const cps = parseStudioControlPoints(d, scale, width, isClosed);
  return computeSpline(cps, isClosed);
}

export function fuseAndComputePitLane(mainCP: SplineNode[], pitCP: SplineNode[]): SplineNode[] {
   if (pitCP.length < 2) return [];
   
   let startTangent: SplineNode | undefined = undefined;
   let endTangent: SplineNode | undefined = undefined;

   // C1 Continuity Merger!
   // Procuramos se o Ponto 0 ou Ponto Final do Pit Lane dão exato "match" (Magnetic Snap > 2px distSq) num ponto da Main Track.
   // Se sim, herdamos a tangente Matemática (o ponto de controlo exatamente atrás/à frente) criando a saída de autoestrada perfeita!
   if (mainCP.length > 2) {
       for (let i = 0; i < mainCP.length; i++) {
           const dSqStart = (mainCP[i].x - pitCP[0].x)**2 + (mainCP[i].y - pitCP[0].y)**2;
           if (dSqStart < 4) {
               startTangent = mainCP[(i - 1 + mainCP.length) % mainCP.length];
           }
           
           const endDistSq = (mainCP[i].x - pitCP[pitCP.length - 1].x)**2 + (mainCP[i].y - pitCP[pitCP.length - 1].y)**2;
           if (endDistSq < 4) {
               endTangent = mainCP[(i + 1) % mainCP.length];
           }
       }
   }

   return computeSpline(pitCP, false, startTangent, endTangent);
}


export interface TrackTelemetry {
  lengthKm: string;
  corners: number;
  straightsPercent: number;
  curvesPercent: number;
  topSpeedKmh: number;
  minCornerKmh: number;
}

export function getTrackTelemetry(nodes: SplineNode[]): TrackTelemetry {
  if (!nodes || nodes.length === 0) {
     return { lengthKm: "0.0", corners: 0, straightsPercent: 0, curvesPercent: 0, topSpeedKmh: 0, minCornerKmh: 0 };
  }

  let totalDistPx = 0;
  let tightNodesCount = 0;
  let straightNodesCount = 0;
  let cornersCount = 0;
  
  let isCurrentlyInCorner = false;
  let minCornerKmh = 999;
  
  for (let i = 0; i < nodes.length; i++) {
     const curr = nodes[i];
     const next = nodes[(i + 1) % nodes.length];
     const dist = Math.sqrt((next.x - curr.x)**2 + (next.y - curr.y)**2);
     totalDistPx += dist;

     // Angular difference
     const prev = nodes[(i - 1 + nodes.length) % nodes.length];
     const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
     const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
     let angleDiff = a2 - a1;
     angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
     
     const absDiff = Math.abs(angleDiff);

     if (absDiff > 0.05) {
        tightNodesCount++;
        if (!isCurrentlyInCorner) {
            cornersCount++;
            isCurrentlyInCorner = true;
        }

        // Simulate F1 speed formula logic:
        const maxSpeedPx = 900; // Base 100% car Top Speed
        const penaltyByAngle = Math.max(0, absDiff - 0.05);
        const safeSpeedPx = maxSpeedPx * Math.max(0.15, 1.0 - (penaltyByAngle * 3.5));
        const safeKmh = Math.ceil(safeSpeedPx * 0.36);
        if (safeKmh < minCornerKmh) minCornerKmh = safeKmh;

     } else {
        straightNodesCount++;
        isCurrentlyInCorner = false;
     }
  }

  // F1 Scale: Let's assume 10px = 1m
  const lengthKm = (totalDistPx / 10 / 1000).toFixed(2);

  const totalNodes = tightNodesCount + straightNodesCount;
  const curvesPercent = Math.round((tightNodesCount / totalNodes) * 100);
  const straightsPercent = Math.round((straightNodesCount / totalNodes) * 100);

  // Find longest straight to estimate top speed
  let currentStraightLen = 0;
  let maxStraightLen = 0;
  
  // Double loop to catch wraparound straights running through Start/Finish line
  for (let i = 0; i < nodes.length * 2; i++) {
      const idx = i % nodes.length;
      const curr = nodes[idx];
      const prev = nodes[(idx - 1 + nodes.length) % nodes.length];
      const next = nodes[(idx + 1) % nodes.length];
      
      const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
      let diff = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
      
      if (Math.abs(diff) <= 0.05) { 
         const dist = Math.sqrt((next.x - curr.x)**2 + (next.y - curr.y)**2);
         currentStraightLen += dist;
         if (currentStraightLen > maxStraightLen) maxStraightLen = currentStraightLen;
      } else {
         currentStraightLen = 0;
      }
  }

  // Max Straight in pixels.
  // V = sqrt(V0^2 + 2 * a * d)
  // Assume generic V0 coming out of the previous corner = 130 km/h = 361 px/s
  // Assume generic F1 Engine Power Acceleration = 380 px/s^2
  const V0_px = 361; 
  let topSpeedPx = Math.sqrt(V0_px**2 + 2 * 380 * maxStraightLen);
  
  if (topSpeedPx > 950) {
      // DRS / Slipstream bonus scaling (Maxes around 365km/h)
      topSpeedPx = 950 + (maxStraightLen / 10000) * 50; 
  }
  
  let topSpeedKmh = Math.min(365, Math.ceil(topSpeedPx * 0.36));
  
  // Fallbacks
  if (minCornerKmh === 999) minCornerKmh = topSpeedKmh;
  if (minCornerKmh > topSpeedKmh) minCornerKmh = topSpeedKmh - 50;
  if (lengthKm === "0.00") topSpeedKmh = 0;

  return {
     lengthKm,
     corners: cornersCount,
     straightsPercent,
     curvesPercent,
     topSpeedKmh: topSpeedKmh || 0,
     minCornerKmh: minCornerKmh || 0
  };
}


// ======================================
// TRACKS DATABASE
// ======================================

const MELBOURNE_SVG = "M 560,441 L 417,442 L 378,400 L 282,404 L 127,375 L 153,323 L 80,252 L 126,98 L 181,94 L 242,50 L 360,129 L 453,253 L 600,272 L 644,224 L 773,222 L 913,292 L 867,390 L 765,365 L 763,395 L 761,445 L 560,442 Z";
const MELBOURNE_PIT_SVG = "M 763,395 L 733,416 L 481,415 L 417,442";


const OVAL_SVG = "M 300,150 L 350,150 L 650,150 L 700,150 L 780,180 L 830,240 L 850,300 L 830,360 L 780,420 L 700,450 L 650,450 L 350,450 L 300,450 L 220,420 L 170,360 L 150,300 L 170,240 L 220,180 Z";
const OVAL_PIT_SVG = "M 830,360 L 750,400 L 700,400 L 300,400 L 250,400 L 170,360";

export const TRACKS: TrackDef[] = [
  {
    id: 'oval_test',
    name: 'OVAL TEST TRACK',
    nodes: parseStudioToNodes(OVAL_SVG, 15.0, 250, true),
    pitNodes: fuseAndComputePitLane(
        parseStudioControlPoints(OVAL_SVG, 15.0, 250, true),
        parseStudioControlPoints(OVAL_PIT_SVG, 15.0, 187.5, false)
    ),
    svg_data: OVAL_SVG,
    pit_svg_data: OVAL_PIT_SVG
  },
  {
    id: 'melbourne',
    name: 'MELBOURNE (GRAND PRIX)',
    nodes: parseStudioToNodes(MELBOURNE_SVG, 15.0, 250, true),
    pitNodes: fuseAndComputePitLane(
        parseStudioControlPoints(MELBOURNE_SVG, 15.0, 250, true),
        parseStudioControlPoints(MELBOURNE_PIT_SVG, 15.0, 187.5, false)
    ),
    svg_data: MELBOURNE_SVG,
    pit_svg_data: MELBOURNE_PIT_SVG
  },
];
