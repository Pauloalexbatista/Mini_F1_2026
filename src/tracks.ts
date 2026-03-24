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
  isBridge?: boolean;
  isTunnel?: boolean;
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
  const minDists = new Array(spline.length).fill(Infinity);
  
  for (let i = 0; i < spline.length; i++) {
        for (let j = 0; j < spline.length; j++) {
             // Use physical path length instead of array indices to protect extremely tight hairpins
             let d1 = spline[i].distFromStart || 0;
             let d2 = spline[j].distFromStart || 0;
             let pathDist = Math.abs(d1 - d2);
             if (isClosed && pathDist > totalLen / 2) pathDist = totalLen - pathDist;
             
             const distSq = (spline[i].x - spline[j].x)**2 + (spline[i].y - spline[j].y)**2;
             const physicalD = Math.sqrt(distSq);
             
             // SEGREDOS DOS HAIRPINS: Uma reta não se deve aniquilar a si mesma!
             // Só medimos perigo se for outra pista vizinha longe (pathDist > 800) 
             // O limite arbitrário das chicanes apertadas foi removido para permitir Bermas e Relva puras.
             if (pathDist > 800) {
                 if (distSq < minDists[i]) minDists[i] = distSq;
             }
             
             // DETEÇÃO DE PONTES Z-INDEX E TÚNEIS (Suzuka Mode)
             // Se duas retas se cruzam cruamente (physicalD < 80) e estão a léguas de distância cronológica, é um cruzamento 3D!
             if (i > j && pathDist > 1000 && physicalD < 100) {
                 // A linha que foi desenhada *depois* (i) passa por cima da (j) => Viaduto
                 // A linha desenhada no chão original (j) passa por baixo de (i) => Túnel
                 for(let b = -30; b <= 30; b++) {
                     let idxBridge = (i + b + spline.length) % spline.length;
                     spline[idxBridge].isBridge = true;
                     
                     let idxTunnel = (j + b + spline.length) % spline.length;
                     spline[idxTunnel].isTunnel = true;
                 }
             }
        }
  }
  
  // APLICAÇÃO GEOMÉTRICA FINAL (Passo O(N) com flags solidificadas)
  for (let i = 0; i < spline.length; i++) {
        const standardMaxR = spline[i].width * 1.70; // 425px limit as documented
        
        let maxShrinkR = standardMaxR;
        if (minDists[i] !== Infinity) {
            // O raio bate na outra pista a meio caminho (minOutherDist / 2) garantindo a partilha visual do Muro Betão.
            // Limite Absoluto: Berma Branca (0.65w).
            maxShrinkR = Math.max(spline[i].width * 0.65, Math.sqrt(minDists[i]) / 2);
        }
        
        // Pistas em Cota Superior (Viaduto) ou Inferior Direta (Túnel) IGNORAM o encolhimento de muros no cruzamento!
        if (spline[i].isBridge || spline[i].isTunnel) {
             spline[i].maxWallRadius = standardMaxR;
        } else {
             // Opcão dinâmica que devolve o fotorealismo puro do Mónaco / Street Circuits!
             spline[i].maxWallRadius = Math.min(standardMaxR, maxShrinkR);
        }
  }

  // ==========================================
  // O(N) GAUSSIAN BLUR (SMOOTHING) DA RELVA E MUROS
  // O Voronoi discreto gera saltos diagonais que parecem "bermas onduladas". 
  // Filtrar o maxWallRadius com uma janela-móvel apaga as altas frequências!
  // ==========================================
  const smoothedMaxR = new Array(spline.length).fill(0);
  const SMOOTH_WINDOW = 5;
  for (let i = 0; i < spline.length; i++) {
        let sum = 0;
        let count = 0;
        for (let w = -SMOOTH_WINDOW; w <= SMOOTH_WINDOW; w++) {
            const idx = i + w;
            if (isClosed) {
                sum += spline[(idx + spline.length) % spline.length].maxWallRadius!;
                count++;
            } else if (idx >= 0 && idx < spline.length) {
                sum += spline[idx].maxWallRadius!;
                count++;
            }
        }
        smoothedMaxR[i] = sum / count;
  }
  for(let i = 0; i < spline.length; i++) {
        spline[i].maxWallRadius = smoothedMaxR[i];
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

export function parseSvgToNodes(d: string, scale: number = 1.0, width: number = 200, sampleRate: number = 10): SplineNode[] {
  if (typeof document === 'undefined') return [];
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const length = path.getTotalLength();
  const cps: SplineNode[] = [];
  
  const WORLD_OFFSET_X = 2000;
  const WORLD_OFFSET_Y = 2000;

  for (let i = 0; i < length; i += sampleRate) {
    const pt = path.getPointAtLength(i);
    cps.push({ x: pt.x * scale + WORLD_OFFSET_X, y: pt.y * scale + WORLD_OFFSET_Y, width });
  }
  
  if (cps.length < 2) return [];
  return computeSpline(cps, true);
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


const MONZA_SVG = "m -322.30589,667.3142 c 8.38391,4.48566 16.85485,8.81363 25.15173,13.45697 22.14151,12.39148 44.025,25.24871 66.16346,37.64749 16.09644,9.0149 32.13947,18.15171 48.54123,26.59355 36.30472,18.68571 72.54315,37.65954 109.57823,54.78911 21.385285,9.89118 43.715299,17.70424 65.68286,26.27315 15.679929,6.11629 31.361851,12.26287 47.25961,17.78243 31.628858,10.98125 63.42355,21.54174 95.32024,31.72001 15.62993,4.98753 31.47101,9.30986 47.25962,13.77738 17.42662,4.93101 34.89997,9.70123 52.38608,14.41819 21.71,5.85638 43.25893,12.47231 65.20225,17.30182 25.3697,5.58362 51.1165,9.53052 76.7368,13.93758 34.29528,5.89928 68.6207,11.66644 103.00994,16.98143 23.65732,3.65633 47.48346,6.20855 71.12973,9.93253 38.40534,6.04835 76.48255,14.40497 115.02509,19.38446 56.93791,7.35607 114.14243,13.4444 171.41624,17.6222 103.78268,7.5703 207.83548,11.7481 311.75318,17.6222 m -1473.26743,-346.15444 3.30228,-6.17212 m 2.89952,9.46237 3.26597,-6.1914 m 2.92272,9.45525 3.27196,-6.18824 m 2.88119,9.46794 3.3202,-6.16249 m 2.77467,9.49957 3.41017,-6.11317 m 2.67895,9.53299 3.43853,-6.09725 m 2.6449,9.53993 3.45593,-6.08741 m 2.62101,9.54652 3.46902,-6.07997 m 2.60383,9.55122 3.47781,-6.07494 m 2.59339,9.55406 3.4823,-6.07235 m 2.58967,9.55507 3.48254,-6.07223 m 2.59267,9.55425 3.47849,-6.07455 m 2.60241,9.55161 3.47015,-6.07931 m 2.61887,9.5471 3.45752,-6.0865 m 2.64205,9.54071 3.44058,-6.09609 m 2.67105,9.53195 3.42102,-6.10709 m 2.68112,9.53019 3.42679,-6.10387 m 2.67967,9.5306 3.42288,-6.10605 m 2.69332,9.52675 3.40929,-6.11366 m 2.72204,9.51858 3.38599,-6.12659 m 2.76581,9.50593 3.35289,-6.14477 m 2.82458,9.48862 3.30991,-6.16802 m 2.89828,9.46634 3.25692,-6.19616 m 2.98128,9.43685 3.20411,-6.22363 m 3.01675,9.4288 3.20765,-6.22182 m 3.01313,9.42995 3.20889,-6.22118 m 3.01297,9.43001 3.20786,-6.22171 m 3.01626,9.42895 3.20455,-6.22342 m 3.023,9.4268 3.19896,-6.22629 m 3.03318,9.42352 3.19109,-6.23033 m 3.04682,9.41912 3.18093,-6.23551 m 3.06388,9.41359 3.16849,-6.24185 m 3.08437,9.40688 3.15374,-6.24931 m 3.1083,9.39901 3.13668,-6.2579 m 3.13566,9.38991 3.11729,-6.26757 m 3.16644,9.37958 3.09556,-6.27834 m 3.20063,9.36797 3.071489,-6.29015 m 3.238222,9.35503 3.04504,-6.30299 m 3.279213,9.34074 3.016205,-6.31684 m 3.323589,9.32504 2.984966,-6.33167 m 3.371334,9.30789 2.951303,-6.34743 m 3.45581,9.28404 2.863795,-6.38739 m 3.599157,9.22066 2.759785,-6.43301 m 3.736332,9.166 2.67193,-6.46999 m 3.848916,9.11935 2.600524,-6.49902 m 3.937299,9.08159 2.545755,-6.52067 m 4.00184,9.05338 2.507742,-6.53539 m 4.042821,9.03517 2.486555,-6.54347 m 4.060435,9.02728 2.482231,-6.54511 m 4.054756,9.02983 2.494786,-6.54034 m 4.02574,9.04278 2.5242158,-6.52904 m 3.9891279,9.06445 2.5439397,-6.52138 m 3.9824145,9.06384 2.5362978,-6.52435 m 4.000163,9.05602 2.5183693,-6.5313 m 4.032143,9.04181 2.49012,-6.54211 m 4.078295,9.02107 2.451488,-6.55669 m 4.138536,8.99358 2.402393,-6.57484 m 4.212748,8.95904 2.342744,-6.59633 m 4.289951,8.91679 2.291957,-6.61415 m 4.330506,8.90205 2.279602,-6.61841 m 4.347046,8.89398 2.267352,-6.62262 m 4.363421,8.88597 2.255206,-6.62677 m 4.37963,8.87799 2.243164,-6.63086 m 4.395681,8.87006 2.231225,-6.63488 m 4.411559,8.86216 2.219389,-6.63885 m 4.427286,8.85432 2.207656,-6.64276 m 4.442851,8.84652 2.196025,-6.64662 m 4.458258,8.83877 2.1845,-6.65041 m 4.4735,8.83105 2.17307,-6.65415 m 4.4886,8.82339 2.16174,-6.65784 m 4.50353,8.81578 2.15052,-6.66147 m 4.51832,8.80821 2.13939,-6.66506 m 4.53294,8.8007 2.12838,-6.66859 m 4.58746,8.7723 2.05651,-6.6911 m 4.67434,8.72537 1.99608,-6.70937 m 4.74372,8.68787 1.94962,-6.72301 m 4.7946,8.65992 1.91722,-6.73233 m 4.82719,8.64182 1.89892,-6.73752 m 4.8416,8.63376 1.89475,-6.73869 m 4.83789,8.63583 1.9047,-6.73588 m 4.83937,8.63679 1.89152,-6.7396 m 4.85711,8.62593 1.87745,-6.74352 m 4.87421,8.61628 1.86478,-6.74704 m 4.8895,8.60761 1.85348,-6.75015 m 4.90301,8.59993 1.84359,-6.75287 m 4.91473,8.59324 1.83507,-6.75518 m 4.92466,8.58755 1.82796,-6.75711 m 4.92817,8.58243 1.83112,-6.75626 m 4.9012,8.60222 1.86812,-6.74612 m 4.86474,8.62291 1.88826,-6.74051 m 4.8497,8.63138 1.89163,-6.73956 m 4.85611,8.62777 1.87824,-6.74331 m 4.88396,8.61203 1.84804,-6.75165 m 4.93316,8.58391 1.80094,-6.76436 m 5.00355,8.54303 1.73681,-6.78111 m 5.09486,8.48884 1.65546,-6.80142 m 5.20673,8.42063 1.55677,-6.8247 m 5.32584,8.34092 1.46362,-6.84527 m 5.42423,8.2804 1.39353,-6.85988 m 5.5031,8.22822 1.33255,-6.872 m 5.57048,8.18278 1.28069,-6.88185 m 5.62657,8.14433 1.23799,-6.88966 m 5.67156,8.11309 1.20446,-6.8956 m 5.70555,8.08923 1.18012,-6.89981 m 5.72869,8.07286 1.16495,-6.90238 m 5.74106,8.06408 1.15896,-6.90339 m 5.74269,8.06292 1.16217,-6.90285 m 5.73356,8.06941 1.17457,-6.90075 m 5.71949,8.08236 1.18523,-6.89893 m 5.7161,8.08251 1.18112,-6.89964 m 5.72125,8.07887 1.17644,-6.90043 m 5.72706,8.07474 1.17118,-6.90133 m 5.73354,8.07015 1.16536,-6.90232 m 5.74068,8.06507 1.15897,-6.90339 m 5.74849,8.0595 1.15199,-6.90456 m 5.75696,8.05345 1.14444,-6.90581 m 5.7661,8.04691 1.13632,-6.90715 m 5.77588,8.03989 1.12762,-6.90858 m 5.78635,8.03237 1.11835,-6.91008 m 5.79744,8.02435 1.10851,-6.91167 m 5.8092,8.01584 1.09808,-6.91333 m 5.82162,8.00683 1.08708,-6.91508 m 5.83469,7.99732 1.07549,-6.91689 m 5.86056,7.98352 1.04071,-6.9222 m 5.91072,7.94025 0.99006,-6.92963 m 5.96141,7.90229 0.95203,-6.93496 m 5.99748,7.87497 0.92666,-6.9384 m 6.01907,7.85849 0.91396,-6.94008 m 6.02628,7.85297 0.91392,-6.94008 m 6.01914,7.85843 0.92657,-6.93841 m 5.99762,7.87486 0.95187,-6.93498 m 5.96164,7.90212 0.98983,-6.92967 m 5.91101,7.94004 1.04043,-6.92225 m 5.84767,7.98823 1.0995,-6.91311 m 5.78769,8.03185 1.14397,-6.90589 m 5.74017,8.06589 1.18104,-6.89965 m 5.70109,8.09358 1.21074,-6.8945 m 5.6705,8.11505 1.23309,-6.89054 m 5.64847,8.1304 1.24812,-6.88783 m 5.63504,8.13972 1.25584,-6.88643 m 5.63023,8.14304 1.25625,-6.88635 m 5.63407,8.14039 1.24935,-6.88761 m 5.64653,8.13174 1.23514,-6.89017 m 5.66761,8.11706 1.2136,-6.894 m 5.69726,8.09628 1.1847,-6.89902 m 5.73543,8.06927 1.14844,-6.90515 m 5.78202,8.03593 1.10477,-6.91227 m 5.83697,7.9961 1.05368,-6.92025 m 5.90012,7.9496 0.99513,-6.92891 m 5.97133,7.89623 0.92911,-6.93807 m 6.03209,7.84294 0.8899,-6.9432 m 6.0606,7.82747 0.87695,-6.94485 m 6.07533,7.81605 0.86376,-6.9465 m 6.09029,7.80439 0.85032,-6.94816 m 6.10551,7.7925 0.83664,-6.94983 m 6.12097,7.78036 0.82272,-6.95148 m 6.13668,7.76797 0.80855,-6.95315 m 6.15264,7.75534 0.79413,-6.95481 m 6.16884,7.74246 0.77947,-6.95646 m 6.18528,7.72933 0.76456,-6.95812 m 6.20196,7.71594 0.7494,-6.95977 m 6.2189,7.70231 0.73399,-6.96142 m 6.23607,7.68841 0.71833,-6.96304 m 6.25348,7.67425 0.70242,-6.96467 m 6.27114,7.65983 0.68626,-6.96628 m 6.28903,7.64515 0.66984,-6.96788 m 6.30716,7.6302 0.65317,-6.96946 m 6.32554,7.61497 0.63625,-6.97103 m 6.34414,7.59948 0.61907,-6.97257 m 6.36298,7.58371 0.60164,-6.9741 m 6.38206,7.56764 0.58394,-6.97558 m 6.40137,7.55138 0.566,-6.97713 m 6.42092,7.53473 0.54779,-6.97854 m 6.44069,7.51784 0.52932,-6.97997 m 6.4607,7.50067 0.5106,-6.98139 m 6.47652,7.48669 0.49989,-6.98215 m 6.48746,7.47745 0.49014,-6.98281 m 6.49771,7.46851 0.48074,-6.98342 m 6.50757,7.45992 0.47168,-6.98406 m 6.51707,7.45166 0.46296,-6.98466 m 6.52617,7.44366 0.45459,-6.98519 m 6.53491,7.43599 0.44656,-6.9857 m 6.54327,7.4287 0.43888,-6.98626 m 6.55125,7.42166 0.43154,-6.98671 m 6.55886,7.41491 0.42454,-6.9871 m 6.5661,7.4085 0.4179,-6.9875 m 6.57296,7.4024 0.41159,-6.9879 m 6.57945,7.3966 0.40562,-6.9882 m 6.5856,7.3912 0.40001,-6.9886 m 6.59134,7.3861 0.39473,-6.9889 m 6.59673,7.3813 0.38981,-6.9892 m 6.60175,7.3768 0.38523,-6.9894 m 6.6064,7.3726 0.38099,-6.9897 m 6.61069,7.3688 0.37709,-6.9898 m 6.61462,7.3652 0.37354,-6.9901 m 6.61817,7.3621 0.37033,-6.9902 m 6.62138,7.3591 0.36747,-6.9903 m 6.6242,7.3566 0.36496,-6.9905 m 6.6267,7.3544 0.3628,-6.9906 m 6.6287,7.3525 0.361,-6.9907 m 6.6305,7.3509 0.3595,-6.9908 m 6.6319,7.3497 0.3583,-6.9908 m 6.6329,7.3487 0.3575,-6.9908 m 6.6336,7.3481 0.3571,-6.9909 m 6.6338,7.3479 0.357,-6.9909 m 6.6338,7.348 0.3572,-6.9909 m 6.6334,7.3484 0.3578,-6.9909 m 6.6325,7.3491 0.3588,-6.9908 m 6.6314,7.3501 0.36,-6.9908 m 6.6299,7.3515 0.3616,-6.9906 m 6.628,7.3531 0.3636,-6.9905 m 6.6257,7.3552 0.3659,-6.9905 m 6.6232,7.3576 0.3685,-6.9903 m 6.6202,7.3602 0.3715,-6.9901 m 6.6169,7.3632 0.3748,-6.99 m 6.6132,7.3665 0.3785,-6.9897 m 6.6091,7.3702 0.3826,-6.9896 m 6.6047,7.3742 0.3869,-6.9893 m 6.5999,7.3784 0.3916,-6.989 m 4.3527,7.256 0.395,-6.9888 M -322.30589,675.3142 c 8.38391,4.48566 16.85485,8.81363 25.15173,13.45697 22.14151,12.39148 44.025,25.24871 66.16346,37.64749 16.09644,9.0149 32.13947,18.15171 48.54123,26.59355 36.30472,18.68571 72.54315,37.65954 109.57823,54.78911 21.385285,9.89118 43.715299,17.70424 65.68286,26.27315 15.679929,6.11629 31.361851,12.26287 47.25961,17.78243 31.628858,10.98125 63.42355,21.54174 95.32024,31.72001 15.62993,4.98753 31.47101,9.30986 47.25962,13.77738 17.42662,4.93101 34.89997,9.70123 52.38608,14.41819 21.71,5.85638 43.25893,12.47231 65.20225,17.30182 25.3697,5.58362 51.1165,9.53052 76.7368,13.93758 34.29528,5.89928 68.6207,11.66644 103.00994,16.98143 23.65732,3.65633 47.48346,6.20855 71.12973,9.93253 38.40534,6.04835 76.48255,14.40497 115.02509,19.38446 56.93791,7.35607 114.14243,13.4444 171.41624,17.6222 103.78268,7.5703 207.83548,11.7481 311.75318,17.6222 m -1473.26743,-346.15444 3.30228,-6.17212 m 2.89952,9.46237 3.26597,-6.1914 m 2.92272,9.45525 3.27196,-6.18824 m 2.88119,9.46794 3.3202,-6.16249 m 2.77467,9.49957 3.41017,-6.11317 m 2.67895,9.53299 3.43853,-6.09725 m 2.6449,9.53993 3.45593,-6.08741 m 2.62101,9.54652 3.46902,-6.07997 m 2.60383,9.55122 3.47781,-6.07494 m 2.59339,9.55406 3.4823,-6.07235 m 2.58967,9.55507 3.48254,-6.07223 m 2.59267,9.55425 3.47849,-6.07455 m 2.60241,9.55161 3.47015,-6.07931 m 2.61887,9.5471 3.45752,-6.0865 m 2.64205,9.54071 3.44058,-6.09609 m 2.67105,9.53195 3.42102,-6.10709 m 2.68112,9.53019 3.42679,-6.10387 m 2.67967,9.5306 3.42288,-6.10605 m 2.69332,9.52675 3.40929,-6.11366 m 2.72204,9.51858 3.38599,-6.12659 m 2.76581,9.50593 3.35289,-6.14477 m 2.82458,9.48862 3.30991,-6.16802 m 2.89828,9.46634 3.25692,-6.19616 m 2.98128,9.43685 3.20411,-6.22363 m 3.01675,9.4288 3.20765,-6.22182 m 3.01313,9.42995 3.20889,-6.22118 m 3.01297,9.43001 3.20786,-6.22171 m 3.01626,9.42895 3.20455,-6.22342 m 3.023,9.4268 3.19896,-6.22629 m 3.03318,9.42352 3.19109,-6.23033 m 3.04682,9.41912 3.18093,-6.23551 m 3.06388,9.41359 3.16849,-6.24185 m 3.08437,9.40688 3.15374,-6.24931 m 3.1083,9.39901 3.13668,-6.2579 m 3.13566,9.38991 3.11729,-6.26757 m 3.16644,9.37958 3.09556,-6.27834 m 3.20063,9.36797 3.071489,-6.29015 m 3.238222,9.35503 3.04504,-6.30299 m 3.279213,9.34074 3.016205,-6.31684 m 3.323589,9.32504 2.984966,-6.33167 m 3.371334,9.30789 2.951303,-6.34743 m 3.45581,9.28404 2.863795,-6.38739 m 3.599157,9.22066 2.759785,-6.43301 m 3.736332,9.166 2.67193,-6.46999 m 3.848916,9.11935 2.600524,-6.49902 m 3.937299,9.08159 2.545755,-6.52067 m 4.00184,9.05338 2.507742,-6.53539 m 4.042821,9.03517 2.486555,-6.54347 m 4.060435,9.02728 2.482231,-6.54511 m 4.054756,9.02983 2.494786,-6.54034 m 4.02574,9.04278 2.5242158,-6.52904 m 3.9891279,9.06445 2.5439397,-6.52138 m 3.9824145,9.06384 2.5362978,-6.52435 m 4.000163,9.05602 2.5183693,-6.5313 m 4.032143,9.04181 2.49012,-6.54211 m 4.078295,9.02107 2.451488,-6.55669 m 4.138536,8.99358 2.402393,-6.57484 m 4.212748,8.95904 2.342744,-6.59633 m 4.289951,8.91679 2.291957,-6.61415 m 4.330506,8.90205 2.279602,-6.61841 m 4.347046,8.89398 2.267352,-6.62262 m 4.363421,8.88597 2.255206,-6.62677 m 4.37963,8.87799 2.243164,-6.63086 m 4.395681,8.87006 2.231225,-6.63488 m 4.411559,8.86216 2.219389,-6.63885 m 4.427286,8.85432 2.207656,-6.64276 m 4.442851,8.84652 2.196025,-6.64662 m 4.458258,8.83877 2.1845,-6.65041 m 4.4735,8.83105 2.17307,-6.65415 m 4.4886,8.82339 2.16174,-6.65784 m 4.50353,8.81578 2.15052,-6.66147 m 4.51832,8.80821 2.13939,-6.66506 m 4.53294,8.8007 2.12838,-6.66859 m 4.58746,8.7723 2.05651,-6.6911 m 4.67434,8.72537 1.99608,-6.70937 m 4.74372,8.68787 1.94962,-6.72301 m 4.7946,8.65992 1.91722,-6.73233 m 4.82719,8.64182 1.89892,-6.73752 m 4.8416,8.63376 1.89475,-6.73869 m 4.83789,8.63583 1.9047,-6.73588 m 4.83937,8.63679 1.89152,-6.7396 m 4.85711,8.62593 1.87745,-6.74352 m 4.87421,8.61628 1.86478,-6.74704 m 4.8895,8.60761 1.85348,-6.75015 m 4.90301,8.59993 1.84359,-6.75287 m 4.91473,8.59324 1.83507,-6.75518 m 4.92466,8.58755 1.82796,-6.75711 m 4.92817,8.58243 1.83112,-6.75626 m 4.9012,8.60222 1.86812,-6.74612 m 4.86474,8.62291 1.88826,-6.74051 m 4.8497,8.63138 1.89163,-6.73956 m 4.85611,8.62777 1.87824,-6.74331 m 4.88396,8.61203 1.84804,-6.75165 m 4.93316,8.58391 1.80094,-6.76436 m 5.00355,8.54303 1.73681,-6.78111 m 5.09486,8.48884 1.65546,-6.80142 m 5.20673,8.42063 1.55677,-6.8247 m 5.32584,8.34092 1.46362,-6.84527 m 5.42423,8.2804 1.39353,-6.85988 m 5.5031,8.22822 1.33255,-6.872 m 5.57048,8.18278 1.28069,-6.88185 m 5.62657,8.14433 1.23799,-6.88966 m 5.67156,8.11309 1.20446,-6.8956 m 5.70555,8.08923 1.18012,-6.89981 m 5.72869,8.07286 1.16495,-6.90238 m 5.74106,8.06408 1.15896,-6.90339 m 5.74269,8.06292 1.16217,-6.90285 m 5.73356,8.06941 1.17457,-6.90075 m 5.71949,8.08236 1.18523,-6.89893 m 5.7161,8.08251 1.18112,-6.89964 m 5.72125,8.07887 1.17644,-6.90043 m 5.72706,8.07474 1.17118,-6.90133 m 5.73354,8.07015 1.16536,-6.90232 m 5.74068,8.06507 1.15897,-6.90339 m 5.74849,8.0595 1.15199,-6.90456 m 5.75696,8.05345 1.14444,-6.90581 m 5.7661,8.04691 1.13632,-6.90715 m 5.77588,8.03989 1.12762,-6.90858 m 5.78635,8.03237 1.11835,-6.91008 m 5.79744,8.02435 1.10851,-6.91167 m 5.8092,8.01584 1.09808,-6.91333 m 5.82162,8.00683 1.08708,-6.91508 m 5.83469,7.99732 1.07549,-6.91689 m 5.86056,7.98352 1.04071,-6.9222 m 5.91072,7.94025 0.99006,-6.92963 m 5.96141,7.90229 0.95203,-6.93496 m 5.99748,7.87497 0.92666,-6.9384 m 6.01907,7.85849 0.91396,-6.94008 m 6.02628,7.85297 0.91392,-6.94008 m 6.01914,7.85843 0.92657,-6.93841 m 5.99762,7.87486 0.95187,-6.93498 m 5.96164,7.90212 0.98983,-6.92967 m 5.91101,7.94004 1.04043,-6.92225 m 5.84767,7.98823 1.0995,-6.91311 m 5.78769,8.03185 1.14397,-6.90589 m 5.74017,8.06589 1.18104,-6.89965 m 5.70109,8.09358 1.21074,-6.8945 m 5.6705,8.11505 1.23309,-6.89054 m 5.64847,8.1304 1.24812,-6.88783 m 5.63504,8.13972 1.25584,-6.88643 m 5.63023,8.14304 1.25625,-6.88635 m 5.63407,8.14039 1.24935,-6.88761 m 5.64653,8.13174 1.23514,-6.89017 m 5.66761,8.11706 1.2136,-6.894 m 5.69726,8.09628 1.1847,-6.89902 m 5.73543,8.06927 1.14844,-6.90515 m 5.78202,8.03593 1.10477,-6.91227 m 5.83697,7.9961 1.05368,-6.92025 m 5.90012,7.9496 0.99513,-6.92891 m 5.97133,7.89623 0.92911,-6.93807 m 6.03209,7.84294 0.8899,-6.9432 m 6.0606,7.82747 0.87695,-6.94485 m 6.07533,7.81605 0.86376,-6.9465 m 6.09029,7.80439 0.85032,-6.94816 m 6.10551,7.7925 0.83664,-6.94983 m 6.12097,7.78036 0.82272,-6.95148 m 6.13668,7.76797 0.80855,-6.95315 m 6.15264,7.75534 0.79413,-6.95481 m 6.16884,7.74246 0.77947,-6.95646 m 6.18528,7.72928 0.76456,-6.95807 m 6.20196,7.71597 0.7494,-6.9598 m 6.2189,7.7023 0.73399,-6.96141 m 6.23607,7.68841 0.71833,-6.96304 m 6.25348,7.67424 0.70242,-6.96466 m 6.27114,7.65986 0.68626,-6.96631 m 6.28903,7.64511 0.66984,-6.96784 m 6.30716,7.63024 0.65317,-6.9695 m 6.32554,7.615 0.63625,-6.97106 m 6.34414,7.59946 0.61907,-6.9725 m 6.36298,7.5837 0.60164,-6.9741 m 6.38206,7.5676 0.58394,-6.9756 m 6.40137,7.5514 0.566,-6.9771 m 6.42092,7.5347 0.54779,-6.9785 m 6.44069,7.5178 0.52932,-6.98 m 6.4607,7.5007 0.5106,-6.9814 m 6.47652,7.4867 0.49989,-6.9821 m 6.48746,7.4774 0.49014,-6.9828 m 6.49771,7.4685 0.48074,-6.9834 m 6.50757,7.4599 0.47168,-6.9841 m 6.51707,7.4517 0.46296,-6.9847 m 6.52617,7.4437 0.45459,-6.9852 m 6.53491,7.436 0.44656,-6.9857 m 6.54327,7.4287 0.43888,-6.9863 m 6.55125,7.4217 0.43154,-6.9867 m 6.55886,7.4149 0.42454,-6.9871 m 6.5661,7.4085 0.4179,-6.9875 m 6.57296,7.4024 0.41159,-6.9879 m 6.57945,7.3966 0.40562,-6.9882 m 6.5856,7.3912 0.40001,-6.9886 m 6.59134,7.3861 0.39473,-6.9889 m 6.59673,7.3813 0.38981,-6.9892 m 6.60175,7.3768 0.38523,-6.9894 m 6.6064,7.3726 0.38099,-6.9897 m 6.61069,7.3688 0.37709,-6.9898 m 6.61462,7.3652 0.37354,-6.9901 m 6.61817,7.3621 0.37033,-6.9902 m 6.62138,7.3591 0.36747,-6.9903 m 6.6242,7.3566 0.36496,-6.9905 m 6.6267,7.3544 0.3628,-6.9906 m 6.6287,7.3525 0.361,-6.9907 m 6.6305,7.3509 0.3595,-6.9908 m 6.6319,7.3497 0.3583,-6.9908 m 6.6329,7.3487 0.3575,-6.9908 m 6.6336,7.3481 0.3571,-6.9909 m 6.6338,7.3479 0.357,-6.9909 m 6.6338,7.348 0.3572,-6.9909 m 6.6334,7.3484 0.3578,-6.9909 m 6.6325,7.3491 0.3588,-6.9908 m 6.6314,7.3501 0.36,-6.9908 m 6.6299,7.3515 0.3616,-6.9906 m 6.628,7.3531 0.3636,-6.9905 m 6.6257,7.3552 0.3659,-6.9905 m 6.6232,7.3576 0.3685,-6.9903 m 6.6202,7.3602 0.3715,-6.9901 m 6.6169,7.3632 0.3748,-6.99 m 6.6132,7.3665 0.3785,-6.9897 m 6.6091,7.3702 0.3826,-6.9896 m 6.6047,7.3742 0.3869,-6.9893 m 6.5999,7.3784 0.3916,-6.989 m 4.3527,7.256 0.395,-6.9888";
export const MONZA_NODES = parseSvgToNodes(MONZA_SVG, 15, 250);
export const TRACKS: TrackDef[] = [
  {
    id: 'Monza',
    name: 'Monza',
    nodes: MONZA_NODES,
    svg_data: MONZA_SVG,
    pit_svg_data: '',
    pitNodes: []
  }
];
