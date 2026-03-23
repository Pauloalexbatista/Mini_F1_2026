import { SplineNode } from './tracks';

// CACHE GEOMÉTRICA GERAL: Previne alocação de Arrays Constantes a 60FPS
export const trackGeometryCache = new WeakMap<SplineNode[], SplineNode[][]>();
export const squeezedGrassCache = new WeakMap<SplineNode[], Path2D>();
export const squeezedWallCache = new WeakMap<SplineNode[], Path2D>();
export const zebraWhiteCache = new WeakMap<SplineNode[], Path2D>();
export const zebraRedCache = new WeakMap<SplineNode[], Path2D>();

export function drawTrack(ctx: CanvasRenderingContext2D, spline: SplineNode[], pitSpline: SplineNode[] | null, isPreview = false) {
  if (spline.length === 0) return;

  const drawVariablePath = (pathNodes: SplineNode[], widthMultiplier: number, color: string, dash: number[] = [], closePath = false, lineCap: CanvasLineCap = 'round') => {
    if (pathNodes.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pathNodes[0].x, pathNodes[0].y);
    for (let i = 1; i < pathNodes.length; i++) {
        ctx.lineTo(pathNodes[i].x, pathNodes[i].y);
    }
    if (closePath) ctx.closePath();
    ctx.lineWidth = pathNodes[0].width * widthMultiplier;
    ctx.strokeStyle = color;
    ctx.lineCap = lineCap;
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.stroke();
  };

  const asphaltColor = '#3f3f4e';

  // 1. RELVA BASE INFINITA (Fundo verde orgânico - aclarado um nada para fazer o muro Preto realçar a sua espessura fina de 5px)
  drawVariablePath(spline, 5.0, '#142E0F', [], true);

  // 1.5 O MURO EXTERIOR, A RELVA E AS ZEBRAS (Tudo construído pelo limite Matemático Seguro Voronoi)
  if (!squeezedWallCache.has(spline)) {
      const wallPath = new Path2D();
      const grassPath = new Path2D();
      const zebraSafeClip = new Path2D();
      
      for(let i=0; i<spline.length; i++) {
            const curr = spline[i];
            const maxR = curr.maxWallRadius || (curr.width * 1.70); // 425 Px (Limite real F1)
            
            // 1) O Muro Contínuo! (Sempre presente, fecha o perímetro à distância maxR)
            wallPath.moveTo(curr.x + maxR, curr.y);
            wallPath.arc(curr.x, curr.y, maxR, 0, Math.PI * 2);
            
            // 2) A Relva! (Recuada 5px para revelar a fita dura envolvente a toda a pista)
            const gR = Math.max(0, maxR - 5);
            grassPath.moveTo(curr.x + gR, curr.y);
            grassPath.arc(curr.x, curr.y, gR, 0, Math.PI * 2);

            // 3) Túnel Seguro das Zebras (Corta a 14px do muro, se houver espaço)
            const safeZR = Math.max(0, maxR - 14);
            zebraSafeClip.moveTo(curr.x + safeZR, curr.y);
            zebraSafeClip.arc(curr.x, curr.y, safeZR, 0, Math.PI * 2);
      }
      squeezedWallCache.set(spline, wallPath);
      squeezedGrassCache.set(spline, grassPath);
      zebraWhiteCache.set(spline, zebraSafeClip);
  }
  
  // Desenho Físico da Estrutura Envolvente Total (Este é o Muro Preto Principal)
  ctx.fillStyle = '#111111'; // Betão negro impenetrável
  ctx.fill(squeezedWallCache.get(spline)!);

  // Relva Interna do GP (Verde mais claro)
  ctx.fillStyle = '#224A19';
  ctx.fill(squeezedGrassCache.get(spline)!);

  // DEBUG NEON LIMITS: Muros Invisíveis Visíveis para Testes (Verde Neon)
  ctx.strokeStyle = '#39FF14'; 
  ctx.lineWidth = 10;
  ctx.stroke(squeezedWallCache.get(spline)!);

  // ==========================================
  // REGRA 2: PIT LANE COM MUROS E ZEBRAS (Relva = 0)
  // ==========================================
  if (pitSpline && pitSpline.length > 8) {
      // Cortamos pontas (slice) para não vomitar muro no meio da ESTRADA PRINCIPAL ao entrar/sair!
      const pitInnerWalls = pitSpline.slice(3, -3);
      
      // 1) O Muro (0.99w) estritamente limitado a 5px puros.
      // DEBUG NEON LIMITS: Muros Invisíveis Visíveis para Testes (Verde Neon em vez de Preto)
      drawVariablePath(pitInnerWalls, 0.99, '#39FF14', [], false, 'round');
  }

  // 2. TODAS AS ZEBRAS E BERMAS DA PISTA PRINCIPAL (Isoladas pelas máscaras de segurança Voronoi)
  ctx.save();
  ctx.clip(zebraWhiteCache.get(spline)!);
  
  if (!isPreview) {
      const trackW = spline[0].width; 
      
      // ==========================================
      // REGRAS DE OURO 2 & 3: BERMAS DE AVISO CURVAS (SÓ DESENHADAS DEPOIS SE HOUVER ESPAÇO!)
      // Desenhamos de Fora para Dentro para que se sobreponham na perfeição.
      // ==========================================
      
      // BERMA 3 (ZONA DE APEX CRÍTICO: 100px): Vermelho Total Sólido (1.60w => 25px líquidos)
      ctx.setLineDash([]);
      ctx.beginPath();
      let isDrawingApex = false;
      for (let i = 0; i < spline.length; i++) {
          if (spline[i].isApexTight) {
              if (!isDrawingApex) { ctx.moveTo(spline[i].x, spline[i].y); isDrawingApex = true; }
              else { ctx.lineTo(spline[i].x, spline[i].y); }
          } else { isDrawingApex = false; }
      }
      if (spline[0].isApexTight && spline[spline.length-1].isApexTight) ctx.lineTo(spline[0].x, spline[0].y);
      ctx.strokeStyle = '#D10000'; // Vermelho Total
      ctx.lineWidth = trackW * 1.60;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();

      // BERMA 2 (ZONA DE AVISO: 500px): Toda Amarela (1.40w => 25px líquidos)
      ctx.beginPath();
      let isDrawingExt = false;
      for (let i = 0; i < spline.length; i++) {
          if (spline[i].isExtendedTight) {
              if (!isDrawingExt) { ctx.moveTo(spline[i].x, spline[i].y); isDrawingExt = true; }
              else { ctx.lineTo(spline[i].x, spline[i].y); }
          } else { isDrawingExt = false; }
      }
      if (spline[0].isExtendedTight && spline[spline.length-1].isExtendedTight) ctx.lineTo(spline[0].x, spline[0].y);
      
      // Toda Amarela
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FFD700'; // Amarelo
      ctx.lineWidth = trackW * 1.40;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();

      // ==========================================
      // REGRA DE OURO 1: BERMA BASE (TODA A VIA!) (1.20w => 25px líquidos)
      // Como é desenhada por cima, sobrepõe-se e "sela" o interior das Bermas 2 e 3 de forma concêntrica!
      // ==========================================
      
      // Toda Branca
      ctx.setLineDash([]);
      drawVariablePath(spline, 1.20, '#FFFFFF', [], true, 'butt');
      
      // Asfalto "Runoff" Suave Escoamento (1.04w) - Tapa o meio de todas as zebras para elas formarem aros e não rolos compressores
      drawVariablePath(spline, 1.04, '#282833', [], true, 'round');
      
  } else {
      ctx.setLineDash([]);
      // Base Branca das Zebras miniatura no editor
      drawVariablePath(spline, 1.2, '#FFFFFF', [], true, 'butt');
  }
  
  ctx.restore();

  // 3. ASFALTO PRINCIPAL 
  drawVariablePath(spline, 1.0, asphaltColor, [], true);
  
  if (!isPreview && spline.length > 20) {
      // (Linha Tracejada Central Removida a pedido do Diretor de Prova!)

      // 2.2 Marcas da Linha de Meta (Xadrez HD)
      const metaNode = spline[0];
      const nextMeta = spline[1];
      let angleMeta = Math.atan2(nextMeta.y - metaNode.y, nextMeta.x - metaNode.x);
      
      ctx.save();
      ctx.translate(metaNode.x, metaNode.y);
      ctx.rotate(angleMeta);
      
      const trackW = metaNode.width; 
      
      // Fundo Branco da Meta
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-6, -trackW/2, 12, trackW);
      
      // Quadrados Pretos
      ctx.fillStyle = '#000000';
      const numSquares = Math.floor(trackW / 6);
      for (let s = 0; s < numSquares; s++) {
          const sy = -trackW/2 + s * 6;
          if (s % 2 === 0) {
              ctx.fillRect(-6, sy, 6, 6);
              ctx.fillRect(0, sy + 6, 6, 6);
          }
      }
      ctx.restore();

      // 2.3 Grelha de Partida Oficial (F1 Start Slots em L)
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.lineCap = 'square';
      
      for (let i = 0; i < 10; i++) {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const targetDistance = 200 + row * 150; // A mesma matemática da Física Spawn original!
          
          let computedIndex = 0;
          let accumulatedDist = 0;
          for (let k = spline.length - 1; k > 0; k--) {
              const p1 = spline[k];
              const p2 = spline[(k + 1) % spline.length];
              accumulatedDist += Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
              if (accumulatedDist >= targetDistance) {
                  computedIndex = k;
                  break;
              }
          }
          
          const spawnNode = spline[computedIndex];
          const nextSNode = spline[(computedIndex + 1) % spline.length];
          const sAngle = Math.atan2(nextSNode.y - spawnNode.y, nextSNode.x - spawnNode.x);
          
          const offsetY = col === 0 ? -40 : 40; 
          const rotX = -offsetY * Math.sin(sAngle);
          const rotY = offsetY * Math.cos(sAngle);
          
          ctx.save();
          ctx.translate(spawnNode.x + rotX, spawnNode.y + rotY);
          ctx.rotate(sAngle);
          
          // Desenhar o slot mesmo em frente ao nariz do Fórmula 1 (Frente = X+, X=20px)
          ctx.beginPath();
          ctx.moveTo(25, -14);
          ctx.lineTo(25, 14); // Linha Frontal onde o pneu pára
          
          // E os cantinhos traseiros (bracket em L)
          ctx.moveTo(25, -14); ctx.lineTo(15, -14);
          ctx.moveTo(25, 14); ctx.lineTo(15, 14);
          ctx.stroke();
          
          ctx.restore();
      }
      ctx.lineDashOffset = 0;
  }

  // 3. ESTRADA DA PIT LANE
  if (pitSpline && pitSpline.length > 8) {
      const pitInnerWalls = pitSpline.slice(3, -3);
      
      const pitMaxDist = pitInnerWalls[pitInnerWalls.length - 1].distFromStart || 0;
      let startLimitIdx = -1;
      let endLimitIdx = -1;

      for (let i = 0; i < pitInnerWalls.length; i++) {
          const pt = pitInnerWalls[i];
          if (pt.distFromStart !== undefined) {
             if (pt.distFromStart > 1000 && startLimitIdx === -1) startLimitIdx = i;
             if (pt.distFromStart > pitMaxDist - 1000 && endLimitIdx === -1) endLimitIdx = i;
          }
      }

      if (startLimitIdx !== -1 && endLimitIdx !== -1 && endLimitIdx > startLimitIdx) {
          // A) Entrada da Box (Asfalto Normal p/ misturar suavemente com a pista GP)
          const sIn = pitInnerWalls.slice(0, startLimitIdx + 1);
          drawVariablePath(sIn, 0.94, asphaltColor, [], false, 'butt');

          // B) Zona Restrita de Pit Stop (5 Cores Proporcionais 20%)
          const restrictedZone = pitInnerWalls.slice(startLimitIdx, endLimitIdx + 1);
          const tLen = restrictedZone.length;
          const i1 = Math.floor(tLen * 0.20);
          const i2 = Math.floor(tLen * 0.40);
          const i3 = Math.floor(tLen * 0.60);
          const i4 = Math.floor(tLen * 0.80);

          const s1 = restrictedZone.slice(0, i1 + 1);
          const s2 = restrictedZone.slice(i1, i2 + 1);
          const s3 = restrictedZone.slice(i2, i3 + 1);
          const s4 = restrictedZone.slice(i3, i4 + 1);
          const s5 = restrictedZone.slice(i4);

          drawVariablePath(s1, 0.94, '#FFFFFF', [], false, 'butt');
          drawVariablePath(s2, 0.94, '#FFD700', [], false, 'butt');
          drawVariablePath(s3, 0.94, '#D10000', [], false, 'butt');
          drawVariablePath(s4, 0.94, '#FFD700', [], false, 'butt');
          drawVariablePath(s5, 0.94, '#FFFFFF', [], false, 'butt');

          // C) Saída da Box (Asfalto Normal)
          const sOut = pitInnerWalls.slice(endLimitIdx);
          drawVariablePath(sOut, 0.94, asphaltColor, [], false, 'butt');
      } else {
          // Fallback cinzento se a pista for microscópica
          drawVariablePath(pitInnerWalls, 0.94, asphaltColor, [], false, 'butt');
      }

      // 4. TEXTOS "PIT STOP" (Sem fundo amarelo, apenas texto rodado!)

      if (startLimitIdx !== -1 && endLimitIdx !== -1 && startLimitIdx > 5 && endLimitIdx > 5) {
          // TEXTO Entrada
          const pS1 = pitInnerWalls[startLimitIdx - 5];
          const pS2 = pitInnerWalls[startLimitIdx];
          const angleIn = Math.atan2(pS2.y - pS1.y, pS2.x - pS1.x);
          
          ctx.save();
          ctx.translate(pS2.x, pS2.y);
          ctx.rotate(angleIn - Math.PI/2);
          ctx.fillStyle = '#000000'; // Preto para contrastar sobre o Colorido!
          ctx.font = '900 45px "Titillium Web", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("PIT STOP", 0, 0); 
          ctx.restore();

          // TEXTO Saída
          const pE1 = pitInnerWalls[endLimitIdx - 5];
          const pE2 = pitInnerWalls[endLimitIdx];
          const angleOut = Math.atan2(pE2.y - pE1.y, pE2.x - pE1.x);
          
          ctx.save();
          ctx.translate(pE2.x, pE2.y);
          ctx.rotate(angleOut - Math.PI/2);
          ctx.fillStyle = '#000000';
          ctx.font = '900 45px "Titillium Web", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("PIT STOP", 0, 0);
          ctx.restore();
      }
  }
} // <--- Fechar renderTrack

// CACHE DE COLISÕES GLOBAIS: Previne que o Motor de Geometria queime o CPU a calcular a mesma colisão a 60FPS!
export const environmentCollisionCache = new WeakMap<SplineNode[], { stands: boolean[], boxes: { colide: boolean, shift: number }, decors: boolean[] }>();

export function drawEnvironments(ctx: CanvasRenderingContext2D, spline: SplineNode[], pitSpline: SplineNode[] | null, isPreview: boolean = false) {
    if (isPreview) return;

    let colCache = environmentCollisionCache.get(spline) || { stands: [], boxes: { colide: false, shift: 1.5 }, decors: [] };
    const isNewCache = !environmentCollisionCache.has(spline);

    let cx = 0, cy = 0;
    for (const n of spline) { cx += n.x; cy += n.y; }
    cx /= spline.length; cy /= spline.length;

      // Bancadas de Espectadores (Redução EXTREMA de Quantidade e Sempre Fora)
      let grandstandSpacing = 300; // Multipliquei o passo quase por 6!
      for (let i = 20; i < spline.length; i += grandstandSpacing) {
          // Padrão determinístico em vez de Math.random para evitar cintilação gráfica a 60fps!
          if (i % 3 === 0) continue; 

          const node = spline[i];
          const nextNode = spline[(i + 1) % spline.length];
          const pDx = nextNode.x - node.x;
          const pDy = nextNode.y - node.y;
          const len = Math.sqrt(pDx*pDx + pDy*pDy);
          
          let nx = -pDy / len;
          let ny = pDx / len;
          
          // Garantir que a bancada vai para as "costas" da pista (exterior absoluto)
          const vecX = node.x - cx;
          const vecY = node.y - cy;
          if (nx * vecX + ny * vecY < 0) {
              nx = -nx; 
              ny = -ny; // Virar as costas ao miolo do circuito
          }
          
          const gsOffset = node.width * 2.8; 
          const tX = node.x + nx * gsOffset;
          const tY = node.y + ny * gsOffset;
          
          // CRITICAL: Deteção de Colisão Global das Bancadas
          // Para evitar que a bancada nasça em cima de uma reta oposta noutra secção do circuito
          let colide = false;
          if (isNewCache) {
             for (let m = 0; m < spline.length; m++) {
                 const marginSq = (spline[m].width * 4.0)**2; 
                 if ((spline[m].x - tX)**2 + (spline[m].y - tY)**2 < marginSq) {
                     colide = true; break;
                 }
             }
             colCache.stands.push(colide);
          } else {
             colide = colCache.stands[Math.floor((i - 20) / grandstandSpacing)]; // Use indexing instead of pushing to avoid array growth
          }
          if (colide) continue; // Abortar paisagem aqui! Está em cima de outro alcatrão!
          
          ctx.save();
          ctx.translate(tX, tY);
          ctx.rotate(Math.atan2(pDy, pDx));
          
          // Base Traseira da Bancada
          ctx.fillStyle = '#666666';
          ctx.fillRect(-100, -60, 200, 120);
          
          // Lona/Cadeiras Vermelhas
          ctx.fillStyle = '#8B0000'; 
          ctx.fillRect(-90, -50, 180, 100);
          
          // Espectadores (Usar semente matemática baseada no node para não haver cintilação)
          const colors = ['#FFFFFF', '#FFD700', '#FF0000', '#0000FF'];
          for (let p = 0; p < 70; p++) {
              const pseudoRand1 = Math.abs(Math.sin(i * 12.9898 + p * 78.233)) % 1;
              const pseudoRand2 = Math.abs(Math.cos(i * 4.1414 + p * 43.123)) % 1;
              const pseudoRand3 = Math.abs(Math.sin(i * 9.5432 + p * 12.345)) % 1;
              
              ctx.fillStyle = colors[Math.floor(pseudoRand1 * colors.length)];
              ctx.fillRect(-85 + pseudoRand2*170, -45 + pseudoRand3*90, 4, 4);
          }
          ctx.restore();
      }
      
      // Casas F1 / Garagens centrais na Pit Lane
      if (pitSpline && pitSpline.length > 25) {
          const mIdx = Math.floor(pitSpline.length / 2);
          const gNode = pitSpline[mIdx];
          const ngNode = pitSpline[(mIdx + 1) % pitSpline.length];
          const dxBox = ngNode.x - gNode.x;
          const dyBox = ngNode.y - gNode.y;
          const bLen = Math.sqrt(dxBox*dxBox + dyBox*dyBox);
          let nxBox = -dyBox / bLen;
          let nyBox = dxBox / bLen;
          
          // Avaliar se colide com a pista principal. Se sim, inverter o lado
          const shiftBox = gNode.width * 1.5; // Colocar no limite da pitlane
          const testX = gNode.x + nxBox * shiftBox;
          const testY = gNode.y + nyBox * shiftBox;
          
          let minDistance = Infinity;
          let invertBox = false;

          if (isNewCache) {
             for (let m=0; m<spline.length; m++) {
                 let d2 = (spline[m].x - testX)**2 + (spline[m].y - testY)**2;
                 if (d2 < minDistance) minDistance = d2;
             }
             invertBox = (Math.sqrt(minDistance) < gNode.width * 1.5);
             colCache.boxes.colide = invertBox;
          } else {
             invertBox = colCache.boxes.colide;
          }

          if (invertBox) {
              nxBox = -nxBox;
              nyBox = -nyBox;
          }

          ctx.save();
          ctx.translate(gNode.x + nxBox * shiftBox, gNode.y + nyBox * shiftBox);
          ctx.rotate(Math.atan2(dyBox, dxBox));
          
          ctx.fillStyle = '#222222';
          ctx.fillRect(-200, -60, 400, 120); // Teto Maciço Principal
          ctx.fillStyle = '#444444';
          ctx.fillRect(-190, -50, 380, 100);
          
          ctx.fillText('BOX', -100, 0);
          ctx.fillText('BOX', 100, 0);
          
          ctx.restore();
      }

      // 5. Elementos Ambientais Distantes (Árvores, Lagos, Camiões)
      let decorSpacing = 160; 
      for (let i = 10; i < spline.length; i += decorSpacing) {
          const node = spline[i];
          const nextNode = spline[(i+1)%spline.length];
          const pDx = nextNode.x - node.x;
          const pDy = nextNode.y - node.y;
          const len = Math.sqrt(pDx*pDx + pDy*pDy);
          let nx = -pDy/len; let ny = pDx/len;
          
          if (nx * (node.x - cx) + ny * (node.y - cy) < 0) {
              nx = -nx; ny = -ny;
          }
          
          // Gerador pseudo-aleatório para NUNCA cintilar a 60FPS
          const seed = Math.abs(Math.sin(i * 999.99)) % 1;
          const seed2 = Math.abs(Math.cos(i * 555.55)) % 1;
          
          // Longe dos muros (Raio seguro > 3.0 para evitar qualquer colapso ou ilusão de bloqueio visual)
          const distOffset = node.width * (3.8 + seed * 4.0);
          const tX = node.x + nx * distOffset;
          const tY = node.y + ny * distOffset;
          
          // CRITICAL: Verificar se este ponto longínquo aterra noutra secção vizinha de pista (O circuito fecha e dobra)
          let colide = false;
          let decorIdx = Math.floor((i - 10) / decorSpacing);

          if (isNewCache) {
             for (let m = 0; m < spline.length; m++) {
                 // 4.0 * width garante que não fica colado ou sequer cortado por outro muro a 3.5
                 const marginSq = (spline[m].width * 4.0)**2; 
                 if ((spline[m].x - tX)**2 + (spline[m].y - tY)**2 < marginSq) {
                     colide = true; break;
                 }
             }
             colCache.decors[decorIdx] = colide;
          } else {
             colide = colCache.decors[decorIdx];
          }

          if (colide) continue; // Abortar paisagem aqui! Está em cima de outro alcatrão!
          
          ctx.save();
          ctx.translate(tX, tY);
          
          if (seed < 0.35) {
              // LAGO (Círculos fundidos)
              ctx.fillStyle = '#005588'; 
              ctx.beginPath(); ctx.arc(0, 0, 120 + seed2*80, 0, Math.PI*2); ctx.fill();
              ctx.beginPath(); ctx.arc(60, 40, 90 + seed*50, 0, Math.PI*2); ctx.fill();
              ctx.beginPath(); ctx.arc(-50, 60, 100 + seed*60, 0, Math.PI*2); ctx.fill();
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              ctx.beginPath(); ctx.arc(20, -20, 30, 0, Math.PI*2); ctx.fill();
          } else if (seed < 0.70) {
              // FLORESTA Densa (Conjunto de árvores redondas orgânicas)
              for (let t = 0; t < 12 + seed2*10; t++) {
                  const tS1 = Math.abs(Math.sin(t*11)) % 1;
                  const tS2 = Math.abs(Math.cos(t*22)) % 1;
                  const ox = -120 + tS1 * 240;
                  const oy = -120 + tS2 * 240;
                  const rad = 30 + tS1 * 30;
                  
                  ctx.fillStyle = '#0a1a08';
                  ctx.beginPath(); ctx.arc(ox, oy, rad + 4, 0, Math.PI*2); ctx.fill();
                  ctx.fillStyle = '#1A4314';
                  ctx.beginPath(); ctx.arc(ox - 3, oy - 3, rad, 0, Math.PI*2); ctx.fill();
                  ctx.fillStyle = '#2d6a22';
                  ctx.beginPath(); ctx.arc(ox - 8, oy - 8, rad/2, 0, Math.PI*2); ctx.fill();
              }
          } else {
              // PAVILHÃO / CAMIÕES DA EQUIPA (Logística)
              ctx.rotate(Math.atan2(pDy, pDx)); 
              ctx.fillStyle = '#2b2b2b'; 
              ctx.fillRect(-180, -120, 360, 240);
              
              const colors = ['#E10600', '#0000FF', '#CCCCCC', '#FF8700', '#00D2BE'];
              const tCol = colors[Math.floor(seed2 * colors.length)];
              
              for(let c=0; c<3; c++) {
                  ctx.save();
                  ctx.translate(-100 + c*90, -70 + seed2*30);
                  ctx.fillStyle = '#DDDDDD';
                  ctx.fillRect(0, 0, 120, 30); // Atrelado longo
                  ctx.fillStyle = tCol;
                  ctx.fillRect(0, 0, 120, 8); // Branding line
                  ctx.fillStyle = tCol;
                  ctx.fillRect(-30, 5, 25, 25); // Cabine do condutor
                  ctx.fillStyle = '#111';
                  ctx.fillRect(-25, 10, 10, 15); // Vidro escuro
                  ctx.restore();
              }
          }
          
          ctx.restore();
      }
      
      if (isNewCache) {
          environmentCollisionCache.set(spline, colCache);
      }
}

export function drawF1Car(ctx: CanvasRenderingContext2D, pColor: string, sColor: string, drsEnabled = false) {
  // Main body (Secondary Color / Carbon base)
  ctx.fillStyle = sColor || '#222';
  ctx.beginPath();
  ctx.moveTo(-15, -4); ctx.lineTo(10, -3); ctx.lineTo(15, -1);
  ctx.lineTo(15, 1); ctx.lineTo(10, 3); ctx.lineTo(-15, 4);
  ctx.fill();

  // Primary Color Livery over body
  ctx.fillStyle = pColor;
  ctx.beginPath();
  ctx.moveTo(-10, -2); ctx.lineTo(5, -1.5); ctx.lineTo(10, -0.5);
  ctx.lineTo(10, 0.5); ctx.lineTo(5, 1.5); ctx.lineTo(-10, 2);
  ctx.fill();

  // Sidepods (Primary color)
  ctx.fillRect(-5, -6, 12, 3);
  ctx.fillRect(-5, 3, 12, 3);

  // Front Wing (Secondary color)
  ctx.fillStyle = sColor || '#111';
  ctx.fillRect(12, -9, 3, 18);
  
  // Rear Wing (Carbon)
  ctx.fillStyle = '#111';
  ctx.fillRect(-15, -12, 4, 24);
  
  // Open DRS Flap visually
  if (drsEnabled) {
    ctx.fillStyle = '#0f0'; // Neon DRS indicator
    ctx.fillRect(-14, -10, 2, 20);
  }
  
  // Wheels (Pirelli soft red tires)
  const wheelColor = '#222222';
  ctx.fillStyle = wheelColor;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#555555';
  
  const drawWheel = (wx: number, wy: number) => {
     ctx.fillRect(wx, wy, 8, 5);
     ctx.strokeRect(wx, wy, 8, 5); // Outline helps separate black tire from black background
     
     ctx.fillStyle = '#E10600'; 
     ctx.fillRect(wx + 2, wy + 2, 4, 1);
     ctx.fillStyle = wheelColor;
  };
  drawWheel(-12, -14); 
  drawWheel(-12, 9);   
  drawWheel(8, -12);   
  drawWheel(8, 8);     

  // Helmet
  ctx.fillStyle = '#FFDD00';
  ctx.beginPath(); ctx.arc(-2, 0, 3, 0, Math.PI*2); ctx.fill();

  // F1 2026 Halo (Titanium structure)
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-2, 0, 3, -1.5, 1.5);
  ctx.stroke();
}
