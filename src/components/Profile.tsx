import React, { useState, useEffect } from 'react';
import { TEAM_LIVERIES } from '../App';
import { drawF1Car } from '../renderer';

function ProfileCarPreview({ p, s }: { p: string, s: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (!ctx) return;
     ctx.clearRect(0,0, 300, 100);
     ctx.save();
     ctx.translate(150, 50);
     ctx.scale(4, 4);
     drawF1Car(ctx, p, s, false);
     ctx.restore();
  }, [p, s]);
  return <canvas ref={canvasRef} width={300} height={100} className="block mx-auto mb-4" />;
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
  const [selectedCarId, setSelectedCarId] = useState(user.selected_car_id || 1);
  const [records, setRecords] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [activeKeyConfig, setActiveKeyConfig] = useState<{ action: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeKeyConfig) {
        e.preventDefault();
        const action = activeKeyConfig.action;
        const newPlayer = { ...players[0] };
        if (!newPlayer.controls) newPlayer.controls = { up: '', down: '', left: '', right: '' };
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
    const keyName = players[0]?.controls?.[action]?.replace('Key', '')?.replace('Arrow', '') || 'N/A';
    
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
        body: JSON.stringify({ pilot_name: pilotName, selected_car_id: selectedCarId })
      });
      if (res.ok) {
        setUser({ ...user, pilot_name: pilotName, selected_car_id: selectedCarId });
        onBack();
      }
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };

  const selectedTeam = TEAM_LIVERIES[selectedCarId - 1] || TEAM_LIVERIES[0];

  return (
    <div className="w-full min-h-screen bg-[#15151e] text-white p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-8 border-b-2 border-gray-800 pb-4">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter text-[#E10600]">GARAGEM DO PILOTO</h1>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          
          {/* IDENTIDADE E CARRO */}
          <div className="bg-black/40 border border-gray-800 p-6 rounded-xl">
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
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Carro / Equipa Oficial</label>
                
                <select
                   value={selectedCarId}
                   onChange={(e) => setSelectedCarId(parseInt(e.target.value))}
                   className="w-full bg-[#1e1e24] text-white p-3 border-b-2 border-transparent focus:border-[#E10600] outline-none font-black text-lg uppercase tracking-tighter transition-all mb-6 cursor-pointer"
                >
                   {TEAM_LIVERIES.map((team, idx) => (
                      <option key={idx} value={idx + 1} className="bg-[#15151e] tracking-widest text-sm">
                         {team.name}
                      </option>
                   ))}
                </select>

                <div className="bg-black/40 rounded-xl py-6 w-full shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] flex justify-center border border-gray-800">
                   <ProfileCarPreview p={selectedTeam.p} s={selectedTeam.s} />
                </div>
             </div>

             <div className="mb-6 pt-6 border-t border-gray-800">
                <h2 className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-4">Mapeamento de Botões</h2>
                <div className="grid grid-cols-2 gap-3">
                  {renderKeyButton('up', 'Acelerar')}
                  {renderKeyButton('down', 'Travar')}
                  {renderKeyButton('left', 'Esquerda')}
                  {renderKeyButton('right', 'Direita')}
                </div>
             </div>

             <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-4 mt-2 bg-[#E10600] text-white font-black italic hover:bg-white hover:text-[#E10600] transition-colors disabled:opacity-50"
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
                        <span className="block text-lg font-mono text-yellow-400">{(rec.personal_best / 1000).toFixed(3)}s</span>
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
