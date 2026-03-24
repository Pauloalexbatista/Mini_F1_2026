import React, { useState, useEffect, useRef } from 'react';
import { PlayerConfig } from '../types';
import { TRACKS as DEFAULT_TRACKS, TrackDef, computeSpline, getTrackTelemetry } from '../tracks';
import { drawTrack, drawF1Car, drawMoto, drawDriftCar, drawRallyCar } from '../renderer';
import { TrackPreview } from './TrackPreview';
import { socket } from '../socket';

function MenuCarPreview({ type, p, s, h }: { type: 'F1'|'MOTO'|'DRIFT'|'RALLY', p: string, s?: string, h?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     ctx.clearRect(0,0, 160, 100);
     ctx.save();
     ctx.translate(80, 50);
     ctx.scale(3, 3);
     if (type === 'F1') drawF1Car(ctx, p, s || '#222', h || '#FFDD00', false);
     else if (type === 'MOTO') drawMoto(ctx, p, s || '#222', h || '#FFDD00');
     else if (type === 'DRIFT') drawDriftCar(ctx, p, s || '#222');
     else drawRallyCar(ctx, p, s || '#222');
     ctx.restore();
  }, [type, p, s, h]);
  return (
    <div className="relative flex flex-col items-center">
       <canvas ref={canvasRef} width={160} height={100} className="block" />
       
       <div className="flex items-center gap-2 mt-2">
           <span className={`text-[11px] font-black uppercase tracking-widest ${type === 'F1' ? 'text-[#E10600]' : 'text-gray-300'}`}>
               {type === 'F1' ? 'F1 2026' : type}
           </span>
           {type !== 'F1' && (
               <span className="text-[7px] font-black text-yellow-500 bg-black/95 px-1 py-0.5 border border-yellow-600 rounded tracking-widest uppercase">Brevemente</span>
           )}
       </div>
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

function TrackLeaderboard({ trackId }: { trackId: string }) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tracks/${trackId}/leaderboard`)
       .then(r => r.json())
       .then(data => {
          setLeaderboard(Array.isArray(data) ? data : []);
          setLoading(false);
       })
       .catch(() => setLoading(false));
  }, [trackId]);

  const formatTime = (ms: number) => {
    if (ms === Infinity) return '---';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const milli = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${milli.toString().padStart(2,'0')}`;
  };

  if (loading) return <div className="p-3 text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest bg-[#0a0a0f] min-h-[140px] flex items-center justify-center">A CARREGAR TEMPOS...</div>;
  if (!leaderboard || leaderboard.length === 0) return <div className="p-3 text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest bg-[#0a0a0f] min-h-[140px] flex items-center justify-center border-t border-gray-800">SEM TEMPOS REGISTADOS</div>;

  return (
    <div className="bg-[#0a0a0f] border-t border-gray-800 p-3 pt-4">
      <h4 className="text-[10px] text-[#E10600] font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
         TOP 10 MUNDIAL
      </h4>
      <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
         {leaderboard.map((entry, idx) => (
            <div key={idx} className="flex justify-between items-center bg-[#15151e] p-1.5 px-2 rounded border border-gray-800/50">
               <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black w-4 text-center ${idx === 0 ? 'text-yellow-400' : (idx === 1 ? 'text-gray-300' : (idx === 2 ? 'text-amber-700' : 'text-gray-600'))}`}>
                     {idx + 1}
                  </span>
                  <span className="text-xs text-white font-bold uppercase tracking-widest w-[110px] truncate">{entry.pilot_name || 'PILOTO'}</span>
               </div>
               <span className="text-xs font-mono text-yellow-400 font-bold">{formatTime(entry.best_time)}</span>
            </div>
         ))}
      </div>
    </div>
  );
}

interface MenuProps {
  players: PlayerConfig[];
  playerCount: number;
  setPlayerCount: (count: number) => void;
  selectedTracks: string[];
  setSelectedTracks: React.Dispatch<React.SetStateAction<string[]>>;
  totalLaps: number;
  setTotalLaps: (laps: number) => void;
  onStart: () => void;
  onOpenBuilder: () => void;
  onOpenProfile: () => void;
  onUpdatePlayer: (index: number, config: PlayerConfig) => void;
  onDeleteTrack?: (id: string) => void;
  user?: any;
  setUser?: (u: any) => void;
  tracks: TrackDef[];
  globalRoster?: any[];
  lobbyState?: any[];
  activeEventId?: string | null;
  onJoinEvent?: (eventId: string, trackEntries: {id: string, laps: number}[]) => void;
  onLeaveEvent?: () => void;
}

export default function Menu({ players, playerCount, setPlayerCount, selectedTracks, setSelectedTracks, totalLaps, setTotalLaps, onStart, onOpenBuilder, onOpenProfile, onUpdatePlayer, onDeleteTrack, user, setUser, tracks, globalRoster = [], lobbyState = [], activeEventId, onJoinEvent, onLeaveEvent }: MenuProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'tracks'>('overview');
  const [sortBy, setSortBy] = useState<'name' | 'lengthKm' | 'topSpeedKmh' | 'corners'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeKeyConfig, setActiveKeyConfig] = useState<{ playerIndex: number, action: keyof PlayerConfig['controls'] } | null>(null);
  // Event system state
  const [openEvents, setOpenEvents] = useState<any[]>([]);
  const [eventName, setEventName] = useState('');
  const [showEventCreator, setShowEventCreator] = useState(false);
  // Per-track laps for the event creator form: {trackId: laps}
  const [eventTrackLaps, setEventTrackLaps] = useState<Record<string, number>>({});

  const openCreator = () => {
    setSelectedTracks([]);       // start clean - no leftover tracks
    setEventTrackLaps({});       // reset per-track laps
    setEventName('');            // reset name
    setShowEventCreator(true);
  };

  // Fetch open events on mount and when lobby changes
  useEffect(() => {
    fetchEvents();
  }, [lobbyState]);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setOpenEvents(Array.isArray(data) ? data : []);
    } catch(e) { /* silent */ }
  };
  
  const ALL_TRACKS = [...tracks, ...DEFAULT_TRACKS.filter(sysT => !tracks.some(dbT => dbT.id === sysT.id))];
  const tracksAreReady = ALL_TRACKS.length > 0;

  // Helper guard
  const activeTrackObj = ALL_TRACKS.find(t => selectedTracks.length > 0 && t.id === selectedTracks[0]) || ALL_TRACKS[0] || null;

  const tracksWithTelemetry = React.useMemo(() => {
     return ALL_TRACKS.map(t => ({
        ...t,
        telemetry: getTrackTelemetry(t.nodes)
     }));
  }, [ALL_TRACKS]);

  const sortedTracks = React.useMemo(() => {
     return [...tracksWithTelemetry].sort((a, b) => {
        let valA: any, valB: any;
        if (sortBy === 'name') { valA = a.name; valB = b.name; }
        else if (sortBy === 'lengthKm') { valA = parseFloat(a.telemetry.lengthKm); valB = parseFloat(b.telemetry.lengthKm); }
        else { valA = a.telemetry[sortBy]; valB = b.telemetry[sortBy]; }
        
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
     });
  }, [tracksWithTelemetry, sortBy, sortDir]);

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
            <button onClick={() => setActiveTab('overview')} className={`flex items-center h-full hover:text-white transition-colors border-b-2 ${activeTab === 'overview' ? 'border-[#E10600] text-gray-100' : 'border-transparent text-gray-400'}`}>PADDOCK</button>
            <button onClick={() => setActiveTab('teams')} className={`flex items-center h-full hover:text-white transition-colors border-b-2 ${activeTab === 'teams' ? 'border-[#E10600] text-gray-100' : 'border-transparent text-gray-400'}`}>GARAGEM</button>
            <button onClick={() => setActiveTab('tracks')} className={`flex items-center h-full hover:text-white transition-colors border-b-2 ${activeTab === 'tracks' ? 'border-[#E10600] text-gray-100' : 'border-transparent text-gray-400'}`}>TRACKS</button>
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
                 disabled={
                   ALL_TRACKS.length === 0 ||
                   selectedTracks.length === 0 ||
                   // Online but no event = must create/join an event first
                   (globalRoster.length > 0 && !activeEventId) ||
                   // In a multiplayer lobby: wait for all humans to be ready
                   (!!activeEventId && lobbyState.length > 0 && !lobbyState.every((p: any) => p.isReady))
                 }
                 className="w-full sm:flex-1 bg-[#E10600] hover:bg-red-700 text-white disabled:bg-gray-800 disabled:text-gray-500 py-3 sm:py-5 px-6 rounded text-sm sm:text-base font-black italic tracking-widest uppercase transition-colors flex items-center justify-center gap-3 disabled:cursor-not-allowed group relative overflow-hidden"
              >
                 {globalRoster.length > 0 && !activeEventId ? (
                   'CRIAR OU JUNTAR EVENTO'
                 ) : selectedTracks.length === 0 ? (
                   'SELECIONE UMA PISTA...'
                 ) : activeEventId ? (
                   lobbyState.length > 0 && lobbyState.every((p: any) => p.isReady) ? (
                     <>LANÇAR CORRIDA <svg className="w-4 h-4 ml-2 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></>
                   ) : (
                     'A AGUARDAR PILOTOS...'
                   )
                 ) : (
                   <>IR PARA A <span className="hidden sm:inline ml-1">CORRIDA</span> <svg className="w-4 h-4 ml-2 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></>
                 )}
             </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-10 flex-1 w-full z-10 relative">
        
        {activeTab === 'overview' && (
           <div className="animate-in fade-in duration-500">
             {/* === IN EVENT LOBBY === */}
             {activeEventId ? (
               <div className="flex flex-col lg:flex-row gap-8 mb-12">
                 {/* LEFT: Event Details */}
                 <div className="flex-1 bg-[#15151e] border-2 border-[#E10600] rounded-xl p-6">
                   <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                     <div className="w-1.5 h-6 bg-[#E10600]"></div>
                     <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Sala do Evento</h3>
                   </div>
                   <div className="flex flex-col gap-3 mb-6">
                     {selectedTracks.map((tid, idx) => {
                       const t = tracks.find(x => x.id === tid);
                       return t ? (
                         <div key={tid} className="bg-[#1e1e24] border-l-4 border-[#E10600] p-3 rounded flex justify-between">
                           <span className="font-black text-white uppercase text-sm tracking-widest">{t.name}</span>
                           <span className="text-[10px] text-[#E10600] font-bold uppercase">RONDA {idx+1}</span>
                         </div>
                       ) : null;
                     })}
                   </div>
                   <div className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2">{totalLaps} Voltas por Ronda</div>
                   <button
                     onClick={onLeaveEvent}
                     className="mt-4 text-[10px] text-gray-400 border border-gray-700 px-4 py-2 rounded uppercase tracking-widest hover:text-red-500 hover:border-red-500 transition-colors"
                   >Abandonar Sala</button>
                 </div>
                 {/* RIGHT: Grid */}
                 <div className="flex-1 bg-[#15151e] border-2 border-gray-800 rounded-xl p-6">
                   <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                     <div className="w-1.5 h-6 bg-white"></div>
                     <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Grelha de Partida</h3>
                   </div>
                   <div className="flex flex-col gap-3">
                     {lobbyState.map((p, idx) => {
                       const isMe = p.socketId === socket.id;
                       return (
                         <div key={p.socketId} className={`bg-black/60 border ${p.isReady ? 'border-[#E10600]' : 'border-gray-700'} p-4 flex justify-between items-center rounded-lg relative overflow-hidden`}>
                           <div className="absolute left-0 top-0 w-1.5 h-full" style={{ backgroundColor: p.color }}></div>
                           <div className="pl-3 flex flex-col">
                             <span className="text-white font-black uppercase tracking-tighter text-lg">
                               {p.driverName}
                               {idx === 0 && <span className="text-[#E10600] ml-2 text-[10px] border border-[#E10600] rounded px-1.5 py-0.5">(HOST)</span>}
                               {isMe && <span className="text-gray-400 ml-2 text-[10px] border border-gray-600 rounded px-1.5 py-0.5">(TU)</span>}
                             </span>
                             <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{p.teamName}</span>
                           </div>
                           <div>
                             {isMe ? (
                               <button
                                 onClick={() => socket.emit('set_ready', !p.isReady)}
                                 className={`${p.isReady ? 'bg-green-600 text-white border border-green-500 shadow-[0_0_15px_rgba(22,163,74,0.4)]' : 'bg-transparent border border-gray-600 text-gray-500 hover:bg-gray-800 hover:text-white'} px-6 py-3 rounded text-xs font-black italic uppercase tracking-widest transition-all flex items-center gap-2`}
                               >
                                 {p.isReady ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> PRONTO</> : 'CLICAR PRONTO'}
                               </button>
                             ) : (
                               <span className={`${p.isReady ? 'text-green-500 border-green-500 bg-green-900/20' : 'text-gray-500 border-gray-700'} border px-4 py-2 rounded text-[10px] uppercase tracking-widest`}>
                                 {p.isReady ? 'PRONTO A CORRER' : 'A PREPARAR...'}
                               </span>
                             )}
                           </div>
                         </div>
                       );
                     })}
                     {lobbyState.length === 0 && (
                       <div className="text-center text-gray-600 font-bold uppercase tracking-widest text-[10px] p-8">A aguardar pilotos...</div>
                     )}
                   </div>
                 </div>
               </div>
             ) : (
               /* === EVENT BROWSER + CREATOR === */
               <div className="flex flex-col gap-8">
                 {showEventCreator ? (
                   /* CREATE EVENT FORM */
                   <div className="bg-[#15151e] border-2 border-[#E10600] rounded-xl p-6 max-w-xl mx-auto w-full">
                     <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                       <div className="w-1.5 h-6 bg-[#E10600]"></div>
                       <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Criar Evento</h3>
                     </div>
                     <div className="mb-4">
                       <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-2">Nome do Evento</label>
                       <input
                         type="text"
                         placeholder="ex: GP MINI BAHRAIN"
                         value={eventName}
                         onChange={e => setEventName(e.target.value.toUpperCase())}
                         className="w-full bg-black text-white font-black tracking-widest uppercase p-3 rounded border border-gray-700 focus:border-[#E10600] outline-none transition-colors placeholder:text-gray-700"
                         maxLength={30}
                       />
                     </div>
                     <div className="mb-4 flex flex-col gap-2">
                       <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Pistas ({selectedTracks.length} selecionadas)</label>
                       {selectedTracks.length === 0 && (
                         <div className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">⚠ Seleciona pelo menos 1 pista no separador TRACKS</div>
                       )}
                       {selectedTracks.map((tid, idx) => {
                         const t = tracks.find(x => x.id === tid);
                         return t ? (
                           <div key={tid} className="bg-[#1e1e24] border-l-4 border-[#E10600] p-2 rounded text-sm font-bold text-white uppercase tracking-widest">{t.name}</div>
                         ) : null;
                       })}
                       <button onClick={() => setActiveTab('tracks')} className="text-[10px] text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded uppercase tracking-widest transition-colors self-start">+ Escolher Pistas</button>
                     </div>
                     <div className="mb-6 flex items-center gap-4">
                       <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Voltas</label>
                       <input type="number" min="1" max="99" value={totalLaps} onChange={e => setTotalLaps(parseInt(e.target.value)||1)} className="bg-black text-[#E10600] font-black text-xl text-center w-16 p-2 rounded border border-gray-700 outline-none" />
                     </div>
                     <div className="flex gap-3">
                       <button
                         onClick={async () => {
                           if (!selectedTracks.length || !eventName.trim()) return;
                           const token = localStorage.getItem('token');
                           const eid = `evt_${Date.now()}`;
                           const trackEntries = selectedTracks.map(id => ({ id, laps: eventTrackLaps[id] ?? 3 }));
                           await fetch('/api/events', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                             body: JSON.stringify({ id: eid, name: eventName.trim(), tracks_json: JSON.stringify(trackEntries), laps: 3 })
                           });
                           socket.emit('refresh_events');
                           setShowEventCreator(false);
                           setEventName('');
                           fetchEvents();
                           if (onJoinEvent) onJoinEvent(eid, selectedTracks, totalLaps);
                         }}
                         disabled={!selectedTracks.length || !eventName.trim()}
                         className="flex-1 bg-[#E10600] text-white font-black uppercase tracking-widest px-6 py-3 rounded hover:bg-white hover:text-[#E10600] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                       >Criar e Entrar</button>
                       <button onClick={() => setShowEventCreator(false)} className="border border-gray-700 text-gray-400 hover:text-white px-6 py-3 rounded font-bold uppercase tracking-widest transition-colors">Cancelar</button>
                     </div>
                   </div>
                 ) : (
                   <div className="flex flex-col lg:flex-row gap-8">
                     {/* LEFT: Open Events */}
                     <div className="flex-1 bg-[#15151e] border-2 border-gray-800 rounded-xl p-6">
                       <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                         <div className="flex items-center gap-3">
                           <div className="w-1.5 h-6 bg-[#E10600]"></div>
                           <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Eventos Abertos</h3>
                         </div>
                         <button onClick={fetchEvents} className="text-[10px] text-gray-500 hover:text-white font-bold uppercase tracking-widest border border-gray-700 px-3 py-1.5 rounded transition-colors">↻ Atualizar</button>
                       </div>
                       {openEvents.length === 0 ? (
                         <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
                           <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
                           <p className="text-gray-500 font-bold uppercase tracking-widest text-xs text-center">Nenhum evento aberto.<br/>Sê o primeiro a criar um!</p>
                         </div>
                       ) : (
                         <div className="flex flex-col gap-3">
                           {openEvents.map(ev => {
                             const evTracks: string[] = JSON.parse(ev.tracks_json || '[]');
                             const joinedIds = lobbyState.map((p:any) => p.userId);
                             return (
                               <div key={ev.id} className="bg-black/60 border border-gray-700 hover:border-[#E10600] rounded-lg p-4 flex justify-between items-center transition-colors group">
                                 <div>
                                   <div className="text-white font-black uppercase tracking-widest text-base">{ev.name}</div>
                                   <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{ev.host_name} · {evTracks.length} pista{evTracks.length!==1?'s':''} · {ev.laps} volta{ev.laps!==1?'s':''}</div>
                                 </div>
                                 <button
                                   onClick={() => onJoinEvent && onJoinEvent(ev.id, evTracks, ev.laps)}
                                   className="bg-[#E10600] text-white font-black uppercase tracking-widest text-[10px] px-4 py-2 rounded hover:bg-white hover:text-[#E10600] transition-colors"
                                 >JUNTAR</button>
                               </div>
                             );
                           })}
                         </div>
                       )}
                       <button
                         onClick={() => setShowEventCreator(true)}
                         className="mt-6 w-full border-2 border-dashed border-gray-700 hover:border-[#E10600] text-gray-500 hover:text-white font-black uppercase tracking-widest py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                       >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                         Criar Novo Evento
                       </button>
                     </div>
                     {/* RIGHT: Global Pilot Roster */}
                     <div className="w-full lg:w-80 bg-[#15151e] border-2 border-gray-800 rounded-xl p-6">
                       <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                         <div className="w-1.5 h-6 bg-white"></div>
                         <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Pilotos Online</h3>
                         <span className="text-[10px] text-green-500 font-bold border border-green-800 bg-green-900/20 rounded px-2 py-0.5 ml-auto">{globalRoster.filter(p => p.status !== 'racing').length} Disponível{globalRoster.filter(p => p.status !== 'racing').length!==1?'is':''}</span>
                       </div>
                       {globalRoster.length === 0 ? (
                         <div className="text-center text-gray-600 font-bold uppercase tracking-widest text-[10px] py-8">Nenhum piloto online</div>
                       ) : (
                         <div className="flex flex-col gap-2">
                           {globalRoster.map(p => (
                             <div key={p.socketId} className="flex items-center gap-3 py-2 border-b border-gray-800/50">
                               <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }}></div>
                               <div className="flex-1 min-w-0">
                                 <div className="text-white font-black text-xs uppercase tracking-wide truncate">{p.driverName}</div>
                               </div>
                               <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
                                 p.status === 'racing' ? 'text-red-400 border-red-800 bg-red-900/20' :
                                 p.status === 'in_lobby' ? 'text-yellow-400 border-yellow-800 bg-yellow-900/20' :
                                 'text-green-400 border-green-800 bg-green-900/20'
                               }`}>
                                 {p.status === 'racing' ? 'Em Pista' : p.status === 'in_lobby' ? 'Na Box' : 'Disponível'}
                               </span>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>
                   </div>
                 )}
               </div>
             )}
           </div>
        )}

        {/* TEAMS CAROUSEL UI -> CHANGED TO GARAGE UI */}
        {activeTab === 'teams' && (
           <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center min-h-[60vh]">
             <div className="mb-6 border-b border-gray-800 pb-4 text-center w-full max-w-4xl">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">A TUA GARAGEM</h2>
                <p className="text-gray-500 font-bold uppercase tracking-widest mt-2">Configura a tua máquina para a próxima corrida. Mais veículos chegarão no futuro.</p>
             </div>

             <div className="w-full max-w-4xl bg-[#1a1a24] border-2 border-gray-800 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                
                <div className="w-full md:w-1/2 flex flex-col gap-6">
                   <h3 className="text-white font-black text-2xl uppercase tracking-widest mb-2 border-b-2 border-[#E10600] pb-2 inline-block self-start">Classe: F1 2026</h3>
                   
                   <div>
                      <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2 font-bold shadow-sm">Cor Primária (Carroçaria)</label>
                      <input type="color" title="Cor Primária" value={players[0]?.color || '#E10600'} onChange={e => {
                         const np = {...players[0]}; np.color = e.target.value; onUpdatePlayer(0, np);
                      }} className="w-full h-16 cursor-pointer bg-transparent border-0 rounded" />
                   </div>

                   <div>
                      <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2 font-bold shadow-sm">Cor Secundária (Asas/Detalhes)</label>
                      <input type="color" title="Cor Secundária" value={players[0]?.color2 || '#000000'} onChange={e => {
                         const np = {...players[0]}; np.color2 = e.target.value; onUpdatePlayer(0, np);
                      }} className="w-full h-16 cursor-pointer bg-transparent border-0 rounded" />
                   </div>

                   <div>
                      <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-2 font-bold shadow-sm">Cor do Capacete</label>
                      <input type="color" title="Cor do Capacete" value={players[0]?.helmetColor || '#FFDD00'} onChange={e => {
                         const np = {...players[0]}; np.helmetColor = e.target.value; onUpdatePlayer(0, np);
                      }} className="w-full h-16 cursor-pointer bg-transparent border-0 rounded" />
                   </div>
                </div>

                <div className="w-full md:w-1/2 flex justify-center mt-6 md:mt-0">
                   <div className="bg-black/80 rounded-2xl p-6 border border-gray-700 shadow-[inset_0_10px_30px_rgba(0,0,0,0.8)] w-full flex flex-col items-center">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-4 w-full mb-6">
                         <MenuCarPreview type="F1" p={players[0]?.color || '#E10600'} s={players[0]?.color2} h={players[0]?.helmetColor} />
                         <MenuCarPreview type="MOTO" p={players[0]?.color || '#E10600'} s={players[0]?.color2} h={players[0]?.helmetColor} />
                         <MenuCarPreview type="DRIFT" p={players[0]?.color || '#E10600'} s={players[0]?.color2} h={players[0]?.helmetColor} />
                         <MenuCarPreview type="RALLY" p={players[0]?.color || '#E10600'} s={players[0]?.color2} h={players[0]?.helmetColor} />
                      </div>
                      <div className="text-center text-gray-500 font-black italic tracking-widest uppercase text-[10px] mt-auto">MÁQUINAS EM DESENVOLVIMENTO: FÍSICAS EXCLUSIVAS</div>
                   </div>
                </div>

             </div>

             <div className="mt-10 mb-10 text-center w-full max-w-4xl flex flex-col items-center">
                 <button 
                   onClick={async () => {
                      if (user) {
                         try {
                           await fetch('/api/me', {
                             method: 'PUT',
                             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                             body: JSON.stringify({ 
                                pilot_name: user.pilot_name || user.username, 
                                primary_color: players[0]?.color, 
                                secondary_color: players[0]?.color2, 
                                helmet_color: players[0]?.helmetColor 
                             })
                           });
                           if (setUser) {
                               setUser({
                                  ...user,
                                  primary_color: players[0]?.color,
                                  secondary_color: players[0]?.color2,
                                  helmet_color: players[0]?.helmetColor
                               });
                           }
                           // Also update the global roster with new colors
                           socket.emit('join_global', {
                               userId: user.id,
                               driverName: user.pilot_name || user.username,
                               teamName: 'Garagem Pessoal',
                               color: players[0]?.color,
                               color2: players[0]?.color2,
                               helmetColor: players[0]?.helmetColor,
                           });
                         } catch(e) { console.error("Failed saving Garage colors", e); }
                      }
                   }}
                   className="w-full max-w-[300px] bg-[#E10600] text-white font-black uppercase tracking-widest px-12 py-5 rounded-xl hover:bg-white hover:text-[#E10600] transition-colors shadow-[0_0_20px_rgba(225,6,0,0.4)]"
                 >
                   GUARDAR CONFIGURAÇÃO
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
             
             {/* TRACKS FILTER BAR (Fallbacks if missing)*/}
             {ALL_TRACKS.length > 0 && (
                <div className="flex flex-wrap items-center gap-4 mb-6 bg-[#1a1a24] p-3 rounded-lg border border-gray-800">
                   <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-2">ORDENAR POR:</span>
                   
                   <select 
                     value={sortBy} 
                     onChange={(e) => setSortBy(e.target.value as any)}
                     className="bg-black text-white text-xs font-bold uppercase tracking-widest border border-gray-700 rounded px-3 py-2 outline-none cursor-pointer"
                   >
                      <option value="name">Nome do Circuito</option>
                      <option value="lengthKm">Extensão (KM)</option>
                      <option value="topSpeedKmh">Top Speed (KM/H)</option>
                      <option value="corners">Quantidade Curvas</option>
                   </select>

                   <button 
                     onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                     className="bg-black text-gray-400 hover:text-white border border-gray-700 rounded p-2 transition-colors flex items-center justify-center"
                     title="Inverter Ordem"
                   >
                     {sortDir === 'asc' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                     ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>
                     )}
                   </button>
                   
                   <div className="ml-auto text-[10px] text-[#E10600] font-bold uppercase tracking-widest bg-black px-3 py-2 rounded border border-[#E10600]/30 hidden sm:block">
                      {selectedTracks.length} PISTA{selectedTracks.length !== 1 && 'S'} NA PLAYLIST
                   </div>
                </div>
             )}

             {ALL_TRACKS.length > 0 ? (
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-8 w-full">
                 {sortedTracks.map((t, i) => {
                    const isSelected = selectedTracks.includes(t.id);
                    const playlistIndex = selectedTracks.indexOf(t.id);
                    const isSystemTrack = DEFAULT_TRACKS.some(sysT => sysT.id === t.id);
                    return (
                      <div 
                        key={t.id}
                        onClick={() => {
                           if (isSelected) {
                              setSelectedTracks(prev => prev.filter(id => id !== t.id));
                           } else {
                              setSelectedTracks(prev => [...prev, t.id]);
                           }
                        }}
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
                             {isSelected ? (
                                <span className="text-[11px] font-black text-white uppercase tracking-widest block bg-[#E10600] rounded px-2 py-0.5">RONDA {playlistIndex + 1} DA PLAYLIST</span>
                             ) : (
                                <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest block bg-gray-900 rounded px-2 py-0.5 border border-gray-700">SEM SELEÇÃO</span>
                             )}
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
                         <TrackLeaderboard trackId={t.id.toString()} />

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
