import React, { useState } from 'react';

interface AuthProps {
  onLogin: (token: string, user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pilotName, setPilotName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const endpoint = isLogin ? '/api/login' : '/api/register';
    const payload = isLogin 
      ? { username, password } 
      : { username, password, pilot_name: pilotName };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const textData = await res.text();
      let data;
      try {
         data = textData ? JSON.parse(textData) : {};
      } catch (parseErr) {
         throw new Error(`Servidor devolveu resposta inválida (Status ${res.status}): ${textData.substring(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Autenticação falhou.');
      }

      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full absolute inset-0 bg-[#15151e] flex items-center justify-center overflow-hidden">
      {/* Background Graphic Aesthetic */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #E10600 0%, transparent 40%)'}}
      />
      
      <div className="z-10 bg-black/80 p-10 rounded-xl border-t-4 border-[#E10600] shadow-2xl w-full max-w-md backdrop-blur-md">
        <h1 className="text-4xl font-black italic text-white mb-2 tracking-tighter">
          {isLogin ? 'CASA PARTIDA' : 'LICENÇA FIA'}
        </h1>
        <p className="text-gray-400 mb-8 text-sm uppercase tracking-widest font-bold">
          {isLogin ? 'Identificação do Piloto' : 'Registo Oficial de Pista'}
        </p>

        {error && (
          <div className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-3 mb-6 font-mono text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Identificador F1 (Email / User)</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#1e1e24] text-white p-3 border-b-2 border-transparent focus:border-[#E10600] outline-none font-mono transition-all"
              placeholder="Ex: piloto2026"
            />
          </div>

          {!isLogin && (
             <div>
               <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Nome no Pódio (Exibição)</label>
               <input 
                 type="text" 
                 required
                 value={pilotName}
                 onChange={(e) => setPilotName(e.target.value)}
                 className="w-full bg-[#1e1e24] text-white p-3 border-b-2 border-transparent focus:border-[#FFD700] outline-none font-mono transition-all"
                 placeholder="O nome que sairá nos placares..."
               />
             </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Chave de Telemetria (Password)</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1e1e24] text-white p-3 border-b-2 border-transparent focus:border-[#E10600] outline-none font-mono tracking-widest transition-all"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="mt-4 w-full bg-[#E10600] hover:bg-white text-white hover:text-[#E10600] font-black italic text-xl py-4 transition-colors duration-300 disabled:opacity-50"
          >
            {isLoading ? 'A INICIAR MOTOR...' : (isLogin ? 'ENTRAR NO CÓCKPIT' : 'EMITIR LICENÇA')}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-800 text-center">
          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-gray-400 hover:text-white text-xs uppercase tracking-widest font-bold underline decoration-gray-700 underline-offset-4 transition-colors"
          >
            {isLogin ? 'Primeira vez no Paddock? Regista-te' : 'Já tens chave? Entrar.'}
          </button>
        </div>
      </div>
    </div>
  );
}
