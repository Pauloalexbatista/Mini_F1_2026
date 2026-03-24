import React, { useState, useEffect, useRef } from 'react';
import Menu from './components/Menu';
import Game from './components/Game';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { GameState, PlayerConfig } from './types';
import { TRACKS, TrackDef, parseStudioToNodes, parseStudioControlPoints, fuseAndComputePitLane } from './tracks';
import { TrackBuilder } from './components/TrackBuilder';
import { socket } from './socket';

const BOT_NAMES = [
  'Racer X', 'Speedy Gonzales', 'Turbo Tom', 'Flash Gordon', 'Captain Crash',
  'Nitro Nick', 'Zoomer', 'Blaze', 'Vortex', 'Maverick', 'Stinger', 'Phantom',
  'Road Runner', 'Hot Rod Harry', 'Gearhead Greg', 'Piston Pete', 'Drift King',
  'Apex Ace', 'Gridlock Gary', 'Burnout Bob'
];

const DEFAULT_CONTROLS = [
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', camera: 'KeyC' },
  { up: 'KeyQ', down: 'KeyA', left: 'KeyO', right: 'KeyP', camera: 'KeyC' },
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', camera: 'KeyC' },
  { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', camera: 'Numpad0' },
  { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', camera: 'KeyM' }
];

const randomHex = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
const defaultGuestName = 'PILOTO ' + Math.floor(Math.random() * 9999);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [dbTracks, setDbTracks] = useState<TrackDef[]>([]);
  const [globalRoster, setGlobalRoster] = useState<any[]>([]);
  const [lobbyState, setLobbyState] = useState<any[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  // Frozen player list captured at race-start so mid-race lobby changes never reinitialize cars
  const [racePlayers, setRacePlayers] = useState<PlayerConfig[]>([]);
  
  const [appState, setAppState] = useState<'menu' | 'playing' | 'builder'>('menu');

  // Use a ref so the socket handler always reads the latest dbTracks without re-subscribing
  const dbTracksRef = useRef<TrackDef[]>([]);
  useEffect(() => { dbTracksRef.current = dbTracks; }, [dbTracks]);
  // Mirror for computed activePlayers so socket handlers can read without stale closure
  const activePlayersRef = useRef<PlayerConfig[]>([]);

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
          setPlayers(prev => {
             const np = [...prev];
             np[0] = {
                 ...np[0],
                 color: userData.primary_color || '#E10600',
                 color2: userData.secondary_color || '#000000',
                 helmetColor: userData.helmet_color || '#FFDD00',
                 controls: userData.controls || np[0].controls,
                 driverName: userData.pilot_name || userData.username || 'PILOTO 1',
                 teamName: 'Garagem Pessoal'
             };
             return np;
          });
          
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
  
  const [players, setPlayers] = useState<PlayerConfig[]>([
    {
      id: 1,
      color: randomHex(),
      color2: randomHex(),
      helmetColor: randomHex(),
      teamName: 'Garagem Pessoal',
      driverName: defaultGuestName,
      controls: DEFAULT_CONTROLS[0],
      isBot: false,
      isLocal: true,
      difficulty: 1.0
    }
  ]);

  useEffect(() => {
     if (user) {
        socket.connect();
        socket.emit('join_global', {
            userId: user.id || 1,
            driverName: players[0]?.driverName || user.pilot_name || user.username || 'PILOTO 1',
            teamName: 'Garagem Pessoal',
            color: players[0]?.color || user.primary_color || '#E10600',
            color2: players[0]?.color2 || user.secondary_color || '#000000',
            helmetColor: players[0]?.helmetColor || user.helmet_color || '#FFDD00',
        });

        const onGlobalRoster = (roster: any[]) => setGlobalRoster(roster);

        const onLobbyState = (state: any[]) => setLobbyState(state);

        const onTriggerRefresh = () => {
           // signal Menu to re-fetch events list
           setActiveEventId(prev => prev); // force re-render
        };

        const onStartRace = (data: any) => {
            if (data && data.tracks) {
                setSelectedTracks(data.tracks);
                setTotalLaps(data.laps || 1);
            }
            if (dbTracksRef.current.length > 0) {
               // Freeze the player list at race-start so mid-race lobby changes don't restart cars
               setRacePlayers([...activePlayersRef.current]);
               setAppState('playing');
            }
        };

        socket.on('global_roster', onGlobalRoster);
        socket.on('lobby_state', onLobbyState);
        socket.on('trigger_refresh_events', onTriggerRefresh);
        socket.on('race_started', onStartRace);

        return () => {
            socket.off('global_roster', onGlobalRoster);
            socket.off('lobby_state', onLobbyState);
            socket.off('trigger_refresh_events', onTriggerRefresh);
            socket.off('race_started', onStartRace);
            socket.disconnect();
        };
     }
  }, [user]); // Only re-subscribe when user changes, NOT on every dbTracks load

  const handleUpdatePlayer = (index: number, config: PlayerConfig) => {
    const newPlayers = [...players];
    newPlayers[index] = config;
    setPlayers(newPlayers);
  };

  const handleStartGame = () => {
    if (dbTracks.length > 0) {
        if (socket.connected && activeEventId) {
            socket.emit('start_race', { tracks: selectedTracks, laps: totalLaps });
        } else {
            setRacePlayers([...activePlayers]); // Freeze solo lineup
            setAppState('playing');
        }
    } else {
        alert("Paddock Vazio! Entre no Track Builder Studio e construa uma pista primeiro.");
    }
  };

  const handleJoinEvent = (eventId: string, tracks: string[], laps: number) => {
    setActiveEventId(eventId);
    setSelectedTracks(tracks);
    setTotalLaps(laps);
    socket.emit('join_event', eventId);
  };

  const handleLeaveEvent = () => {
    socket.emit('leave_event');
    setActiveEventId(null);
    setLobbyState([]);
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
  
  if (lobbyState.length > 0) {
      activePlayers = lobbyState.map((p, i) => {
          const isLocal = p.socketId === socket.id;
          return {
              id: p.socketId,
              isBot: false,
              isLocal: isLocal,
              controls: isLocal ? (players[0]?.controls || p.controls) : p.controls,
              driverName: p.driverName,
              teamName: p.teamName,
              color: isLocal ? (players[0]?.color || p.color) : p.color,
              color2: isLocal ? (players[0]?.color2 || p.color2) : p.color2,
              helmetColor: isLocal ? (players[0]?.helmetColor || p.helmetColor) : p.helmetColor,
              difficulty: 1.0,
              socketId: p.socketId,
              isReady: p.isReady
          };
      });
  } else if (user || players.length > 0) {
      // Fallback local se estiver a ligar
      activePlayers.push({
           id: 1,
           isBot: false,
           isLocal: true,
           controls: players[0]?.controls || DEFAULT_CONTROLS[0],
           driverName: players[0]?.driverName || user?.pilot_name || defaultGuestName,
           teamName: 'Garagem Pessoal',
           color: players[0]?.color || user?.primary_color || '#E10600',
           color2: players[0]?.color2 || user?.secondary_color || '#000000',
           helmetColor: players[0]?.helmetColor || user?.helmet_color || '#FFDD00',
           difficulty: 1.0,
           socketId: undefined,
           isReady: true
      });
  }

  // Preenchimento de IA Bots para manter a Grelha Cheia (10 Carros)
  if (activePlayers.length > 0 && activePlayers.length < 10) {
      const neededBots = 10 - activePlayers.length;
      
      const BOT_NAMES = ['A. Silva', 'M. Verstappen', 'L. Hamilton', 'F. Alonso', 'C. Leclerc', 'L. Norris', 'C. Sainz', 'G. Russell', 'O. Piastri', 'S. Perez', 'A. Albon', 'Y. Tsunoda', 'N. Hulkenberg', 'V. Bottas', 'E. Ocon', 'P. Gasly', 'K. Magnussen', 'Z. Guanyu', 'L. Stroll', 'L. Lawson', 'A. Senna'];
      const takenNames = activePlayers.map(p => p.driverName);
      const availableNames = BOT_NAMES.filter(n => !takenNames.includes(n)).sort(() => Math.random() - 0.5);

      for (let i = 0; i < neededBots; i++) {
          const hue1 = Math.floor(Math.random() * 360);
          const hue2 = (hue1 + 180 + Math.floor(Math.random() * 60 - 30)) % 360;
          const hueHelmet = Math.floor(Math.random() * 360);

          activePlayers.push({
             id: 10 + i, // IDs acima de 10 para evitar colisões
             isBot: true,
             controls: { up: '', down: '', left: '', right: '' },
             driverName: availableNames[i] || `BOT ${i+1}`,
             teamName: 'AI Racing Team',
             color: `hsl(${hue1}, 85%, 45%)`,
             color2: `hsl(${hue2}, 80%, 30%)`,
             helmetColor: `hsl(${hueHelmet}, 90%, 55%)`,
             difficulty: 0.88 + (Math.random() * 0.12), // Difficulty 0.88 - 1.00
             socketId: `bot_${i}`,
             isReady: true 
          });
      }
  }

  // Always keep ref in sync with latest activePlayers (used by socket handlers)
  activePlayersRef.current = activePlayers;

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
        setPlayers(prev => {
             const np = [...prev];
             np[0] = {
                 ...np[0],
                 color: loggedUser.primary_color || '#E10600',
                 color2: loggedUser.secondary_color || '#000000',
                 helmetColor: loggedUser.helmet_color || '#FFDD00',
                 driverName: loggedUser.pilot_name || loggedUser.username || 'PILOTO 1',
                 teamName: 'Garagem Pessoal'
             };
             return np;
        });
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
          onDeleteTrack={handleDeleteTrack}
          user={user}
          setUser={setUser}
          globalRoster={globalRoster}
          lobbyState={lobbyState}
          activeEventId={activeEventId}
          onJoinEvent={handleJoinEvent}
          onLeaveEvent={handleLeaveEvent}
        />
      )}
      {appState === 'playing' && (
        <Game 
          key={`race-${currentChampionshipRaceIndex}`}
          players={racePlayers.length > 0 ? racePlayers : activePlayers} 
          track={dbTracks.find(t => t.id === selectedTracks[currentChampionshipRaceIndex]) || dbTracks[0]}
          totalLaps={totalLaps}
          onBackToMenu={handleBackToMenu} 
        />
      )}
    </div>
  );
}
