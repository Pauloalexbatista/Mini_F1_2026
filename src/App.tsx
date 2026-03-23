import React, { useState, useEffect } from 'react';
import Menu from './components/Menu';
import Game from './components/Game';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { GameState, PlayerConfig } from './types';
import { TRACKS, TrackDef, parseStudioToNodes, parseStudioControlPoints, fuseAndComputePitLane } from './tracks';
import { TrackBuilder } from './components/TrackBuilder';
import { socket } from './socket';

export const TEAM_LIVERIES = [
  { p: '#DC0000', s: '#000000', name: 'Ferrari', d1: 'Leclerc', d2: 'Hamilton' },
  { p: '#C0C0C0', s: '#00D2BE', name: 'Mercedes', d1: 'Russell', d2: 'Antonelli' },
  { p: '#0600EF', s: '#FFC72C', name: 'Red Bull Racing', d1: 'Verstappen', d2: 'Lawson' },
  { p: '#FF8700', s: '#000000', name: 'McLaren', d1: 'Norris', d2: 'Piastri' },
  { p: '#229971', s: '#000000', name: 'Aston Martin', d1: 'Alonso', d2: 'Stroll' },
  { p: '#0090FF', s: '#FF66C4', name: 'Alpine', d1: 'Gasly', d2: 'Doohan' },
  { p: '#E8002D', s: '#000000', name: 'Audi', d1: 'Hülkenberg', d2: 'Bortoleto' },
  { p: '#222222', s: '#FFFFFF', name: 'Cadillac', d1: 'Herta', d2: 'O\'Ward' },
  { p: '#0000FF', s: '#FFFFFF', name: 'Racing Bulls', d1: 'Tsunoda', d2: 'Hadjar' },
  { p: '#FFFFFF', s: '#FF0000', name: 'Haas F1 Team', d1: 'Ocon', d2: 'Bearman' },
  { p: '#000088', s: '#00A0FF', name: 'Williams', d1: 'Sainz', d2: 'Albon' }
];

const DEFAULT_CONTROLS = [
  { up: 'KeyQ', down: 'KeyA', left: 'KeyO', right: 'KeyP' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' },
  { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6' },
  { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH' },
  { up: 'KeyY', down: 'KeyH', left: 'KeyG', right: 'KeyJ' },
];

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [dbTracks, setDbTracks] = useState<TrackDef[]>([]);
  const [onlineLobby, setOnlineLobby] = useState<any[]>([]);
  
  const [appState, setAppState] = useState<'menu' | 'playing' | 'builder'>('menu');

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsCheckingAuth(false);
        return;
      }
      try {
        const res = await fetch('/api/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          
          try {
             const trackRes = await fetch('/api/tracks');
             let trackData = await trackRes.json();
             
             if (trackData.length === 0 && userData.role === 'admin') {
                for (const t of TRACKS) {
                  await fetch('/api/tracks', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                     body: JSON.stringify({ id: t.id, name: t.name, svg_data: t.svg_data || '', pit_svg_data: t.pit_svg_data || '' })
                  });
                }
                const trackRes2 = await fetch('/api/tracks');
                trackData = await trackRes2.json();
             }
             
             if (trackData.length > 0) {
                const parsedTracks = trackData.map((t: any) => ({
                   id: t.id, name: t.name, 
                   nodes: parseStudioToNodes(t.svg_data, 15.0, 250, true),
                   pitNodes: fuseAndComputePitLane(
                       parseStudioControlPoints(t.svg_data, 15.0, 250, true), 
                       parseStudioControlPoints(t.pit_svg_data, 15.0, 187.5, false)
                   )
                }));
                setDbTracks(parsedTracks);
                setSelectedTracks([parsedTracks[0].id]);
             }
          } catch(e) { console.error("Track Fetch", e); }
          
        } else {
          localStorage.removeItem('token');
        }
      } catch (e) {
        console.error(e);
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);
  const [playerCount, setPlayerCount] = useState(1);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [currentChampionshipRaceIndex, setCurrentChampionshipRaceIndex] = useState(0);
  const [championshipStandings, setChampionshipStandings] = useState<Record<number, number>>({});
  const [totalLaps, setTotalLaps] = useState(3);
  
  const [players, setPlayers] = useState<PlayerConfig[]>(
    Array.from({ length: 6 }).map((_, i) => ({
      id: i + 1,
      color: TEAM_LIVERIES[i].p,
      color2: TEAM_LIVERIES[i].s,
      teamName: TEAM_LIVERIES[i].name,
      driverName: TEAM_LIVERIES[i].d1,
      controls: DEFAULT_CONTROLS[i],
      isBot: false,
      difficulty: 0.85 + (i * 0.03) // 0.85 to 1.0
    }))
  );

  useEffect(() => {
     if (user && appState === 'menu') {
        const p1Livery = TEAM_LIVERIES[user.selected_car_id - 1] || TEAM_LIVERIES[0];
        
        const joinData = {
            userId: user.id || 1,
            driverName: user.pilot_name || user.username || 'PILOTO 1',
            teamName: p1Livery.name,
            color: p1Livery.p,
            color2: p1Livery.s,
            controls: players[0]?.controls || { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
        };

        socket.connect();
        socket.emit('join_lobby', joinData);

        const onLobbyState = (state: any[]) => {
            setOnlineLobby(state);
        };

        const onStartRace = () => {
            if (dbTracks.length > 0) {
               setAppState('playing');
            }
        };

        socket.on('lobby_state', onLobbyState);
        socket.on('start_race', onStartRace);

        return () => {
            socket.off('lobby_state', onLobbyState);
            socket.off('start_race', onStartRace);
            socket.disconnect();
        };
     }
  }, [user, appState, players, dbTracks]);

  const handleUpdatePlayer = (index: number, config: PlayerConfig) => {
    const newPlayers = [...players];
    newPlayers[index] = config;
    setPlayers(newPlayers);
  };

  const handleStartGame = () => {
    if (dbTracks.length > 0) {
        socket.emit('start_race');
    } else {
        alert("Paddock Vazio! Entre no Track Builder Studio e construa uma pista primeiro.");
    }
  };

  const handleBackToMenu = (results?: any[]) => {
      if (results && results.length > 0) {
          const pointsSystem = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
          const newStandings = { ...championshipStandings };
          results.forEach((r, i) => {
              const points = pointsSystem[i] || 0;
              newStandings[r.playerId] = (newStandings[r.playerId] || 0) + points;
          });
          setChampionshipStandings(newStandings);

          if (currentChampionshipRaceIndex + 1 < selectedTracks.length) {
              setCurrentChampionshipRaceIndex(prev => prev + 1);
              return; // Avança logo para a pista seguinte sem sair
          } else {
              setCurrentChampionshipRaceIndex(0);
              setAppState('menu');
          }
      } else {
          setAppState('menu');
          setCurrentChampionshipRaceIndex(0);
      }
  };

  const handleTestTrack = async (customTrack: TrackDef) => {
    try {
       const token = localStorage.getItem('token');
       const res = await fetch('/api/tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ 
              id: customTrack.id, 
              name: customTrack.name, 
              svg_data: customTrack.svg_data || '', 
              pit_svg_data: customTrack.pit_svg_data || '' 
          })
       });

       if (!res.ok) {
           const errData = await res.json().catch(() => ({}));
           throw new Error(errData.error || `HTTP Error ${res.status}`);
       }
       
       const existingIndex = dbTracks.findIndex(t => t.id === customTrack.id);
       if (existingIndex >= 0) {
           const newDb = [...dbTracks];
           newDb[existingIndex] = customTrack;
           setDbTracks(newDb);
       } else {
           setDbTracks([...dbTracks, customTrack]);
       }
       setSelectedTracks([customTrack.id]);
       setAppState('menu');
    } catch(e) {
       console.error("Error saving track to cloud", e);
       alert("Erro de Ligação ao Servidor F1 VPS.");
    }
  };

  const handleDeleteTrack = async (id: string) => {
      try {
         const token = localStorage.getItem('token');
         const res = await fetch(`/api/tracks/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
         });
         
         if (res.ok) {
             const newTracks = dbTracks.filter(t => t.id !== id);
             setDbTracks(newTracks);
             if (selectedTracks.includes(id)) {
                 setSelectedTracks(newTracks.length > 0 ? [newTracks[0].id] : []);
             }
         } else {
             alert("Erro: Apenas Pilotos com estatuto de ADMIN podem apagar pistas da Cloud.");
         }
      } catch(e) {
         console.error("Error deleting track", e);
      }
  };

  // Reconstrução da grelha de Partida usando estritamente o Lobby Online (Sockets)
  let activePlayers: PlayerConfig[] = [];
  
  if (onlineLobby.length > 0) {
      activePlayers = onlineLobby.map((p, i) => ({
          id: p.socketId, // Maintain socket consistency for multiplayer targeting
          isBot: false,
          controls: p.controls,
          driverName: p.driverName,
          teamName: p.teamName,
          color: p.color,
          color2: p.color2,
          difficulty: 1.0,
          socketId: p.socketId,
          isReady: p.isReady
      }));
  } else if (user) {
      // Fallback local se estiver a ligar
      const p1Livery = TEAM_LIVERIES[user.selected_car_id - 1] || TEAM_LIVERIES[0];
      activePlayers.push({
           id: 1,
           isBot: false,
           controls: players[0]?.controls || { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
           driverName: user.pilot_name || players[0]?.driverName || 'PILOTO 1',
           teamName: p1Livery.name,
           color: p1Livery.p,
           color2: p1Livery.s,
           difficulty: 1.0
      });
  }

  // Preenchimento de IA Bots para manter a Grelha Cheia (10 Carros)
  if (activePlayers.length > 0 && activePlayers.length < 10) {
      const neededBots = 10 - activePlayers.length;
      let botIndexOffset = activePlayers.length;
      for (let i = 0; i < neededBots; i++) {
          const liveryIndex = (botIndexOffset + i) % TEAM_LIVERIES.length;
          const botLivery = TEAM_LIVERIES[liveryIndex];
          activePlayers.push({
             id: 10 + i, // IDs acima de 10 para evitar colisões
             isBot: true,
             controls: { up: '', down: '', left: '', right: '' },
             driverName: 'AI ' + botLivery.d2,
             teamName: botLivery.name,
             color: botLivery.p,
             color2: botLivery.s,
             difficulty: 0.90 + (Math.random() * 0.1), // Difficulty 0.90 - 1.00
             socketId: `bot_${i}`,
             isReady: true 
          });
      }
  }

  if (appState === 'builder') {
    return <TrackBuilder onExit={() => setAppState('menu')} onTestTrack={handleTestTrack} />;
  }

  if (appState === 'profile') {
    return <Profile user={user} setUser={setUser} players={players} onUpdatePlayer={handleUpdatePlayer} onBack={() => setAppState('menu')} />;
  }

  if (isCheckingAuth) return <div className="w-full h-screen bg-[#15151e] text-white flex items-center justify-center font-black italic text-3xl">A INICIAR FIA CENTRAL...</div>;

  if (!user) {
    return (
      <Auth onLogin={(token, loggedUser) => {
        localStorage.setItem('token', token);
        setUser(loggedUser);
      }} />
    );
  }

  return (
    <div className={`w-full ${appState === 'menu' ? 'min-h-screen overflow-y-auto overflow-x-hidden' : 'h-screen overflow-hidden'} bg-[#15151e]`}>
      {appState === 'menu' && (
        <Menu 
          tracks={dbTracks}
          players={activePlayers} 
          playerCount={playerCount}
          setPlayerCount={setPlayerCount}
          selectedTracks={selectedTracks}
          setSelectedTracks={setSelectedTracks}
          totalLaps={totalLaps}
          setTotalLaps={setTotalLaps}
          onStart={handleStartGame} 
          onOpenBuilder={() => setAppState('builder')}
          onOpenProfile={() => setAppState('profile')}
          onUpdatePlayer={handleUpdatePlayer} 
          onDeleteTrack={handleDeleteTrack} // New Prop
          user={user} // Pass user role for conditional UI
        />
      )}
      {appState === 'playing' && (
        <Game 
          key={`race-${currentChampionshipRaceIndex}`}
          players={activePlayers} 
          track={dbTracks.find(t => t.id === selectedTracks[currentChampionshipRaceIndex])!}
          totalLaps={totalLaps}
          onBackToMenu={handleBackToMenu} 
        />
      )}
    </div>
  );
}
