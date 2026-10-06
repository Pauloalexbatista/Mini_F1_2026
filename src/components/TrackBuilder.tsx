import React, { useRef, useState, useEffect } from 'react';
import { TrackDef, parseStudioToNodes, parseStudioControlPoints, fuseAndComputePitLane } from '../tracks';
import { TrackProp, PROP_CATALOG, drawPropStudio } from '../trackProps';

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
  const [propsList, setPropsList] = useState<TrackProp[]>([]);
  const [activeLayer, setActiveLayer] = useState<'main' | 'pit' | 'props'>('main');
  const [selectedCatalogIndex, setSelectedCatalogIndex] = useState<number>(0);
  const [propAngle, setPropAngle] = useState<number>(0);
  const [hoverPos, setHoverPos] = useState<Point | null>(null);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [propCategory, setPropCategory] = useState<'all' | 'Cami�es Paddock' | 'P�rticos A�reos' | 'Bancadas' | 'Pain�is Curva'>('all');

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
          setPropsList([]);
          setExportedCode('');
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Add Point or Prop on Click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // Modo 3: Coloca��o de Props e Publicidade
    if (activeLayer === 'props') {
      // Se clicou perto de um prop existente, seleciona ou desseleciona
      const clickedExisting = propsList.find(p => (p.x - x)**2 + (p.y - y)**2 < 400); // 20px raio
      if (clickedExisting) {
        setSelectedPropId(clickedExisting.id === selectedPropId ? null : clickedExisting.id);
        return;
      }

      // Caso contr�rio, adiciona um novo prop no cat�logo selecionado
      const catalogItem = PROP_CATALOG[selectedCatalogIndex];
      if (!catalogItem) return;

      const newProp: TrackProp = {
        id: `prop_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: catalogItem.type,
        variant: catalogItem.variant,
        x: Math.round(x),
        y: Math.round(y),
        angle: (propAngle * Math.PI) / 180
      };

      setPropsList(prev => [...prev, newProp]);
      setExportedCode('');
      return;
    }

    // 1. Clamping de Margens do Ecr�
    const MARGIN = 12;
    x = Math.max(MARGIN, Math.min(1000 - MARGIN, x));
    y = Math.max(MARGIN, Math.min(750 - MARGIN, y));

    // 2. Anti-Sobreposi��o Din�mica
    const currentList = activeLayer === 'main' ? mainPoints : pitPoints;
    let overlap = false;
    for (let i = 0; i < currentList.length; i++) {
        const dSq = (currentList[i].x - x)**2 + (currentList[i].y - y)**2;
        const minDist = (i === currentList.length - 1) ? 12 : 22;
        if (dSq < minDist * minDist) {
            overlap = true;
            break;
        }
    }

    if (overlap) {
        alert("Espa�o Insuficiente! As pistas precisam de margem (Min: 35px) para n�o colidirem os muros de bet�o no jogo.");
        return;
    }

    // 3. Efeito �man (Magnetic Snap) de 30 pixeis
    if (activeLayer === 'pit') {
       let closestDistSq = Infinity;
       let closestP = null;
       mainPoints.forEach(p => {
          const dSq = (p.x - x)**2 + (p.y - y)**2;
          if (dSq < closestDistSq) { closestDistSq = dSq; closestP = p; }
       });
       if (closestDistSq < 900 && closestP) {
           x = closestP.x;
           y = closestP.y;
       }
    }

    if (activeLayer === 'main') setMainPoints([...mainPoints, { x, y }]);
    else setPitPoints([...pitPoints, { x, y }]);
    setExportedCode('');
  };

  // Bot�o direito no canvas: apaga prop clicado
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (activeLayer !== 'props' || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedProp = propsList.find(p => (p.x - x)**2 + (p.y - y)**2 < 625); // 25px raio
    if (clickedProp) {
      setPropsList(prev => prev.filter(p => p.id !== clickedProp.id));
      if (selectedPropId === clickedProp.id) setSelectedPropId(null);
    }
  };

  // Roda do rato: ajusta �ngulo de rota��o do prop
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (activeLayer === 'props') {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 15 : -15;
      setPropAngle(prev => (prev + delta + 360) % 360);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setHoverPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  const handleUndo = () => {
    if (activeLayer === 'main') setMainPoints(mainPoints.slice(0, -1));
    else if (activeLayer === 'pit') setPitPoints(pitPoints.slice(0, -1));
    else setPropsList(propsList.slice(0, -1));
    setExportedCode('');
  };

  const handleClear = () => {
    if (confirm(`Tem a certeza que quer apagar a camada ${activeLayer.toUpperCase()}?`)) {
      if (activeLayer === 'main') setMainPoints([]);
      else if (activeLayer === 'pit') setPitPoints([]);
      else setPropsList([]);
      setExportedCode('');
    }
  };

  const exportData = () => {
    if (mainPoints.length < 3) {
      alert('Precisa de pelo menos 3 pontos na Pista Principal para gerar c�digo!');
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

    const propsStr = propsList.length > 0 ? `
    props: ${JSON.stringify(propsList, null, 2)},` : '';
    
    const finalCode = `const NOME_PISTA_SVG = "${mainPath}";
${pitPath ? `const NOME_PISTA_PIT_SVG = "${pitPath}";
` : ''}
  {
    id: 'nome_pista',
    name: '${trackName.toUpperCase()}',
    nodes: parseStudioToNodes(NOME_PISTA_SVG, 15.0, 250, true),${pitPath ? `
    pitNodes: fuseAndComputePitLane(parseStudioControlPoints(NOME_PISTA_SVG, 15.0, 250, true), parseStudioControlPoints(NOME_PISTA_PIT_SVG, 15.0, 187.5, false)),` : ''}${propsStr}
  },`;
    
    setExportedCode(finalCode);
    navigator.clipboard.writeText(finalCode);
    alert('C�digo TypeScript Final copiado para o seu Clipboard!');
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

    const baseId = trackName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'custom_track';
    const trackId = `${baseId}_${Date.now()}`;

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
       pitNodes,
       svg_data: mainPath,
       pit_svg_data: pitPath || undefined,
       props: propsList
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
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Background Image
    if (bgImage) {
      ctx.globalAlpha = bgOpacity;
      const scale = Math.min(canvas.width / bgImage.width, canvas.height / bgImage.height);
      const x = (canvas.width / 2) - (bgImage.width / 2) * scale;
      const y = (canvas.height / 2) - (bgImage.height / 2) * scale;
      ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
      ctx.globalAlpha = 1.0;
    }

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

      // Layer 1: Muros de Bet�o Exteriores
      traceMain();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 325 / 15.0; 
      ctx.stroke();

      // Layer 2: Limite das Bermas Brancas/Vermelhas
      traceMain();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 310 / 15.0;
      ctx.stroke();

      // Layer 3: Asfalto Puro
      traceMain();
      ctx.strokeStyle = activeLayer === 'main' ? '#475569' : '#1e293b';
      ctx.lineWidth = 250 / 15.0;
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

      tracePit();
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = basePitW * 1.25;
      ctx.stroke();

      tracePit();
      ctx.strokeStyle = '#1A3314';
      ctx.lineWidth = basePitW * 1.5;
      ctx.stroke();

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

    // DRAW TRACK PROPS (CAMI�ES, BANCADAS, P�RTICOS, OUTDOORS)
    propsList.forEach(prop => {
      drawPropStudio(ctx, prop, prop.id === selectedPropId);
    });

    // DRAW GHOST PROP UNDER CURSOR
    if (activeLayer === 'props' && hoverPos) {
      const curItem = PROP_CATALOG[selectedCatalogIndex];
      if (curItem) {
        const ghostProp: TrackProp = {
          id: 'ghost',
          type: curItem.type,
          variant: curItem.variant,
          x: hoverPos.x,
          y: hoverPos.y,
          angle: (propAngle * Math.PI) / 180
        };
        ctx.globalAlpha = 0.6;
        drawPropStudio(ctx, ghostProp, false);
        ctx.globalAlpha = 1.0;
      }
    }

  }, [mainPoints, pitPoints, propsList, activeLayer, bgImage, bgOpacity, selectedPropId, hoverPos, selectedCatalogIndex, propAngle]);

  const filteredCatalog = propCategory === 'all' 
    ? PROP_CATALOG 
    : PROP_CATALOG.filter(p => p.category === propCategory);

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-neutral-950 border-b border-neutral-800 p-4 flex justify-between items-center z-10 shadow-lg">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter text-red-500">
            TRACK BUILDER <span className="text-white">STUDIO</span>
          </h1>
          <p className="text-sm text-neutral-400 font-medium">Laborat�rio Oficial Vetorial com Elementos de Paddock & Publicidade</p>
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
        <aside className="w-88 bg-neutral-950 border-r border-neutral-800 p-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
          
          {/* SELE��O DE CAMADA */}
          <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
            <h2 className="text-sm font-black uppercase tracking-wider mb-2 text-neutral-300">Modo de Edi��o</h2>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <button 
                onClick={() => setActiveLayer('main')} 
                className={`py-2.5 px-1 rounded-lg font-black text-[11px] uppercase tracking-tighter transition ${activeLayer==='main' ? 'bg-red-600 text-white shadow-md' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
              >
                Pista
              </button>
              <button 
                onClick={() => setActiveLayer('pit')} 
                className={`py-2.5 px-1 rounded-lg font-black text-[11px] uppercase tracking-tighter transition ${activeLayer==='pit' ? 'bg-blue-600 text-white shadow-md' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
              >
                Pit Lane
              </button>
              <button 
                onClick={() => setActiveLayer('props')} 
                className={`py-2.5 px-1 rounded-lg font-black text-[11px] uppercase tracking-tighter transition ${activeLayer==='props' ? 'bg-yellow-500 text-black shadow-md' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
              >
                Objetos ??
              </button>
            </div>
            
            <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-neutral-800">
              <span className="text-neutral-400 font-bold uppercase">
                {activeLayer === 'main' ? 'N�s Pista:' : activeLayer === 'pit' ? 'N�s Boxes:' : 'Objetos:'}
              </span>
              <span className="font-black text-base text-yellow-400">
                {activeLayer === 'main' ? mainPoints.length : activeLayer === 'pit' ? pitPoints.length : propsList.length}
              </span>
            </div>
          </div>

          {/* PAINEL DE OBJETOS E PUBLICIDADE (QUANDO NO MODO PROPS) */}
          {activeLayer === 'props' && (
            <div className="bg-neutral-900 p-4 rounded-xl border border-yellow-500/30 flex flex-col gap-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <h3 className="text-sm font-black uppercase text-yellow-400 flex items-center gap-2">
                  <span>???</span> Cat�logo F1
                </h3>
                <span className="text-[10px] text-neutral-400 font-bold">Roda do rato = Roda</span>
              </div>

              {/* Filtro de Categorias */}
              <div className="flex flex-wrap gap-1">
                {(['all', 'Cami�es Paddock', 'P�rticos A�reos', 'Bancadas', 'Pain�is Curva'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setPropCategory(cat)}
                    className={`text-[10px] font-black uppercase px-2 py-1 rounded transition ${propCategory === cat ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                  >
                    {cat === 'all' ? 'Todos' : cat.split(' ')[0]}
                  </button>
                ))}
              </div>

              {/* Lista de Itens do Cat�logo */}
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {filteredCatalog.map((item) => {
                  const globalIdx = PROP_CATALOG.findIndex(p => p.variant === item.variant);
                  const isSelected = selectedCatalogIndex === globalIdx;
                  return (
                    <button
                      key={item.variant}
                      onClick={() => setSelectedCatalogIndex(globalIdx)}
                      className={`flex items-center gap-3 p-2 rounded-lg border text-left transition ${isSelected ? 'bg-yellow-500/15 border-yellow-500 text-white' : 'bg-neutral-800/60 border-neutral-800 text-neutral-300 hover:border-neutral-700'}`}
                    >
                      <div className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20" style={{ backgroundColor: item.color }}></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs truncate">{item.name}</div>
                        <div className="text-[9px] text-neutral-400 truncate">{item.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Controlo de Rota��o */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase">Rota��o</span>
                  <span className="font-mono font-black text-yellow-400 text-xs">{propAngle}�</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max="355"
                  step="5"
                  value={propAngle}
                  onChange={(e) => setPropAngle(parseInt(e.target.value))}
                  className="w-full accent-yellow-400 cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {[0, 90, 180, 270].map(ang => (
                    <button
                      key={ang}
                      onClick={() => setPropAngle(ang)}
                      className={`text-[10px] font-bold py-1 rounded ${propAngle === ang ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                    >
                      {ang}�
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-neutral-400 bg-neutral-950 p-2.5 rounded border border-neutral-800/80 leading-relaxed">
                ?? <b className="text-white">Dica:</b> Clica no mapa para colocar. Bot�o direito num objeto para apagar.
              </div>
            </div>
          )}

          {/* DESFAZER / LIMPAR */}
          <div className="flex gap-2">
            <button 
              onClick={handleUndo} 
              disabled={(activeLayer === 'main' ? mainPoints.length : activeLayer === 'pit' ? pitPoints.length : propsList.length) === 0}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 transition py-2.5 rounded-lg font-black text-xs uppercase"
            >
              Desfazer
            </button>
            <button 
              onClick={handleClear} 
              disabled={(activeLayer === 'main' ? mainPoints.length : activeLayer === 'pit' ? pitPoints.length : propsList.length) === 0}
              className="flex-1 bg-red-900/30 text-red-500 hover:bg-red-900/50 disabled:opacity-40 transition py-2.5 rounded-lg font-black text-xs uppercase"
            >
              Limpar
            </button>
          </div>

          {/* IMAGEM DE FUNDO */}
          <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
            <h2 className="text-xs font-black uppercase text-neutral-400 mb-2">Mapa / Imagem de Fundo</h2>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload}
              className="block w-full text-xs text-neutral-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-red-500/10 file:text-red-500 hover:file:bg-red-500/20 cursor-pointer"
            />
            {bgImage && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] font-bold text-neutral-400 mb-1">
                  <span>OPACIDADE</span>
                  <span>{Math.round(bgOpacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" max="1" step="0.1" 
                  value={bgOpacity} 
                  onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                  className="w-full accent-red-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* NOME E A��ES */}
          <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 mt-auto">
            <h2 className="text-xs font-black uppercase text-neutral-400 mb-2">Nome da Pista</h2>
            <input 
              type="text" 
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              placeholder="Ex: GRANDE PR�MIO DE PORTUGAL"
              className="w-full bg-neutral-950 border border-neutral-700 text-white p-2.5 rounded-lg font-black mb-3 focus:outline-none focus:border-red-500 transition-colors uppercase text-sm"
            />
            
            <div className="flex flex-col gap-2.5">
               <button 
                 onClick={handleTestGame}
                 disabled={mainPoints.length < 3}
                 className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-black py-3.5 rounded-lg transition transform hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_rgba(22,163,74,0.4)] uppercase tracking-wider text-sm"
               >
                 ?? Gravar & Testar no Jogo
               </button>
               <button 
                 onClick={exportData}
                 disabled={mainPoints.length < 3}
                 className="w-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 font-bold py-2.5 rounded-lg transition text-xs uppercase"
               >
                 Copiar C�digo TypeScript
               </button>
            </div>
            {exportedCode && (
              <p className="text-[11px] text-green-400 font-bold mt-2 text-center">
                ? C�digo copiado com tra�ado e objetos!
              </p>
            )}
          </div>

        </aside>

        {/* WORKSPACE PREVIEW */}
        <main className="flex-1 flex flex-col items-center justify-center bg-black relative p-8">
            <div className="absolute top-4 left-4 pointer-events-none flex items-center gap-3">
                <span className="bg-black/50 px-3 py-1 rounded text-xs font-bold font-mono border border-neutral-800 text-neutral-400">CANVAS: 1000x750</span>
                {activeLayer === 'props' && (
                  <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded text-xs font-black uppercase border border-yellow-500/40">Modo Publicidade & Cami�es Ativo</span>
                )}
            </div>

            <div className="shadow-2xl border-4 border-neutral-800 rounded-xl overflow-hidden relative cursor-crosshair">
                <canvas 
                    ref={canvasRef}
                    width={1000}
                    height={750}
                    onClick={handleCanvasClick}
                    onContextMenu={handleContextMenu}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onWheel={handleWheel}
                    className="block"
                />
            </div>

            {mainPoints.length === 0 && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-red-500/20 text-red-400 border border-red-500/30 px-6 py-2 rounded-full font-bold text-sm pointer-events-none animate-pulse shadow-lg">
                    ?? Desenhe a Pista Principal! Clique para ancorar os N�s.
                </div>
            )}
            {mainPoints.length > 2 && pitPoints.length === 0 && activeLayer === 'pit' && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-blue-500/20 text-blue-400 border border-blue-500/30 px-6 py-2 rounded-full font-bold text-sm pointer-events-none animate-pulse shadow-lg">
                    ?? Modo Pit Lane Ativo. Desenhe os limites das boxes (Linha Azul).
                </div>
            )}
            {activeLayer === 'props' && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-6 py-2 rounded-full font-bold text-xs pointer-events-none shadow-lg">
                    ?? Clique para posicionar o objeto. Bot�o direito para apagar. Roda do rato para rodar!
                </div>
            )}
        </main>

      </div>
    </div>
  );
};
