import React, { useState, useEffect } from 'react';
import Menu from './components/Menu';
import Game from './components/Game';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { GameState, PlayerConfig, CarSetupType } from './types';
import { TRACKS, TrackDef, parseStudioToNodes, parseStudioControlPoints, fuseAndComputePitLane } from './tracks';
import { TrackBuilder } from './components/TrackBuilder';

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
  const [dbTracks, setDbTracks] = useState<TrackDef[]>(TRACKS);
  
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
                setSelectedTrack(parsedTracks[0].id);
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
  const [selectedTrack, setSelectedTrack] = useState(TRACKS[0].id);
  const [totalLaps, setTotalLaps] = useState(3);
  const [selectedSetup, setSelectedSetup] = useState<CarSetupType>('BALANCED');
  
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

  const handleUpdatePlayer = (index: number, config: PlayerConfig) => {
    const newPlayers = [...players];
    newPlayers[index] = config;
    setPlayers(newPlayers);
  };

  const handleStartGame = () => {
    if (dbTracks.length > 0) {
        setAppState('playing');
    } else {
        alert("Paddock Vazio! Entre no Track Builder Studio e construa uma pista primeiro.");
    }
  };

  const handleBackToMenu = () => {
    setAppState('menu');
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
       setSelectedTrack(customTrack.id);
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
             if (selectedTrack === id) {
                 setSelectedTrack(newTracks.length > 0 ? newTracks[0].id : '');
             }
         } else {
             alert("Erro: Apenas Pilotos com estatuto de ADMIN podem apagar pistas da Cloud.");
         }
      } catch(e) {
         console.error("Error deleting track", e);
      }
  };

  // Build the 11 car F1 Grid (1 per team as requested)
  let activePlayers: PlayerConfig[] = [];
  let carId = 1;
  TEAM_LIVERIES.forEach(team => {
      activePlayers.push({
        id: carId++, color: team.p, color2: team.s, teamName: team.name, driverName: team.d1,
        isBot: true, difficulty: 0.65 + Math.random()*0.35, controls: undefined
      });
  });

  // Overwrite humans onto the Grid!
  // Player 1 comes from the Cloud DB User Config!
  let uiPlayers = [...players];
  if (playerCount > 0 && user) {
     const p1Livery = TEAM_LIVERIES[user.selected_car_id - 1] || TEAM_LIVERIES[0];
     
     // Build Physics Entity Config
     const p1Config = activePlayers[user.selected_car_id - 1] || activePlayers[0];
     p1Config.isBot = false;
     p1Config.controls = players[0]?.controls || { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
     p1Config.driverName = user.pilot_name || players[0]?.driverName || 'PILOTO 1';
     p1Config.teamName = p1Livery.name;
     p1Config.color = p1Livery.p;
     p1Config.color2 = p1Livery.s;

     // Strict declarative clone for the Menu overlay
     uiPlayers[0] = { 
        ...uiPlayers[0], 
        driverName: p1Config.driverName, 
        teamName: p1Config.teamName, 
        color: p1Config.color, 
        color2: p1Config.color2 
     };
  }

  // Handle Player 2+ locally (split screen guests)
  for(let i=1; i<playerCount; i++) {
     if (activePlayers[i]) {
         activePlayers[i].isBot = false;
         activePlayers[i].controls = players[i]?.controls || { up: '', down: '', left: '', right: '' };
         activePlayers[i].driverName = players[i]?.driverName || `CONVIDADO ${i}`;
     }
  }

  // Ensure uiPlayers mirrors the active human state for the Lobby mapping
  for(let i=1; i<playerCount; i++) {
     if (!uiPlayers[i]) {
        uiPlayers[i] = activePlayers[i];
     } else {
        uiPlayers[i].driverName = activePlayers[i].driverName;
     }
  }

  // Sort humans to the front of the grid for now
  activePlayers = [
     ...activePlayers.filter(p => !p.isBot),
     ...activePlayers.filter(p => p.isBot)
  ];

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
          players={uiPlayers} 
          playerCount={playerCount}
          setPlayerCount={setPlayerCount}
          selectedTrack={selectedTrack}
          setSelectedTrack={setSelectedTrack}
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
          players={activePlayers} 
          trackId={selectedTrack}
          totalLaps={totalLaps}
          onBackToMenu={handleBackToMenu} 
        />
      )}
    </div>
  );
}
