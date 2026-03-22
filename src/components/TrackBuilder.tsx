import React, { useRef, useState, useEffect } from 'react';
import { TrackDef, parseStudioToNodes, parseStudioControlPoints, fuseAndComputePitLane } from '../tracks';

interface Point {
  x: number;
  y: number;
}

interface TrackBuilderProps {
  onExit: () => void;
  onTestTrack?: (track: TrackDef) => void;
}

export const TrackBuilder: React.FC<TrackBuilderProps> = ({ onExit, onTestTrack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mainPoints, setMainPoints] = useState<Point[]>([]);
  const [pitPoints, setPitPoints] = useState<Point[]>([]);
  const [activeLayer, setActiveLayer] = useState<'main' | 'pit'>('main');
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgOpacity, setBgOpacity] = useState<number>(0.5);
  const [exportedCode, setExportedCode] = useState<string>('');
  const [trackName, setTrackName] = useState<string>('Pista Personalizada');

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setBgImage(img);
          setMainPoints([]);
          setPitPoints([]);
          setExportedCode('');
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Add Point on Click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // 1. Clamping de Margens do Ecrã (Agora 12px = Raio apenas do Asfalto + Zebra + Muro sem relva!)
    const MARGIN = 12;
    x = Math.max(MARGIN, Math.min(1280 - MARGIN, x));
    y = Math.max(MARGIN, Math.min(720 - MARGIN, y));

    // 2. Anti-Sobreposição Dinâmica -> Distância Mínima: 22px (Taco a Taco com os 325px no Jogo!)
    const currentList = activeLayer === 'main' ? mainPoints : pitPoints;
    let overlap = false;
    for (let i = 0; i < currentList.length; i++) {
        const dSq = (currentList[i].x - x)**2 + (currentList[i].y - y)**2;
        // O último ponto desenhado pode estar a 12px (linha fluída). Os restantes validam a margem matemática dos 22px (330px no jogo)!
        const minDist = (i === currentList.length - 1) ? 12 : 22;
        if (dSq < minDist * minDist) {
            overlap = true;
            break;
        }
    }

    if (overlap) {
        alert("Espaço Insuficiente! As pistas precisam de margem (Min: 35px) para não colidirem os muros de betão no jogo.");
        return;
    }

    // 3. Efeito Íman (Magnetic Snap) de 30 pixeis
    if (activeLayer === 'pit') {
       let closestDistSq = Infinity;
       let closestP = null;
       mainPoints.forEach(p => {
          const dSq = (p.x - x)**2 + (p.y - y)**2;
          if (dSq < closestDistSq) { closestDistSq = dSq; closestP = p; }
       });
       if (closestDistSq < 900 && closestP) { // 30^2 = 900
           x = closestP.x;
           y = closestP.y;
       }
    }

    if (activeLayer === 'main') setMainPoints([...mainPoints, { x, y }]);
    else setPitPoints([...pitPoints, { x, y }]);
    setExportedCode('');
  };

  const handleUndo = () => {
    if (activeLayer === 'main') setMainPoints(mainPoints.slice(0, -1));
    else setPitPoints(pitPoints.slice(0, -1));
    setExportedCode('');
  };

  const handleClear = () => {
    if (confirm(`Tem a certeza que quer apagar a camada ${activeLayer.toUpperCase()}?`)) {
      if (activeLayer === 'main') setMainPoints([]);
      else setPitPoints([]);
      setExportedCode('');
    }
  };

  const activePoints = activeLayer === 'main' ? mainPoints : pitPoints;

  const exportData = () => {
    if (mainPoints.length < 3) {
      alert('Precisa de pelo menos 3 pontos na Pista Principal para gerar código!');
      return;
    }
    
    let mainPath = `M ${Math.round(mainPoints[0].x)},${Math.round(mainPoints[0].y)}`;
    for (let i = 1; i < mainPoints.length; i++) mainPath += ` L ${Math.round(mainPoints[i].x)},${Math.round(mainPoints[i].y)}`;
    mainPath += " Z";

    let pitPath = "";
    if (pitPoints.length > 1) {
      pitPath = `M ${Math.round(pitPoints[0].x)},${Math.round(pitPoints[0].y)}`;
      for (let i = 1; i < pitPoints.length; i++) pitPath += ` L ${Math.round(pitPoints[i].x)},${Math.round(pitPoints[i].y)}`;
    }
    
    const finalCode = `const NOME_PISTA_SVG = "${mainPath}";\n${pitPath ? `const NOME_PISTA_PIT_SVG = "${pitPath}";\n` : ''}
  {
    id: 'nome_pista',
    name: '${trackName.toUpperCase()}',
    nodes: parseStudioToNodes(NOME_PISTA_SVG, 15.0, 250, true),${pitPath ? `\n    pitNodes: fuseAndComputePitLane(parseStudioControlPoints(NOME_PISTA_SVG, 15.0, 250, true), parseStudioControlPoints(NOME_PISTA_PIT_SVG, 15.0, 187.5, false)),` : ''}
  },`;
    
    setExportedCode(finalCode);
    navigator.clipboard.writeText(finalCode);
    alert('Código TypeScript Final copiado para o seu Clipboard!');
  };

  const handleTestGame = () => {
    if (mainPoints.length < 3) {
      alert('Precisa de pelo menos 3 pontos na Pista Principal para testar!');
      return;
    }
    let mainPath = `M ${Math.round(mainPoints[0].x)},${Math.round(mainPoints[0].y)}`;
    for (let i = 1; i < mainPoints.length; i++) mainPath += ` L ${Math.round(mainPoints[i].x)},${Math.round(mainPoints[i].y)}`;
    mainPath += " Z";

    let pitPath = "";
    if (pitPoints.length > 1) {
      pitPath = `M ${Math.round(pitPoints[0].x)},${Math.round(pitPoints[0].y)}`;
      for (let i = 1; i < pitPoints.length; i++) pitPath += ` L ${Math.round(pitPoints[i].x)},${Math.round(pitPoints[i].y)}`;
    }

    const trackId = trackName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'custom_track';
    
    // Process math strictly identically to booting up standard tracks
    const nodes = parseStudioToNodes(mainPath, 15.0, 250, true);
    let pitNodes = undefined;
    if (pitPath) {
       pitNodes = fuseAndComputePitLane(
           parseStudioControlPoints(mainPath, 15.0, 250, true),
           parseStudioControlPoints(pitPath, 15.0, 187.5, false)
       );
    }

    const customTrack: TrackDef = {
       id: trackId,
       name: trackName.toUpperCase(),
       nodes,
       pitNodes
    };

    if (onTestTrack) {
        onTestTrack(customTrack);
    }
  };

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111827'; // Dark background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Background Image
    if (bgImage) {
      ctx.globalAlpha = bgOpacity;
      // Scale image to fit canvas while maintaining aspect ratio
      const scale = Math.min(canvas.width / bgImage.width, canvas.height / bgImage.height);
      const x = (canvas.width / 2) - (bgImage.width / 2) * scale;
      const y = (canvas.height / 2) - (bgImage.height / 2) * scale;
      ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
      ctx.globalAlpha = 1.0;
    }

    // Draw Lines
    // Draw Main Lines
    if (mainPoints.length > 0) {
      const traceMain = () => {
         ctx.beginPath();
         ctx.moveTo(mainPoints[0].x, mainPoints[0].y);
         for (let i = 1; i < mainPoints.length; i++) ctx.lineTo(mainPoints[i].x, mainPoints[i].y);
         if (mainPoints.length > 2) ctx.lineTo(mainPoints[0].x, mainPoints[0].y);
      };

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const baseMainW = 250 / 15.0;

      // Layer 1: Muros de Betão Exteriores (Esganados, City Circuit limit!)
      traceMain();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = baseMainW * 1.3;
      ctx.stroke();

      // Layer 2: Zebras Interiores (Apenas Branco para contraste Studio)
      traceMain();
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = baseMainW * 1.2;
      ctx.stroke();

      // Layer 3: Asfalto
      traceMain();
      ctx.strokeStyle = activeLayer === 'main' ? '#475569' : '#1e293b';
      ctx.lineWidth = baseMainW;
      ctx.stroke();

      mainPoints.forEach((p, index) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? '#10b981' : '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Draw Pit Lines
    if (pitPoints.length > 0) {
      const tracePit = () => {
        ctx.beginPath();
        ctx.moveTo(pitPoints[0].x, pitPoints[0].y);
        for (let i = 1; i < pitPoints.length; i++) {
          ctx.lineTo(pitPoints[i].x, pitPoints[i].y);
        }
      };
      
      const basePitW = 187.5 / 15.0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';

      // Layer 0: Pit Lane Border (Muro Extra Estúdio)
      tracePit();
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = basePitW * 1.25;
      ctx.stroke();

      // Layer 1: Pit Lane Grass (Física Estúdio Expandida 1.5x)
      tracePit();
      ctx.strokeStyle = '#1A3314'; // Corrente com Física 1.5x no Game.tsx
      ctx.lineWidth = basePitW * 1.5;
      ctx.stroke();

      // Layer 2: Pit Lane Asfalto
      tracePit();
      ctx.strokeStyle = activeLayer === 'pit' ? '#64748b' : '#334155';
      ctx.lineWidth = basePitW;
      ctx.stroke();

      pitPoints.forEach((p, index) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? '#10b981' : '#60a5fa';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

  }, [mainPoints, pitPoints, activeLayer, bgImage, bgOpacity]);

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-neutral-950 border-b border-neutral-800 p-4 flex justify-between items-center z-10 shadow-lg">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter text-red-500">
            TRACK BUILDER <span className="text-white">STUDIO</span>
          </h1>
          <p className="text-sm text-neutral-400 font-medium">Laboratório Oficial Vetorial Baseado em Splines</p>
        </div>
        <button 
          onClick={onExit}
          className="bg-neutral-800 hover:bg-neutral-700 transition font-bold px-6 py-2 rounded-lg"
        >
          SAIR PARA O JOGO
        </button>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR TOOLS */}
        <aside className="w-80 bg-neutral-950 border-r border-neutral-800 p-6 flex flex-col gap-6 overflow-y-auto">
          
          <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
            <h2 className="text-lg font-bold mb-2">1. Imagem de Fundo</h2>
            <p className="text-xs text-neutral-400 mb-4">Faça upload de um mapa de um circuito clássico para guiar o seu decalque.</p>
            <input 
              type="file" 
              title="Carregar Imagem de Fundo (Mapa da Pista)"
              aria-label="Upload Background Image"
              accept="image/*" 
              onChange={handleImageUpload}
              className="block w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-red-500/10 file:text-red-500 hover:file:bg-red-500/20 cursor-pointer"
            />
            {bgImage && (
              <div className="mt-4">
                <label className="text-xs font-bold text-neutral-400 block mb-2">OPACIDADE ({Math.round(bgOpacity * 100)}%)</label>
                <input 
                  type="range" 
                  title="Opacidade da Imagem"
                  aria-label="Controlar a Opacidade do Mapa de Fundo"
                  min="0.1" max="1" step="0.1" 
                  value={bgOpacity} 
                  onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                  className="w-full accent-red-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
            <h2 className="text-lg font-bold mb-2">2. Geometria</h2>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setActiveLayer('main')} className={`flex-1 py-2 rounded font-bold text-xs transition ${activeLayer==='main' ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>PISTA PRINCIPAL</button>
              <button onClick={() => setActiveLayer('pit')} className={`flex-1 py-2 rounded font-bold text-xs transition ${activeLayer==='pit' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>PIT LANE</button>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-neutral-400 font-mono text-sm">Nós ({activeLayer.toUpperCase()}):</span>
              <span className="font-bold text-xl text-yellow-500">{activePoints.length}</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleUndo} disabled={activePoints.length === 0}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 transition py-2 rounded-lg font-bold text-sm"
              >
                DESFAZER
              </button>
              <button 
                onClick={handleClear} disabled={activePoints.length === 0}
                className="flex-1 bg-red-900/30 text-red-500 hover:bg-red-900/50 disabled:opacity-50 transition py-2 rounded-lg font-bold text-sm"
              >
                LIMPAR
              </button>
            </div>
          </div>

          <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 mt-auto">
            <h2 className="text-lg font-bold mb-2">3. Nome e Ação</h2>
            <input 
              type="text" 
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              placeholder="Nome da sua pista..."
              className="w-full bg-neutral-950 border border-neutral-700 text-white p-3 rounded-lg font-bold mb-4 focus:outline-none focus:border-red-500 transition-colors uppercase"
            />
            
            <div className="flex flex-col gap-3">
               <button 
                 onClick={handleTestGame}
                 disabled={mainPoints.length < 3}
                 className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-black py-4 rounded-lg transition transform hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(22,163,74,0.4)]"
               >
                 TESTAR NO JOGO
               </button>
               <button 
                 onClick={exportData}
                 disabled={mainPoints.length < 3}
                 className="w-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-300 font-bold py-3 rounded-lg transition"
               >
                 COPIAR CÓDIGO TS
               </button>
            </div>
            {exportedCode && (
              <p className="text-xs text-green-400 font-medium mt-3 text-center">
                ✔ Código TypeScript copiado! Cole diretamente na const TRACKS em tracks.ts
              </p>
            )}
          </div>

        </aside>

        {/* WORKSPACE PREVIEW */}
        <main className="flex-1 flex flex-col items-center justify-center bg-black relative p-8">
            <div className="absolute top-4 left-4 pointer-events-none">
                <span className="bg-black/50 px-3 py-1 rounded text-xs font-bold font-mono border border-neutral-800 text-neutral-500">CANVAS RESOLUTION: 1000x750</span>
            </div>
            <div className="shadow-2xl border-4 border-neutral-800 rounded overflow-hidden relative cursor-crosshair">
                <canvas 
                    ref={canvasRef}
                    width={1000}
                    height={750}
                    onClick={handleCanvasClick}
                    className="block"
                />
            </div>
            {mainPoints.length === 0 && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-red-500/20 text-red-400 border border-red-500/30 px-6 py-2 rounded-full font-bold text-sm pointer-events-none animate-pulse shadow-lg">
                    ☝️ Desenhe a Pista Principal! Clique para ancorar os Nós.
                </div>
            )}
            {mainPoints.length > 2 && pitPoints.length === 0 && activeLayer === 'pit' && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-blue-500/20 text-blue-400 border border-blue-500/30 px-6 py-2 rounded-full font-bold text-sm pointer-events-none animate-pulse shadow-lg">
                    🔧 Modo Pit Lane Ativo. Desenhe os limites das boxes (Linha Azul).
                </div>
            )}
        </main>

      </div>
    </div>
  );
};
