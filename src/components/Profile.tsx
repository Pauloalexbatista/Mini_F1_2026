import React, { useState, useEffect } from 'react';
import { drawF1Car, drawMoto, drawDriftCar, drawRallyCar } from '../renderer';

function ProfileCarPreview({ type, p, s, h, isSelected, onSelect }: { type: 'F1'|'MOTO'|'DRIFT'|'RALLY', p: string, s: string, h: string, isSelected?: boolean, onSelect?: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     ctx.clearRect(0,0, 140, 80);
     ctx.save();
     ctx.translate(70, 40);
     ctx.scale(2.2, 2.2);
     if (type === 'F1') drawF1Car(ctx, p, s, h, false);
     else if (type === 'MOTO') drawMoto(ctx, p, s, h);
     else if (type === 'DRIFT') drawDriftCar(ctx, p, s);
     else drawRallyCar(ctx, p, s);
     ctx.restore();
  }, [type, p, s, h]);
  const isAvailable = type === 'F1' || type === 'DRIFT';

  return (
    <div 
       onClick={() => isAvailable && onSelect && onSelect()}
       className={"relative flex flex-col items-center p-2 rounded-xl border transition-all select-none " + (
         isSelected 
           ? "border-yellow-400 bg-yellow-400/10 shadow-[0_0_15px_rgba(250,204,21,0.3)] cursor-pointer" 
           : isAvailable 
             ? "border-gray-800 bg-black/40 hover:border-gray-600 cursor-pointer" 
             : "border-gray-800/40 bg-black/20 opacity-35 cursor-not-allowed"
       )}
    >
       <canvas ref={canvasRef} width={140} height={80} className="w-[100px] sm:w-[130px] h-[60px] sm:h-[75px] block pointer-events-none" />
       
       <div className="flex items-center gap-1.5 mt-1.5">
           <span className={"text-[10px] font-bold uppercase tracking-wider " + (isSelected ? "text-yellow-400 font-black" : "text-gray-300")}>
               {type === 'F1' ? 'F1 2026' : type === 'DRIFT' ? 'DRIFT' : type}
           </span>
           {isSelected ? (
               <span className="text-[7px] font-black text-black bg-yellow-400 px-1 py-0.5 rounded tracking-widest uppercase">EM USO</span>
           ) : isAvailable ? (
               <span className="text-[7px] font-black text-cyan-400 bg-cyan-950/80 px-1 py-0.5 border border-cyan-500/40 rounded tracking-widest uppercase">ATIVO</span>
           ) : (
               <span className="text-[7px] font-black text-gray-500 bg-black/95 px-1 py-0.5 border border-gray-700 rounded tracking-widest uppercase">Brevemente</span>
           )}
       </div>
    </div>
  );
}

interface ProfileProps {
  user: any;
  setUser: (u: any) => void;
  players: any[];
  onUpdatePlayer: (index: number, config: any) => void;
  onBack: () => void;
}

export function Profile({ user, setUser, players, onUpdatePlayer, onBack }: ProfileProps) {
  const [pilotName, setPilotName] = useState(user.pilot_name || '');
  const [primaryColor, setPrimaryColor] = useState(user.primary_color || '#E10600');
  const [secondaryColor, setSecondaryColor] = useState(user.secondary_color || '#000000');
  const [helmetColor, setHelmetColor] = useState(user.helmet_color || '#FFDD00');
  const [records, setRecords] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [activeKeyConfig, setActiveKeyConfig] = useState<{ action: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeKeyConfig) {
        e.preventDefault();
        const action = activeKeyConfig.action;
        const newPlayer = { ...players[0] };
        if (!newPlayer.controls) newPlayer.controls = { up: 'KeyQ', down: 'KeyA', left: 'KeyO', right: 'KeyP', camera: 'KeyC' };
        newPlayer.controls[action] = e.code;
        onUpdatePlayer(0, newPlayer);
        setActiveKeyConfig(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeKeyConfig, players, onUpdatePlayer]);

  const renderKeyButton = (action: string, label: string) => {
    const isActive = activeKeyConfig?.action === action;
    const rawKey = players[0]?.controls?.[action as keyof typeof players[0]['controls']];
    const defaultKey = action === 'camera' ? 'KeyC' : 'N/A';
    const keyName = (rawKey || defaultKey).replace('Key', '').replace('Arrow', '');
    
    return (
      <div className="flex justify-between items-center bg-gray-100 px-3 py-2 rounded">
        <span className="text-xs text-gray-500 font-bold uppercase">{label}</span>
        <button 
          className={`px-3 py-1 text-[11px] font-bold uppercase rounded transition-colors ${isActive ? 'bg-[#E10600] text-white animate-pulse' : 'bg-gray-300 text-gray-800 hover:bg-gray-400'}`}
          onClick={() => setActiveKeyConfig({ action })}
        >
          {isActive ? '...' : keyName}
        </button>
      </div>
    );
  };

  
  useEffect(() => {
    // Fetch personal records
    const fetchRecords = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/me/records', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setRecords(await res.json());
        }
      } catch (e) {
        console.error("Failed to fetch records", e);
      }
    };
    fetchRecords();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/me', {
        method: 'PUT',
        headers: { 
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
           pilot_name: pilotName,
           primary_color: primaryColor,
           secondary_color: secondaryColor,
           helmet_color: helmetColor,
           controls: players[0]?.controls
        })
      });
      if (res.ok) {
        setUser({ 
           ...user, 
           pilot_name: pilotName,
           primary_color: primaryColor,
           secondary_color: secondaryColor,
           helmet_color: helmetColor,
           controls: players[0]?.controls
        });
        
        onUpdatePlayer(0, {
            ...players[0],
            color: primaryColor,
            color2: secondaryColor,
            helmetColor: helmetColor,
            driverName: pilotName
        });
        
        onBack();
      }
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };



  const formatTime = (ms: number) => {
    if (ms === Infinity) return '---';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const milli = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${milli.toString().padStart(2,'0')}`;
  };

  return (
    <div className="w-full min-h-screen bg-[#15151e] text-white p-3.5 sm:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-8 border-b-2 border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black italic tracking-tighter text-[#E10600]">GARAGEM DO PILOTO</h1>
            <p className="text-gray-400 font-bold tracking-widest uppercase text-sm mt-1">
              LICENÇA Nº {user.id.toString().padStart(6, '0')} — {user.role === 'admin' ? 'FIA ADMIN' : 'PILOTO'}
            </p>
          </div>
          <button 
            onClick={onBack}
            className="text-gray-400 hover:text-white uppercase font-bold text-sm tracking-widest underline decoration-transparent hover:decoration-[#E10600] underline-offset-4 transition-all"
          >
            VOLTAR AO PADDOCK
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          
          {/* IDENTIDADE E CARRO */}
          <div className="bg-black/40 border border-gray-800 p-3.5 sm:p-6 rounded-xl">
             <h2 className="text-sm text-gray-400 uppercase tracking-widest font-bold mb-6">Identidade & Máquina</h2>
             
             <div className="mb-6">
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Nome de Exibição</label>
               <input 
                 type="text" 
                 value={pilotName}
                 onChange={(e) => setPilotName(e.target.value)}
                 className="w-full bg-[#1e1e24] text-white p-3 border-b-2 border-transparent focus:border-[#E10600] outline-none font-bold text-xl transition-all"
               />
             </div>

             <div className="mb-6">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">A Minha Máquina F1</label>
                
                <div className="flex gap-4 mb-6">
                   <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">Primária</label>
                      <input type="color" title="Cor Primária" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-full h-12 border-0 bg-transparent cursor-pointer p-0" />
                   </div>
                   <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">Secundária</label>
                      <input type="color" title="Cor Secundária" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-full h-12 border-0 bg-transparent cursor-pointer p-0" />
                   </div>
                   <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">Capacete</label>
                      <input type="color" title="Cor do Capacete" value={helmetColor} onChange={e => setHelmetColor(e.target.value)} className="w-full h-12 border-0 bg-transparent cursor-pointer p-0" />
                   </div>
                </div>

                <div className="bg-black/40 rounded-xl py-4 w-full shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] flex justify-center border border-gray-800">
                   <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-full px-2">
                       <ProfileCarPreview type="F1" p={primaryColor} s={secondaryColor} h={helmetColor} isSelected={(players[0]?.vehicleType || 'F1') === 'F1'} onSelect={() => onUpdatePlayer(0, { ...players[0], vehicleType: 'F1' })} />
                       <ProfileCarPreview type="DRIFT" p={primaryColor} s={secondaryColor} h={helmetColor} isSelected={players[0]?.vehicleType === 'DRIFT'} onSelect={() => onUpdatePlayer(0, { ...players[0], vehicleType: 'DRIFT' })} />
                       <ProfileCarPreview type="MOTO" p={primaryColor} s={secondaryColor} h={helmetColor} />
                       <ProfileCarPreview type="RALLY" p={primaryColor} s={secondaryColor} h={helmetColor} />
                   </div>
                </div>
             </div>

             <div className="mb-6 pt-6 border-t border-gray-800">
                <h2 className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-4">Mapeamento de Botões</h2>
                <div className="grid grid-cols-2 gap-3">
                  {renderKeyButton('up', 'Acelerar')}
                  {renderKeyButton('down', 'Travar')}
                  {renderKeyButton('left', 'Esquerda')}
                  {renderKeyButton('right', 'Direita')}
                  {renderKeyButton('camera', 'Modo Câmara')}
                </div>
             </div>

             <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-3 sm:py-3.5 mt-2 bg-[#E10600] rounded-xl text-xs sm:text-sm text-white font-black italic hover:bg-white hover:text-[#E10600] transition-colors disabled:opacity-50"
             >
                {isSaving ? 'A GUARDAR...' : 'CONFIRMAR AFINAÇÕES'}
             </button>
          </div>

          {/* RECORDES PESSOAIS */}
          <div className="bg-black/40 border border-gray-800 p-6 rounded-xl">
             <h2 className="text-sm text-gray-400 uppercase tracking-widest font-bold mb-6">Telemetria & Palmarés</h2>
             
             {records.length === 0 ? (
               <div className="text-gray-500 italic text-center py-10">Ainda não há dados de telemetria gravados. Vai para a pista!</div>
             ) : (
               <div className="space-y-3">
                 {records.map(rec => (
                   <div key={rec.track_id} className="bg-[#1e1e24] p-4 flex justify-between items-center border-l-2 border-gray-600">
                      <div>
                        <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest">{rec.track_id}</span>
                        <span className="block text-sm text-white font-bold">{rec.track_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-[#E10600] font-bold uppercase tracking-widest">Melhor Volta</span>
                        <span className="block text-lg font-mono text-yellow-400">{formatTime(rec.personal_best)}</span>
                      </div>
                   </div>
                 ))}
               </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
}
