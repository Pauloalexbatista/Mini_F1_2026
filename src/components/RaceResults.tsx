import React from 'react';

export interface RaceResultEntry {
  playerId: number;
  position: number;
  driverName: string;
  teamName: string;
  color: string;
  color2: string;
  totalTimeMs: number | null; // null if DNF
  bestLapMs: number | null;
  pointsEarned: number;
  totalChampionshipPoints: number;
}

interface RaceResultsProps {
  results: RaceResultEntry[];
  isHost: boolean;
  hasNextTrack: boolean;
  onNextTrack: () => void;
  onFinishEvent: () => void;
}

const formatTime = (ms: number | null) => {
  if (ms === null || ms === Infinity) return 'DNF';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const milli = Math.floor((ms % 1000) / 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${milli.toString().padStart(2, '0')}`;
};

export function RaceResults({ results, isHost, hasNextTrack, onNextTrack, onFinishEvent }: RaceResultsProps) {
  // Sort results by position
  const sorted = [...results].sort((a, b) => a.position - b.position);
  
  const validLaps = results.map(r => r.bestLapMs).filter(l => l !== null && l > 0) as number[];
  const absoluteBestLap = validLaps.length > 0 ? Math.min(...validLaps) : null;

  const podium = sorted.slice(0, 3);
  const others = sorted.slice(3);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/70 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-[#111] border-2 border-gray-800 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] w-full max-w-5xl flex flex-col overflow-hidden max-h-full">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#E10600] to-red-900 p-6 shadow-md relative z-10">
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase text-center shadow-black drop-shadow-xl">
             CLASSIFICAÇÃO FINAL
          </h2>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 pb-2 min-h-0 flex flex-col gap-8">
           
           {/* PODIUM */}
           <div className="flex justify-center items-end gap-4 h-48 mt-4 mb-4">
              {/* 2nd Place */}
              {podium[1] && (
                 <div className="flex flex-col items-center w-40 animate-slide-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
                    <div className="text-center w-full mb-2 bg-[#15151e] p-2 rounded-t-lg border-b-4" style={{ borderBottomColor: podium[1].color }}>
                       <span className="block text-white font-black text-lg truncate uppercase">{podium[1].driverName}</span>
                       <span className="block text-gray-400 text-[10px] font-bold tracking-widest">{podium[1].teamName}</span>
                       <span className="block text-yellow-500 font-mono text-xs mt-1">{formatTime(podium[1].totalTimeMs)}</span>
                    </div>
                    <div className="w-full h-24 bg-gradient-to-b from-gray-300 to-gray-500 shadow-2xl flex items-center justify-center rounded-t-sm">
                       <span className="text-4xl font-black text-white drop-shadow-md">2</span>
                    </div>
                 </div>
              )}

              {/* 1st Place */}
              {podium[0] && (
                 <div className="flex flex-col items-center w-44 animate-slide-up z-10" style={{ animationDelay: '0.8s', animationFillMode: 'both' }}>
                    <div className="text-center w-full mb-3 bg-[#15151e] p-3 rounded-t-xl border-b-4 shadow-[0_0_30px_rgba(255,215,0,0.2)]" style={{ borderBottomColor: podium[0].color }}>
                       <span className="block text-white font-black text-xl truncate uppercase">{podium[0].driverName}</span>
                       <span className="block text-gray-400 text-xs font-bold tracking-widest">{podium[0].teamName}</span>
                       <span className="block text-yellow-400 font-mono text-sm mt-1">{formatTime(podium[0].totalTimeMs)}</span>
                    </div>
                    <div className="w-full h-32 bg-gradient-to-b from-yellow-400 to-yellow-600 shadow-[0_0_40px_rgba(255,215,0,0.5)] flex items-center justify-center rounded-t-sm">
                       <span className="text-6xl font-black text-white drop-shadow-md">1</span>
                    </div>
                 </div>
              )}

              {/* 3rd Place */}
              {podium[2] && (
                 <div className="flex flex-col items-center w-36 animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
                    <div className="text-center w-full mb-1 bg-[#15151e] p-2 rounded-t-lg border-b-4" style={{ borderBottomColor: podium[2].color }}>
                       <span className="block text-white font-black text-base truncate uppercase">{podium[2].driverName}</span>
                       <span className="block text-[9px] text-gray-400 font-bold tracking-widest">{podium[2].teamName}</span>
                       <span className="block text-yellow-600 font-mono text-[10px] mt-1">{formatTime(podium[2].totalTimeMs)}</span>
                    </div>
                    <div className="w-full h-16 bg-gradient-to-b from-[#cd7f32] to-[#8b5a2b] shadow-xl flex items-center justify-center rounded-t-sm">
                       <span className="text-3xl font-black text-white drop-shadow-md">3</span>
                    </div>
                 </div>
              )}
           </div>

           {/* LEADERBOARD GRID */}
           <div className="flex-1 w-full bg-[#1a1a24] rounded-xl border border-gray-800 p-1 flex flex-col gap-1 overflow-y-auto">
              <div className="flex items-center px-4 py-2 text-[10px] text-gray-500 font-black uppercase tracking-widest bg-[#15151e] rounded flex-shrink-0">
                 <div className="w-12 text-center">POS</div>
                 <div className="w-48 flex-1">PILOTO / EQUIPA</div>
                 <div className="w-32 text-right">TEMPO TOTAL</div>
                 <div className="w-28 text-right">MELHOR VOLTA</div>
                 <div className="w-24 text-right">PONTOS</div>
                 <div className="w-24 text-right text-yellow-500">CAMP.</div>
              </div>
              
              {sorted.map((r, i) => (
                 <div key={r.playerId} 
                      className="flex items-center px-4 py-3 bg-[#0d0d12] hover:bg-gray-800 rounded transition-colors group animate-slide-up"
                      style={{ animationDelay: `${1.2 + (i * 0.1)}s`, animationFillMode: 'both' }}
                 >
                    <div className="w-12 flex justify-center">
                       <span className="bg-gray-800 w-8 h-8 flex items-center justify-center rounded font-black text-gray-400 text-sm">
                          {r.position}
                       </span>
                    </div>
                    <div className="w-48 flex-1 flex flex-col px-4 border-l-4 ml-2" style={{ borderLeftColor: r.color }}>
                       <span className="text-white font-black uppercase tracking-widest">{r.driverName}</span>
                       <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{r.teamName}</span>
                    </div>
                    <div className="w-32 text-right pr-4 border-r border-gray-800">
                       <span className={`font-mono text-sm ${r.totalTimeMs === null ? 'text-red-500 font-black' : 'text-gray-300'}`}>
                          {r.totalTimeMs === null ? 'DNF' : formatTime(r.totalTimeMs)}
                       </span>
                    </div>
                    <div className="w-28 text-right pr-4 border-r border-gray-800 flex items-center justify-end">
                       <span className="font-mono text-xs text-purple-400">
                          {r.bestLapMs === absoluteBestLap && r.bestLapMs !== null && <span className="text-yellow-400 mr-1 text-sm">⭐</span>}
                          {formatTime(r.bestLapMs)}
                       </span>
                    </div>
                    <div className="w-24 text-right pr-4 border-r border-gray-800 flex items-center justify-end gap-1">
                       <span className="text-white font-black text-lg">+{r.pointsEarned}</span>
                    </div>
                    <div className="w-24 text-right pr-2 flex items-center justify-end">
                       <span className="text-yellow-500 font-black text-xl">{r.totalChampionshipPoints}</span>
                    </div>
                 </div>
              ))}
           </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-6 bg-[#0a0a0f] border-t border-gray-800 flex justify-center mt-auto shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-20">
           {isHost ? (
              hasNextTrack ? (
                 <button 
                    onClick={onNextTrack}
                    className="bg-green-600 hover:bg-green-500 text-white font-black text-xl italic tracking-tighter uppercase px-12 py-4 rounded transition-all shadow-[0_0_20px_rgba(22,163,74,0.4)] flex items-center gap-3 group"
                 >
                    PRÓXIMA PISTA
                    <svg className="w-6 h-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                 </button>
              ) : (
                 <button 
                    onClick={onFinishEvent}
                    className="bg-[#E10600] hover:bg-red-500 text-white font-black text-xl italic tracking-tighter uppercase px-12 py-4 rounded transition-all shadow-[0_0_20px_rgba(225,6,0,0.4)] flex items-center gap-3"
                 >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    CONCLUIR CAMPEONATO
                 </button>
              )
           ) : (
              <div className="text-center">
                 <span className="block text-gray-500 font-black uppercase tracking-widest text-lg animate-pulse mb-1">A AGUARDAR PELO CRIADOR DA SALA...</span>
                 <span className="block text-gray-600 text-xs uppercase tracking-widest font-bold">Não saias da box, o host tem que preparar a próxima pista</span>
              </div>
           )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(12px); }
        }
        .animate-slide-up { animation: slide-up 0.5s ease-out; }
        .animate-fade-in { animation: fade-in 1s ease-out forwards; }
      `}} />
    </div>
  );
}
