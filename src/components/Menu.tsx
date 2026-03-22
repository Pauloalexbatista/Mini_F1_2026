import React, { useState, useEffect, useRef } from 'react';
import { PlayerConfig, CarSetupType } from '../types';
import { TRACKS as DEFAULT_TRACKS, TrackDef, computeSpline, getTrackTelemetry } from '../tracks';
import { drawTrack, drawF1Car } from '../renderer';
import { TEAM_LIVERIES } from '../App';

function MenuCarPreview({ p, s }: { p: string, s?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     ctx.clearRect(0,0, 180, 60);
     ctx.save();
     ctx.translate(90, 30);
     ctx.scale(2.5, 2.5);
     drawF1Car(ctx, p, s || '#222', false);
     ctx.restore();
  }, [p, s]);
  return <canvas ref={canvasRef} width={180} height={60} className="block mx-auto" />;
}

function TrackPreview({ track }: { track: TrackDef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (track.nodes.length > 0) {
      const spline = track.nodes;
      const pitSpline = track.pitNodes ? track.pitNodes : null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      spline.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      });
      const pad = 500;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      const tWidth = maxX - minX;
      const tHeight = maxY - minY;
      
      const scale = Math.min(canvas.width / tWidth, canvas.height / tHeight);
      
      ctx.save();
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.scale(scale, scale);
      ctx.translate(-(minX + maxX)/2, -(minY + maxY)/2);
      
      drawTrack(ctx, spline, pitSpline, true);
      ctx.restore();
    }
  }, [track]);

  return (
    <div className="relative overflow-hidden bg-[#15151e] shrink-0 w-full h-full min-h-[160px] flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={337}
        className="block opacity-90 object-contain w-full h-full max-h-[200px]"
      />
    </div>
  );
}

function TrackTelemetryDisplay({ track }: { track: TrackDef }) {
  const telemetry = React.useMemo(() => getTrackTelemetry(track.nodes), [track]);
  
  return (
    <div className="w-full bg-[#111116] border-t border-gray-800 p-3 grid grid-cols-4 gap-x-2 gap-y-3 text-center text-white pb-4 z-20 relative shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
       <div className="flex flex-col justify-center">
          <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Extensão</span>
          <span className="block text-lg font-black leading-none">{telemetry.lengthKm} <span className="text-[10px] text-gray-400">KM</span></span>
       </div>
       <div className="border-l border-gray-800 flex flex-col justify-center">
          <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Curvas</span>
          <span className="block text-lg font-black leading-none">{telemetry.corners}</span>
       </div>
       <div className="border-l border-gray-800 flex flex-col justify-center">
          <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Top Speed</span>
          <span className="block text-lg font-black text-[#E10600] leading-none">{telemetry.topSpeedKmh} <span className="text-[10px] text-gray-400">KM/H</span></span>
       </div>
       <div className="border-l border-gray-800 flex flex-col justify-center">
          <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Min Apex</span>
          <span className="block text-lg font-black text-yellow-500 leading-none">{telemetry.minCornerKmh} <span className="text-[10px] text-gray-400">KM/H</span></span>
       </div>
    </div>
  );
}

interface MenuProps {
  players: PlayerConfig[];
  playerCount: number;
  setPlayerCount: (count: number) => void;
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  totalLaps: number;
  setTotalLaps: (laps: number) => void;
  onStart: () => void;
  onOpenBuilder: () => void;
  onOpenProfile: () => void;
  onUpdatePlayer: (index: number, config: PlayerConfig) => void;
  onDeleteTrack?: (id: string) => void;
  user?: any;
  tracks: TrackDef[];
}

export default function Menu({ players, playerCount, setPlayerCount, selectedTrack, setSelectedTrack, totalLaps, setTotalLaps, onStart, onOpenBuilder, onOpenProfile, onUpdatePlayer, onDeleteTrack, user, tracks }: MenuProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'tracks'>('overview');
  const [activeKeyConfig, setActiveKeyConfig] = useState<{ playerIndex: number, action: keyof PlayerConfig['controls'] } | null>(null);
  
  const [readyPlayers, setReadyPlayers] = useState<Record<number, boolean>>({});
  const ALL_TRACKS = [...tracks, ...DEFAULT_TRACKS.filter(sysT => !tracks.some(dbT => dbT.id === sysT.id))];
  const tracksAreReady = ALL_TRACKS.length > 0;

  // Helper guard
  const activeTrackObj = ALL_TRACKS.find(t => t.id === selectedTrack) || ALL_TRACKS[0] || null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeKeyConfig) {
        e.preventDefault();
        const { playerIndex, action } = activeKeyConfig;
        const newPlayer = { ...players[playerIndex] };
        newPlayer.controls[action] = e.code;
        onUpdatePlayer(playerIndex, newPlayer);
        setActiveKeyConfig(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeKeyConfig, players, onUpdatePlayer]);

  const renderKeyButton = (playerIndex: number, action: keyof PlayerConfig['controls'], label: string) => {
    const isActive = activeKeyConfig?.playerIndex === playerIndex && activeKeyConfig?.action === action;
    const keyName = players[playerIndex]?.controls[action]?.replace('Key', '')?.replace('Arrow', '') || '';
    
    return (
      <div className="flex justify-between items-center bg-gray-100 px-3 py-2 rounded">
        <span className="text-xs text-gray-500 font-bold uppercase">{label}</span>
        <button 
          className={`px-3 py-1 text-[11px] font-bold uppercase rounded transition-colors ${isActive ? 'bg-[#E10600] text-white animate-pulse' : 'bg-gray-300 text-gray-800 hover:bg-gray-400'}`}
          onClick={() => setActiveKeyConfig({ playerIndex, action })}
        >
          {isActive ? '...' : keyName}
        </button>
      </div>
    );
  };

  const getCountry = (name: string) => {
    if (name.includes('ITÁLIA')) return 'ITALY';
    if (name.includes('CANADÁ')) return 'CANADA';
    if (name.includes('BÉLGICA')) return 'BELGIUM';
    if (name.includes('AUSTRÁLIA')) return 'AUSTRALIA';
    if (name.includes('CHINA')) return 'CHINA';
    if (name.includes('JAPÃO')) return 'JAPAN';
    if (name.includes('USA')) return 'UNITED STATES';
    if (name.includes('BAHRAIN') || name.includes('SAKHIR')) return 'BAHRAIN';
    return 'INTERNATIONAL';
  };

  const SETUP_CARDS = [
    { id: 'LOW_DF' as CarSetupType, name: 'FULL SPEED', speed: '360 KM/H', grip: 'Normal', color: 'border-blue-500', desc: 'Aero Mínima. Feito para voar nas retas longas mas um diabo para curvar a alta velocidade.' },
    { id: 'BALANCED' as CarSetupType, name: 'BALANCED', speed: '260 KM/H', grip: 'Aumentado', color: 'border-white', desc: 'O Setup Standard Misto. Balanço matemático entre velocidade de ponta e agressividade em curva.' },
    { id: 'HIGH_DF' as CarSetupType, name: 'FULL CURVE', speed: '160 KM/H', grip: 'Extremo', color: 'border-[#E10600]', desc: 'Asas no ângulo máximo (+60% Downforce Lateral). Devora ganchos fechados sem pisar o travão.' }
  ];

  return (
    <div className="min-h-screen bg-[#15151e] text-white font-f1 flex flex-col pt-0 pb-20 w-full overflow-x-hidden relative">
      
      {/* Top Header - F1 Official Style */}
      <header className={`bg-[#15151e] text-white flex items-center justify-between px-0 sm:px-6 py-0 border-t-4 border-[#E10600] z-20 shadow-md h-16 w-full sticky top-0 opacity-100`}>
        <div className="flex items-center w-full h-full max-w-7xl mx-auto">
          {/* F1 Logo Box */}
          <div className="flex items-center justify-center bg-[#E10600] text-white font-black text-3xl px-6 h-full mr-6 select-none relative z-30 transform -skew-x-12 -ml-4">
            <span className="inline-block transform skew-x-12 mt-1 tracking-tighter">F1</span>
          </div>
          
          {/* Navigation Links (Tabs) */}
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-bold tracking-widest uppercase h-full pt-1">
            <button onClick={() => setActiveTab('overview')} className={`flex items-center h-full hover:text-white transition-colors border-b-2 ${activeTab === 'overview' ? 'border-[#E10600] text-gray-100' : 'border-transparent text-gray-400'}`}>Paddock</button>
            <button onClick={() => setActiveTab('teams')} className={`flex items-center h-full hover:text-white transition-colors border-b-2 ${activeTab === 'teams' ? 'border-[#E10600] text-gray-100' : 'border-transparent text-gray-400'}`}>Teams</button>
            <button onClick={() => setActiveTab('tracks')} className={`flex items-center h-full hover:text-white transition-colors border-b-2 ${activeTab === 'tracks' ? 'border-[#E10600] text-gray-100' : 'border-transparent text-gray-400'}`}>Tracks</button>
            <button onClick={onOpenProfile} className={`flex items-center h-full hover:text-white transition-colors border-b-2 border-transparent text-[#E10600] ml-4 hover:border-[#E10600]`}>
              <svg className="w-4 h-4 mr-1.5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              PILOTO
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-5">
             <div className="hidden lg:flex flex-col text-right mr-2 justify-center">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-[10px]">2026 FIA Formula One</span>
                <span className="text-xs font-black text-white uppercase tracking-widest leading-[12px] mt-1">World Championship™</span>
             </div>
             
             <button 
                onClick={onStart}
                disabled={ALL_TRACKS.length === 0 || !players.filter(p => !p.isBot).every(p => readyPlayers[p.id])}
                className={`text-white font-black text-[13px] tracking-widest pt-2 pb-1.5 px-6 rounded transition-colors flex items-center shadow-[0_0_15px_rgba(225,6,0,0.4)] h-[36px] ${tracksAreReady ? (players.filter(p => !p.isBot).every(p => readyPlayers[p.id]) ? 'bg-[#E10600] cursor-pointer hover:bg-white hover:text-[#E10600]' : 'bg-gray-800 opacity-50 cursor-not-allowed') : 'bg-gray-800 opacity-50 cursor-not-allowed'}`}
             >
                {players.filter(p => !p.isBot).every(p => readyPlayers[p.id]) ? (
                   <>IR PARA A <span className="hidden sm:inline ml-1">CORRIDA</span> <svg className="w-4 h-4 ml-2 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></>
                ) : (
                   'A AGUARDAR PILOTOS...'
                )}
             </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-10 flex-1 w-full z-10 relative">
        
        {activeTab === 'overview' && (
           <div className="animate-in fade-in duration-500">
             <div className="flex flex-col lg:flex-row gap-8 mb-12">
                {/* ESQUERDA - CONFIGURAÇÃO DA SESSÃO */}
                <div className="flex-1 bg-[#15151e] border-2 border-gray-800 rounded-xl p-6 relative overflow-hidden">
                   <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                      <div className="w-1.5 h-6 bg-[#E10600]"></div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Configuração da Sessão</h3>
                   </div>

                   {/* Calendário de Pistas */}
                   <div className="p-4 bg-black/40 rounded-lg border border-gray-800 flex flex-col min-h-[160px]">
                      <div className="flex justify-between items-end mb-4">
                         <label className="text-xs text-gray-500 font-bold uppercase tracking-widest">Calendário de Pistas</label>
                         {user?.role === 'admin' && (
                             <button 
                               onClick={() => setActiveTab('tracks')}
                               className="text-[10px] text-[#E10600] font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
                             >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                                Adicionar Circuito
                             </button>
                         )}
                      </div>

                      <div className="flex-1 space-y-3">
                         <div className="bg-[#1e1e24] border-l-4 border-[#E10600] p-3 flex flex-col sm:flex-row justify-between items-center rounded shadow-sm gap-4">
                            <div className="flex flex-col flex-1">
                               <span className="font-black text-white uppercase text-sm tracking-widest w-full truncate">{activeTrackObj?.name || 'SELECIONAR OU CRIAR PISTA ...'}</span>
                               <span className="text-[10px] text-[#E10600] font-bold uppercase tracking-widest mt-1">Sessão Inaugural</span>
                            </div>
                            
                            <div className="flex items-center gap-3 bg-black py-1 px-3 rounded border border-gray-700">
                               <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">VOLTAS</label>
                               <input 
                                 type="number" 
                                 min="1" 
                                 max="99" 
                                 value={totalLaps} 
                                 onChange={(e) => setTotalLaps(parseInt(e.target.value) || 1)} 
                                 className="bg-transparent text-[#E10600] font-black text-xl text-center w-12 outline-none" 
                               />
                            </div>
                         </div>
                         {/* Placeholder para futuras pistas no campeonato */}
                      </div>

                      <div className="bg-[#1e1e24] border-l-4 border-gray-600 p-3 flex justify-between items-center rounded shadow-sm gap-4 mt-3 mb-4">
                         <div className="flex flex-col flex-1">
                            <span className="font-bold text-gray-300 uppercase text-[10px] tracking-widest">Capacidade do Lobby</span>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Automático: Restantes vagas = Bots AI</span>
                         </div>
                         
                         <div className="flex items-center gap-2 bg-black py-1 px-3 rounded border border-gray-700">
                            <label className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">HUMANOS</label>
                            <select 
                               value={playerCount}
                               onChange={(e) => setPlayerCount(parseInt(e.target.value))}
                               className="bg-transparent text-white font-black text-sm outline-none cursor-pointer"
                            >
                               {[1,2,3,4,5,6].map(n => (
                                 <option key={n} value={n} className="bg-[#15151e]">{n}</option>
                               ))}
                            </select>
                         </div>
                      </div>

                      <div className="pt-4 mt-auto text-right border-t border-gray-800">
                         <span className="text-xs font-bold uppercase tracking-widest text-[#E10600]">
                            Modo Atual: Corrida Única Standard
                         </span>
                      </div>
                   </div>
                </div>

                {/* DIREITA - GRELHA DE PARTIDA (LOBBY ONLINE) */}
                <div className="flex-1 bg-[#15151e] border-2 border-gray-800 rounded-xl p-6">
                   <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                      <div className="w-1.5 h-6 bg-white"></div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Grelha de Partida</h3>
                   </div>

                   <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-4">Pilotos na Sessão</p>

                   <div className="flex flex-col gap-3 min-h-[300px]">
                      {/* Jogadores Humanos (Local ou Network) */}
                      {players.filter(p => !p.isBot).map((p, idx) => (
                        <div key={p.id} className={`bg-black/60 border ${readyPlayers[p.id] ? 'border-[#E10600]' : 'border-gray-700'} p-4 flex justify-between items-center rounded-lg relative overflow-hidden group hover:border-[#E10600] transition-colors`}>
                           <div className="absolute left-0 top-0 w-1.5 h-full" style={{ backgroundColor: p.color }}></div>
                           <div className="pl-3 flex flex-col justify-center">
                                 <span className="text-white font-black uppercase tracking-tighter text-lg leading-tight">{p.driverName} {idx === 0 && <span className="text-[#E10600] ml-1 text-[10px] uppercase tracking-widest border border-[#E10600] rounded px-1.5 py-0.5">(HOST)</span>}</span>
                                 <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{p.teamName}</span>
                           </div>
                           <div>
                              <button 
                                 onClick={() => setReadyPlayers(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                 className={`${readyPlayers[p.id] ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] border border-green-500' : 'bg-transparent border border-gray-600 text-gray-500 hover:bg-gray-800 hover:text-white'} px-4 sm:px-6 py-2 sm:py-3 rounded text-[10px] sm:text-xs font-black italic uppercase tracking-widest transition-all flex items-center gap-2`}
                              >
                                 {readyPlayers[p.id] ? (
                                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> PRONTO</>
                                 ) : (
                                    'CLICAR PRONTO'
                                 )}
                              </button>
                           </div>
                        </div>
                      ))}

                      {/* Vagas Abertas / Modo Suspenso */}
                      <div className="mt-auto bg-black/30 border-2 border-gray-800 border-dashed p-4 flex justify-center items-center rounded-lg min-h-[80px] opacity-70">
                         <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest text-center leading-relaxed">
                            A AGUARDAR PILOTOS ONLINE...<br/>
                            <span className="opacity-50">(Bot AI irá preencher as {11 - players.filter(p => !p.isBot).length} vagas restantes no momento da partida)</span>
                         </span>
                      </div>
                   </div>
                </div>
              </div>
           </div>
        )}

        {/* TEAMS CAROUSEL UI */}
        {activeTab === 'teams' && (
           <div className="animate-in fade-in duration-500">
             <div className="mb-6 flex justify-between items-end border-b border-gray-200 pb-4">
                <h2 className="text-3xl font-black text-black uppercase tracking-tighter">SELECT YOUR TEAM</h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6 w-full">
               {TEAM_LIVERIES.map((team, idx) => {
                  const isSelected = players[0]?.teamName === team.name;
                  return (
                    <div 
                      key={team.name}
                      onClick={() => {
                         const newPlayer = { ...players[0] };
                         newPlayer.color = team.p;
                         newPlayer.color2 = team.s;
                         newPlayer.teamName = team.name;
                         newPlayer.driverName = team.d1;
                         onUpdatePlayer(0, newPlayer);
                      }}
                      className={`cursor-pointer rounded-2xl p-6 transition-all duration-300 border-4 flex flex-col h-full ${isSelected ? 'border-[#E10600] bg-[#1a1a24] shadow-[0_15px_40px_rgba(225,6,0,0.25)] transform md:-translate-y-2 relative z-10' : 'border-gray-800 bg-[#15151e] hover:border-gray-600 hover:-translate-y-1'}`}
                    >
                       <div className="flex justify-between items-center mb-6">
                          <div className="flex items-start gap-3">
                             <div className="w-2 h-12 rounded flex-shrink-0" style={{ backgroundColor: team.p }}></div>
                             <span className="text-white font-black uppercase text-xl md:text-2xl tracking-tighter leading-none mt-1">{team.name}</span>
                          </div>
                       </div>
                       
                       <div className="flex justify-between items-center text-gray-400 font-bold uppercase mt-auto border-t border-gray-800 pt-5 px-1 text-xs tracking-widest">
                          <span className={players[0]?.driverName === team.d1 && isSelected ? 'text-white' : ''}>{team.d1}</span>
                          <span className="text-[#E10600] opacity-50 px-1 text-[10px]">VS</span>
                          <span className={players[0]?.driverName === team.d2 && isSelected ? 'text-white' : ''}>{team.d2}</span>
                       </div>

                       <div className="mt-6 bg-black/60 rounded-xl py-6 border border-white/5 flex items-center justify-center shadow-[inset_0_5px_20px_rgba(0,0,0,0.5)]">
                           <MenuCarPreview p={team.p} s={team.s} />
                       </div>
                       
                       <div className="mt-6 flex justify-center">
                          {isSelected ? (
                             <span className="bg-[#E10600] text-white font-black px-8 py-3 uppercase tracking-widest rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(225,6,0,0.5)] text-sm">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                               ATIVA
                             </span>
                          ) : (
                             <span className="text-gray-500 font-bold px-8 py-3 uppercase tracking-widest text-sm border-2 border-gray-700 rounded-lg group-hover:text-white group-hover:border-gray-500 transition-colors">SELECIONAR</span>
                          )}
                       </div>
                    </div>
                  )
               })}
             </div>
             
             <div className="mt-4 mb-10 flex flex-col md:flex-row justify-end items-center border-t border-gray-800 pt-8 gap-6">
                <button 
                  onClick={() => setActiveTab('overview')}
                  className="bg-white text-black font-black uppercase tracking-widest px-10 py-4 pb-3 rounded-xl hover:bg-gray-300 transition-colors w-full md:w-auto text-center"
                >
                  CONFIRMAR EQUIPA
                </button>
             </div>
           </div>
        )}

        {/* TRACKS CAROUSEL UI */}
        {activeTab === 'tracks' && (
           <div className="animate-in fade-in duration-500">
             <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-800 pb-4 gap-4">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">SELECT YOUR TRACK</h2>
                {user?.role === 'admin' && (
                    <button 
                      onClick={onOpenBuilder}
                      className="bg-[#E10600] text-white font-black uppercase tracking-widest text-[11px] px-6 py-3 rounded hover:bg-white hover:text-[#E10600] transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(225,6,0,0.5)]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      NOVO CIRCUITO - TRACK BUILDER
                    </button>
                )}
             </div>
             
             {ALL_TRACKS.length > 0 ? (
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-8 w-full">
                 {ALL_TRACKS.map((t, i) => {
                    const isSelected = selectedTrack === t.id;
                    const isSystemTrack = DEFAULT_TRACKS.some(sysT => sysT.id === t.id);
                    return (
                      <div 
                        key={t.id}
                        onClick={() => setSelectedTrack(t.id)}
                        className={`cursor-pointer w-full flex flex-col h-full bg-[#15151e] rounded-2xl overflow-hidden transition-all duration-300 border-4 ${isSelected ? 'border-[#E10600] shadow-[0_15px_40px_rgba(225,6,0,0.4)] transform md:-translate-y-2 z-10 relative' : 'border-gray-800 opacity-95 hover:opacity-100 hover:border-gray-600 hover:-translate-y-1'}`}
                      >
                         <div className="p-6 border-b border-gray-800 bg-[#15151e] z-10 relative">
                             {/* APAGAR PISTA (Só permite se não for sistema) */}
                             {!isSystemTrack && (
                               <button
                                 onClick={(e) => { 
                                   e.stopPropagation(); 
                                   if(confirm(`Tem a certeza que quer apagar a pista '${t.name}'?`)) {
                                       if (onDeleteTrack) onDeleteTrack(t.id);
                                   }
                                 }}
                                 className="absolute top-4 right-4 bg-black/50 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur transition z-50"
                                 title={`Apagar ${t.name}`}
                               >
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                               </button>
                             )}

                           <div className="flex justify-between items-center mb-3">
                             <span className="text-[11px] font-black text-white uppercase tracking-widest block bg-[#E10600] rounded px-2 py-0.5">ROUND {i+1}</span>
                           </div>
                           <h3 className="text-2xl lg:text-3xl font-black uppercase text-white tracking-tighter leading-tight mb-1 break-words w-[80%]">{t.name}</h3>
                           <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{getCountry(t.name)}</p>
                         </div>
                         
                         <div className="w-full flex-grow bg-[#111116] flex flex-col pt-0 pb-0 relative">
                            <div className="w-full flex items-center justify-center p-0 m-0 relative">
                               <TrackPreview track={t} />
                            </div>
                         </div>
                         
                         <TrackTelemetryDisplay track={t} />

                         <div className="p-5 bg-gray-100 border-t border-gray-300 flex justify-center mt-auto">
                            {isSelected ? (
                               <span className="bg-[#E10600] text-white font-black px-8 py-3 uppercase tracking-widest rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(225,6,0,0.5)] text-sm">
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                 ATIVA
                               </span>
                            ) : (
                               <span className="text-gray-700 border-2 border-gray-300 bg-white font-bold px-8 py-3 uppercase tracking-widest text-xs rounded-lg transition-colors hover:text-black hover:border-gray-400">SELECIONAR</span>
                            )}
                         </div>
                      </div>
                    )
                 })}
               </div>
             ) : (
               <div className="flex flex-col items-center justify-center p-20 bg-[#15151e] rounded-2xl border border-gray-800">
                  <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172A4 4 0 015.5 14h-.5a2 2 0 01-2-2v-4a2 2 0 012-2h.5a4 4 0 013.672-2.172M16.172 9.172A4 4 0 0120 11h.5a2 2 0 012 2v4a2 2 0 01-2 2h-.5a4 4 0 01-3.672 2.172M9.172 16.172l6.828-6.828" /></svg>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-3">Sem Pistas Disponíveis</h3>
                  <p className="text-gray-400 max-w-sm text-center mb-8 text-sm leading-relaxed">Nenhuma pista construída na base de dados global.</p>
                  
                  {user?.role === 'admin' && (
                      <button 
                        onClick={onOpenBuilder}
                        className="bg-[#E10600] text-white font-black uppercase tracking-widest text-[13px] px-8 py-4 rounded hover:bg-white hover:text-[#E10600] transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(225,6,0,0.5)]"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        ABRIR TRACK BUILDER STUDIO
                      </button>
                  )}
               </div>
             )}
             
             <div className="mt-4 mb-10 flex flex-col md:flex-row justify-end items-center border-t border-gray-800 pt-8 gap-6">
                <button 
                  onClick={() => setActiveTab('overview')}
                  className="bg-white text-black font-black uppercase tracking-widest px-10 py-4 pb-3 rounded-xl hover:bg-gray-300 transition-colors w-full md:w-auto text-center"
                >
                  CONFIRMAR PISTA
                </button>
             </div>
           </div>
        )}
      </main>
    </div>
  );
}
