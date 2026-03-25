import React, { useEffect, useRef, useState } from 'react';
import { PlayerConfig, getSetupFromSpeed } from '../types';
import { TrackDef, computeSpline, getTrackTelemetry } from '../tracks';
import { audio } from '../audio';
import { updateCarPhysics, CarPhysics } from '../physics';
import { drawTrack, drawEnvironments, drawF1Car, drawBridges3D } from '../renderer';
import { TrackPreview } from './TrackPreview';
import { socket } from '../socket';
import { RaceResults, RaceResultEntry } from './RaceResults';

interface GameProps {
  key?: React.Key;
  players: PlayerConfig[];
  track: TrackDef;
  totalLaps: number;
  onBackToMenu: (results?: any[], action?: 'next' | 'finish' | 'quit') => void;
  championshipStandings?: Record<number, number>;
  isHost?: boolean;
  hasNextTrack?: boolean;
}

let GAME_WIDTH = 1280;
let GAME_HEIGHT = 720;

export default function Game({ players, track, totalLaps, onBackToMenu, championshipStandings = {}, isHost = true, hasNextTrack = false }: GameProps) {
  const [isSetupPhase, setIsSetupPhase] = useState(true);
  const [playerSetups, setPlayerSetups] = useState<Record<number, number>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudLeftRef = useRef<HTMLCanvasElement>(null);
  const hudRightRef = useRef<HTMLCanvasElement>(null);

  const [raceFinished, setRaceFinished] = useState(false);
  const [startSequence, setStartSequence] = useState(isSetupPhase ? 0 : 1); 
  const [, setForceRender] = useState(0);
  const [cameraModeUI, setCameraModeUI] = useState<'CENTRAL' | 'DYNAMIC' | 'QUADRANTS'>('CENTRAL');
  const [localSetupReady, setLocalSetupReady] = useState(false); // true after clicking IR PARA A PISTA
  const globalBestLapRef = useRef<number>(Infinity);
  const [fastLapPopup, setFastLapPopup] = useState<{name: string, time: string, color: string, isInitial: boolean} | null>(null);
  const [liveStandings, setLiveStandings] = useState<number[]>([]);
  
  const carsRef = useRef<CarPhysics[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const startTimeRef = useRef<number>(0);
  const firstFinishTimeRef = useRef<number | null>(null);
  const allHumansFinishedTimeRef = useRef<number | null>(null);
  const cameraRef = useRef<{x: number, y: number, scale: number} | null>(null);
  const cameraModeRef = useRef<'CENTRAL' | 'DYNAMIC' | 'QUADRANTS'>('CENTRAL');
  const quadOffsetRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  const lookAheadRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  const skidMarksRef = useRef<{x: number, y: number, a: number, w: number}[]>([]);
  const camAngleRef = useRef<number>(0);
  const lastEmitRef = useRef<number>(0);
  
  const rawTrack = track;
  const spline = React.useMemo(() => rawTrack.nodes, [rawTrack]);

  const mapBounds = React.useMemo(() => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      if (spline) {
        spline.forEach(({x, y}) => {
           if (x < minX) minX = x;
           if (x > maxX) maxX = x;
           if (y < minY) minY = y;
           if (y > maxY) maxY = y;
        });
      }
      const w = maxX - minX;
      const h = maxY - minY;
      return { minX: minX - w*0.1, maxX: maxX + w*0.1, minY: minY - h*0.1, maxY: maxY + h*0.1 };
  }, [spline]);

  useEffect(() => {
     if (isSetupPhase || raceFinished || startSequence < 4) return;
     const interval = setInterval(() => {
         const sorted = [...carsRef.current].sort((a,b) => {
             const scoreA = (a.laps * 100000) + a.currentWaypoint;
             const scoreB = (b.laps * 100000) + b.currentWaypoint;
             return scoreB - scoreA;
         });
         setLiveStandings(sorted.map(c => c.id));
     }, 500);
     return () => clearInterval(interval);
  }, [isSetupPhase, raceFinished, startSequence]);

  // Init cars
  useEffect(() => {
    audio.init();
    firstFinishTimeRef.current = null;
    allHumansFinishedTimeRef.current = null;
    
    // Superior Grid Generation logic: place them precisely on Spline Points backwards from Start Line
    carsRef.current = players.map((p, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      
      const targetDistance = 200 + row * 150; // 200px behind line, +150px per row (approx 1.5 car lengths)
      let computedIndex = 0;
      let accumulatedDistance = 0;
      
      for (let i = spline.length - 1; i > 0; i--) {
        const p1 = spline[i];
        const p2 = spline[(i + 1) % spline.length];
        const dist = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
        accumulatedDistance += dist;
        if (accumulatedDistance >= targetDistance) {
          computedIndex = i;
          break;
        }
      }
      // 2. Anti-Sobreposição Removida (Pontes Habilitadas!)
      // O sistema agora permite desenhar em formato Figura-8. O motor F1 usa Coerência Temporal para gerir viadutos!
      
      const botSpeed = 160 + Math.floor(Math.random() * 21) * 10;
      
      // Default Setup Top Speed for humans
      let finalSpeed = 260;
      if (!p.isBot && playerSetups[p.id]) finalSpeed = playerSetups[p.id];
      const assignedSetupProfile = getSetupFromSpeed(p.isBot ? botSpeed : finalSpeed);

      const spawnNode = spline[computedIndex];
      const nextSpawnNode = spline[(computedIndex + 1) % spline.length];
      const sAngle = Math.atan2(nextSpawnNode.y - spawnNode.y, nextSpawnNode.x - spawnNode.x);
      
      const offsetY = col === 0 ? -40 : 40;
      const rotX = -offsetY * Math.sin(sAngle);
      const rotY = offsetY * Math.cos(sAngle);

      return {
        id: p.id,
        x: spawnNode.x + rotX,
        y: spawnNode.y + rotY,
        vx: 0,
        vy: 0,
        angle: sAngle,
        angularVelocity: 0,
        throttle: 0,
        brake: 0,
        steer: 0,
        maxSpeed: 800 + (p.isBot ? (p.difficulty || 0.8) * 100 : 200),
        enginePower: 350 + (p.isBot ? (p.difficulty || 0.8) * 50 : 150), // Smooth 0-1000px in ~2s
        brakingPower: 400, // Reduzido para 400 para uma travagem progressiva F1
        grip: 1.0 + (p.isBot ? (p.difficulty || 0.8) * 0.1 : 0.2),
        mass: 800,
        color: p.color,
        color2: p.color2,
        helmetColor: p.helmetColor,
        isBot: p.isBot || false,
        isLocal: p.isLocal || false,
        givenUp: false,
        damage: 0,
        tireHealth: 100,
        laps: -1, // Wait behind grid for the green light! 
        currentWaypoint: (computedIndex + 8) % spline.length, // target precisely ahead of their spawn
        finishTime: null,
        controls: p.controls,
        setupProfile: assignedSetupProfile
      };
    });
    
    return () => {
      audio.stopAllEngines();
    };
  }, [players, spline, playerSetups]);

  // Start sequence
  useEffect(() => {
    if (isSetupPhase) return; // Wait for Parc Fermé to close
    
    let timer: NodeJS.Timeout;
    if (startSequence === 0) {
      timer = setTimeout(() => { setStartSequence(1); audio.playStartSequence(); }, 1000);
    } else if (startSequence === 1) {
      timer = setTimeout(() => { setStartSequence(2); }, 1000);
    } else if (startSequence === 2) {
      timer = setTimeout(() => { setStartSequence(3); }, 1000);
    } else if (startSequence === 3) {
      timer = setTimeout(() => { 
        startTimeRef.current = Date.now(); 
        carsRef.current.forEach(c => c.currentLapStartTime = startTimeRef.current);
        setStartSequence(4); 
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [startSequence, isSetupPhase]);

  // Listen for Parc Ferme all_setup_ready signal
  useEffect(() => {
     const onAllSetupReady = () => {
        setIsSetupPhase(false);
        setStartSequence(1);
        setForceRender(Date.now());
     };
     socket.on('all_setup_ready', onAllSetupReady);
     return () => { socket.off('all_setup_ready', onAllSetupReady); };
  }, []);

  // Listen for Multiplayer Telemetry
  useEffect(() => {
     if (isSetupPhase) return;
     const onRemoteTick = (data: any) => {
        const car = carsRef.current.find(c => c.id === data.id);
        if (car && !car.isLocal && !car.isBot) {
           car.remoteTarget = { x: data.x, y: data.y, a: data.a };
           car.vx = data.vx;
           car.vy = data.vy;
           car.steer = data.s;
           car.brake = data.b;
           car.throttle = data.t;
        }
     };
     socket.on('remote_tick', onRemoteTick);
     return () => { socket.off('remote_tick', onRemoteTick); };
  }, [isSetupPhase]);

  // Keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => { 
       keysRef.current[e.code] = true;
       
       const cameraKeys = players.filter(p => !p.isBot).map(p => p.controls?.camera || 'KeyC');
       if (cameraKeys.includes(e.code)) {
          const next = cameraModeRef.current === 'CENTRAL' ? 'DYNAMIC' : (cameraModeRef.current === 'DYNAMIC' ? 'QUADRANTS' : 'CENTRAL');
          cameraModeRef.current = next;
          setCameraModeUI(next);
       }
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [players]);

  const formatTime = (ms: number) => {
    if (ms === Infinity) return '---';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const milli = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${milli.toString().padStart(2,'0')}`;
  };

  const submitLapTime = async (timeMs: number) => {
     try {
        const token = localStorage.getItem('token');
        if (!token) return; // Guests don't get leaderboard entries
        
        // Em produção vamos apontar dinamicamente para onde estamos alojados.
        // Como o site será minif12026.online, a API relativa ao mesmo site é "/api/lap-times"
        await fetch(`/api/lap-times`, {
           method: 'POST',
           headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
           },
           body: JSON.stringify({
              track_id: track.id,
              lap_time_ms: timeMs
           })
        });
     } catch (e) {
        console.error("Error submitting lap time", e);
     }
  };

  // Game Loop
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Automatically configure the physical boundary of the fullscreen canvas component
    canvasRef.current.width = window.innerWidth;
    canvasRef.current.height = window.innerHeight;
    
    let animationFrameId: number;
    let lastTime = performance.now();

    const pitSpline = (rawTrack.pitNodes && rawTrack.pitNodes.length > 0) ? rawTrack.pitNodes : null;
    let pitEntrySplineIndex = -1;
    if (pitSpline) {
      let minDist = Infinity;
      for (let i = 0; i < spline.length; i++) {
        const dSq = (spline[i].x - pitSpline[0].x)**2 + (spline[i].y - pitSpline[0].y)**2;
        if (dSq < minDist) { minDist = dSq; pitEntrySplineIndex = i; }
      }
    }

    const update = (time: number) => {
      // Keep static dimensions for physics consistency
      GAME_WIDTH = 1280;
      GAME_HEIGHT = 720;

      let dt = (time - lastTime) / 1000;
      if (dt < 0) dt = 0; // Prevent Math.exp(-negative) explosions
      if (dt > 0.1) dt = 0.016; // Max delta to prevent physics explosion
      lastTime = time;
      
      const now = Date.now();

      try {
      
        if (startSequence >= 4) {
          let anyoneFinished = false;
        let activeHumans = 0;
        let humansGivenUp = 0;

        carsRef.current.forEach(car => {
          if (!car.isBot) activeHumans++;
          if (car.givenUp && !car.isBot) humansGivenUp++;
          if (car.finishTime !== null) {
            anyoneFinished = true;
            return;
          }

          // Calculate absolute speed required globally for AI physics, Skid Marks and DRS limits
          const speed = Math.sqrt(car.vx*car.vx + car.vy*car.vy);

          // 1. Find Closest Spline Segment
          let minSplineDistSq = Infinity;
          let closestIndex = car.currentWaypoint;
          let resolveX = car.x;
          let resolveY = car.y;
          
          let searchRange = spline.length; 
          if (car.currentWaypoint > 0) {
             searchRange = 400; 
          }

          for (let s = 0; s <= searchRange * 2; s++) {
             let i = (car.currentWaypoint - searchRange + s + spline.length) % spline.length;
             if (searchRange === spline.length && s >= spline.length) break;
             
             let nextI = (i + 1) % spline.length;
             const p1 = spline[i];
             const p2 = spline[nextI];
             
             const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
             let t = 0;
             if (l2 > 0) {
                 t = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2;
                 t = Math.max(0, Math.min(1, t));
             }
             
             const projX = p1.x + t * (p2.x - p1.x);
             const projY = p1.y + t * (p2.y - p1.y);
             const distSq = (car.x - projX)**2 + (car.y - projY)**2;
             
             if (distSq < minSplineDistSq) {
               minSplineDistSq = distSq;
               closestIndex = t < 0.5 ? i : nextI;
               resolveX = projX;
               resolveY = projY;
             }
          }
          
          const closestNode = spline[closestIndex];
          const distToCenter = Math.sqrt(minSplineDistSq);
          const trackWidth = closestNode.width;
          
          // 2. Identify Pit Lane Segment Proximity
          let pitDistToCenter = Infinity;
          let closestPitIndex = -1;
          let pitResolveX = car.x;
          let pitResolveY = car.y;
          
          if (pitSpline) {
            for (let i = 0; i < pitSpline.length - 1; i++) {
              const p1 = pitSpline[i];
              const p2 = pitSpline[i+1];
              
              const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
              let t = 0;
              if (l2 > 0) {
                  t = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2;
                  t = Math.max(0, Math.min(1, t));
              }
              const projX = p1.x + t * (p2.x - p1.x);
              const projY = p1.y + t * (p2.y - p1.y);
              const pDistSq = (car.x - projX)**2 + (car.y - projY)**2;

              if (pDistSq < pitDistToCenter) {
                 pitDistToCenter = pDistSq;
                 closestPitIndex = t < 0.5 ? i : i+1;
                 pitResolveX = projX;
                 pitResolveY = projY;
              }
            }
            pitDistToCenter = Math.sqrt(pitDistToCenter);
          }

          // 3. Determine Surface & Pit Lane Status
          let surface: 'TRACK' | 'CURB' | 'CURB_WIDE' | 'CURB_APEX' | 'GRASS' = 'TRACK';
          let isInPitLane = false;
          
          // Só estamos na Pit Lane se o carro estiver rigorosamente em cima do Asfalto da Box (Metade da width total)!
          if (pitSpline && pitDistToCenter < pitSpline[closestPitIndex].width * 0.5 && pitDistToCenter < distToCenter) {
             isInPitLane = true;
          } else {
             // A física agora herda a topologia Métrica a 100%! (+30px por cor)
             let extendedTight = closestNode.isExtendedTight || false;
             let apexTight = closestNode.isApexTight || false;

             if (apexTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.95) {
                 if (distToCenter > trackWidth * 0.80) surface = 'CURB_APEX'; // Vermelha (70%)
                 else if (distToCenter > trackWidth * 0.65) surface = 'CURB_WIDE'; // Amarela (80%)
                 else surface = 'CURB'; // Branca (90%)
             } else if (extendedTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.80) {
                 if (distToCenter > trackWidth * 0.65) surface = 'CURB_WIDE'; // Amarela (80%)
                 else surface = 'CURB'; // Branca (90%)
             } else if (distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.65) {
                 surface = 'CURB'; // Branca (90%)
             } else if (distToCenter > trackWidth * 0.5) {
                 surface = 'GRASS';
             }
          }

          // Grass area officially limits dynamically to the Voronoi bounds!
          const mainWallRadius = closestNode.maxWallRadius || (trackWidth * 1.70);
          
          // O raio físico do Muro da Pit Lane DEVE bater perfeitamente certo com o Visual da renderer.ts (0.99w de lineWidth => raio é 0.495 do width da box)
          const pitWallRadius = pitSpline && closestPitIndex >= 0 ? pitSpline[closestPitIndex].width * 0.495 : 0;
          
          const isOutsideMain = distToCenter > mainWallRadius - 10;
          // Muro da pit lane também repara no "final / inicio" do array de Splines. O carro sai pelo "tubo" livremente!
          const isOutsidePit = pitSpline ? (pitDistToCenter > pitWallRadius - 4) : true;

          if (isOutsideMain && isOutsidePit) {
             // Car is hitting a wall! Which wall? The one it is closest to resolving!
             let resX = resolveX;
             let resY = resolveY;
             let resolveDist = distToCenter;
             let resolveRadius = mainWallRadius;
             
             if (pitSpline && (pitDistToCenter - pitWallRadius) < (distToCenter - mainWallRadius)) {
                 resX = pitResolveX;
                 resY = pitResolveY;
                 resolveDist = Math.max(0.1, pitDistToCenter); // Prevent division by zero
                 resolveRadius = pitWallRadius;
             } else {
                 resolveDist = Math.max(0.1, distToCenter);
             }
             
             // Push car back inside the boundary mathematically against the precise segment projection!
             const nx = (car.x - resX) / resolveDist;
             const ny = (car.y - resY) / resolveDist;
             car.x = resX + nx * (resolveRadius - 10);
             car.y = resY + ny * (resolveRadius - 10);
             
             // Regra de Ouro F1: Chocar com o muro preto significa bater seco 0% velocidade
             car.vx = 0;
             car.vy = 0;
             
             // O carro "amassa" fixamente 5% por cada trincadela no muro!
             // Garantimos 10% mínimo de saúde (dano max a 90) para o carro conseguir ir à Box
             if (speed > 50) {
                car.damage = Math.min(90, car.damage + 5);
             }
          }

          // Controls
          car.throttle = 0;
          car.brake = 0;
          car.steer = 0;

          if (car.isBot) {
            // Superior Bot AI: Aumenta substancialmente a visão antecipada a médias e altas velocidades!
            const lookAhead = Math.floor(10 + (speed / 15)); // A 300km/h, olha ~30 nós (600px) à frente
            
            let targetArray = spline;
            let myClosestIndex = closestIndex;
            let useLoop = true;

            if (pitSpline) {
               if (isInPitLane) {
                  targetArray = pitSpline;
                  useLoop = false;
                  let minDist = Infinity;
                  for (let i = 0; i < pitSpline.length; i++) {
                     const dSq = (car.x - pitSpline[i].x)**2 + (car.y - pitSpline[i].y)**2;
                     if (dSq < minDist) { minDist = dSq; myClosestIndex = i; }
                  }
               } else if (car.damage >= 50 && pitEntrySplineIndex !== -1) {
                 let distToEntry = pitEntrySplineIndex - closestIndex;
                 if (distToEntry < 0) distToEntry += spline.length;
                 // Se aproximar do pit entry
                 if (distToEntry > 0 && distToEntry < 150) {
                    targetArray = pitSpline;
                    useLoop = false;
                    myClosestIndex = 0; 
                 }
               }
            }

            const targetIndex = useLoop ? (myClosestIndex + lookAhead) % targetArray.length : Math.min(myClosestIndex + lookAhead, targetArray.length - 1);
            const rawTarget = targetArray[targetIndex];
            
            // Jitter ligeiro 
            const jitterX = Math.cos(car.id * 8.1) * 15;
            const jitterY = Math.sin(car.id * 8.1) * 15;

            // Avoid other bots (mas suave ao longe)
            let extraJitterX = 0;
            let extraJitterY = 0;
            carsRef.current.forEach(otherCar => {
              if (otherCar.id !== car.id) {
                const odx = car.x - otherCar.x;
                const ody = car.y - otherCar.y;
                const dist = Math.sqrt(odx*odx + ody*ody);
                if (dist > 0.1 && dist < 120) {
                  const push = (120 - dist) * 0.2; // Empurrão suave e longo
                  extraJitterX += (odx / dist) * push;
                  extraJitterY += (ody / dist) * push;
                }
              }
            });

            const targetX = rawTarget.x + jitterX + extraJitterX;
            const targetY = rawTarget.y + jitterY + extraJitterY;

            const dx = targetX - car.x;
            const dy = targetY - car.y;

            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - car.angle;
            
            if (isNaN(angleDiff) || !isFinite(angleDiff)) { angleDiff = 0; }
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

            // Direção suave proporcional à velocidade
            const steerSensitivity = Math.max(1.5, 4.0 - (speed / 120)); 
            car.steer = Math.max(-1, Math.min(1, angleDiff * steerSensitivity));

            // Travagem Progressiva Baseada na Curvatura (AngleDiff excede agora 3x por penalidade F1 realista)
            // Se o ângulo é enorme, corta velocidade progressivamente em vez de pancada súbita
            // Removemos pequenos ruídos de ângulo de 0.05 radianos (retas) mas multiplicamos por 3.5x o resto!
            let penaltyByAngle = Math.max(0, Math.abs(angleDiff) - 0.05);
            const cornerSafeSpeed = car.maxSpeed * Math.max(0.20, 1.0 - (penaltyByAngle * 3.5)); 
            
            const safeSpeed = (surface === 'GRASS') ? car.maxSpeed * 0.3 : cornerSafeSpeed;
            
            if (speed < safeSpeed - 5) {
              car.throttle = 1.0;
              car.brake = 0.0;
            } else if (speed > safeSpeed + 15) {
              car.throttle = 0.0;
              car.brake = Math.min(1.0, (speed - safeSpeed) / 100); // Travagem analógica pesada
            } else {
               car.throttle = 0; // coast
               car.brake = 0;
            }
          } else if (car.isLocal) {
            // Human Local (Com Ajudas de Condução F1 - "Assists")
            if (car.controls) {
              // 1. TC (Traction Control Mínimo): Corta agressividade do acelerador fora de pista
              let maxThrottle = (surface === 'GRASS') ? 0.4 : 1.0;
              
              if (keysRef.current[car.controls.up]) car.throttle = maxThrottle;
              if (keysRef.current[car.controls.down]) car.brake = 1.0;
              
              // 2. Speed-Sensitive Steering (Direção Assistida)
              // A baixa velocidade vira 100%. 
              // A alta velocidade (300km/h), o volante aperta mas garante no mínimo 70% da brecagem máxima para atacar as curvas de Monza sem queimar fita!
              const steerLimit = Math.max(0.70, 1.0 - (speed / 1200));
              
              if (keysRef.current[car.controls.left]) car.steer = -steerLimit;
              if (keysRef.current[car.controls.right]) car.steer = steerLimit;
            }
          } else {
            // Remote Human Multiplayer
            if (car.remoteTarget) {
                car.x += (car.remoteTarget.x - car.x) * 0.3; // LERP X
                car.y += (car.remoteTarget.y - car.y) * 0.3; // LERP Y
                let ad = car.remoteTarget.a - car.angle;
                while(ad > Math.PI) ad -= Math.PI * 2;
                while(ad < -Math.PI) ad += Math.PI * 2;
                car.angle += ad * 0.3;
            }
          }

          // --- SURFACE FRICTION PHYSICS ---
          if (surface === 'GRASS') {
             car.damage = Math.min(90, car.damage + 0.01); 
             if (speed > car.maxSpeed * 0.6) {
                // A relva tem um cap de velocidade nos 60% e arrasta mais forte (Gravel Trap feel)
                car.vx *= 0.98; car.vy *= 0.98; 
             }
          }

          // Pit Lane Speed Limiter & Restoration
          if (isInPitLane) {
            const pitNode = pitSpline[closestPitIndex];
            const pitMaxDist = pitSpline[pitSpline.length - 1].distFromStart || 0;
            
            // Limitador de velocidade ativado EXCLUSIVAMENTE nas faixas de 1000px!
            if (pitNode.distFromStart !== undefined && pitNode.distFromStart > 1000 && pitNode.distFromStart < pitMaxDist - 1000) {
                const pitSpeedLimit = car.maxSpeed * 0.4; // 60% reduction (max 40% speed)
                if (speed > pitSpeedLimit) {
                   // Hard brake automatically (Speed Limiter engaged)
                   car.throttle = 0;
                   car.brake = 1.0;
                   if (speed > pitSpeedLimit * 1.2) {
                     car.vx *= 0.95; car.vy *= 0.95; // Force physics constraint
                   }
                }
                
                // A ZONA VERMELHA é estritamente o centro da Pit Lane (40% a 60% da zona restrita)
                const restrictedDist = Math.max(1, pitMaxDist - 2000);
                const redStart = 1000 + (restrictedDist * 0.40);
                const redEnd = 1000 + (restrictedDist * 0.60);
                
                // Fix car up ONLY when legally driving over the exact RED BOX!
                if (pitNode.distFromStart > redStart && pitNode.distFromStart < redEnd) {
                   car.damage = 0; 
                   car.tireHealth = 100; // Tire swap!
                }
            }
          }

          // Collisions (Car vs Car push apart)
          carsRef.current.forEach(otherCar => {
            if (otherCar.id > car.id) {
              // Z-Index Elevation Check (Pontes 3D F1)
              // Se os carros estão na mesma coordenada geométrica, mas separados por > 500 fatias na narrativa da pista,
              // um está em cima da Ponte e o outro debaixo do Túnel. A colisão é fisicamente impossível!
              const trackDist = Math.abs(car.currentWaypoint - otherCar.currentWaypoint);
              const isSameZLevel = !(trackDist > 500 && trackDist < spline.length - 500);

              if (isSameZLevel) {
                  const dx = otherCar.x - car.x;
                  const dy = otherCar.y - car.y;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  const minColDist = 40; // 40px radius
                  if (dist < minColDist && dist > 0.1) {
                    // compute impact damage
                    const nx = dx / dist; const ny = dy / dist;
                    const relVx = car.vx - otherCar.vx;
                    const relVy = car.vy - otherCar.vy;
                    const impactSpeed = Math.abs(relVx * nx + relVy * ny);
                    if (impactSpeed > 200) {
                       car.damage = Math.min(90, car.damage + 5);
                       otherCar.damage = Math.min(90, otherCar.damage + 5);
                    }

                    const push = (minColDist - dist) * 0.5;
                    const pushX = nx * push;
                    const pushY = ny * push;
                    car.x -= pushX; car.y -= pushY;
                    otherCar.x += pushX; otherCar.y += pushY;
                    
                    // Transferência de Momento Elástico (Bounce Real)
                    if (relVx * nx + relVy * ny > 0) {
                        const restitution = 0.5; // Fator de Bounciness F1 (Fibra de Carbono)
                        const impulse = (1 + restitution) * (relVx * nx + relVy * ny) / 2; 
                        const impulseX = impulse * nx;
                        const impulseY = impulse * ny;
                        car.vx -= impulseX; car.vy -= impulseY;
                        otherCar.vx += impulseX; otherCar.vy += impulseY;
                    }
                  }
              }
            }
          });

          // ---------- SLIPSTREAM & DRS DETECTION ----------
          car.slipstreamActive = false;
          car.drsEnabled = false;

          if (!isInPitLane && speed > 200) {
              let minChaseDist = Infinity;
              carsRef.current.forEach(otherCar => {
                 if (otherCar.id !== car.id && !otherCar.givenUp) {
                    const dx = otherCar.x - car.x;
                    const dy = otherCar.y - car.y;
                    const physDist = Math.sqrt(dx*dx + dy*dy);
                    
                    // To be in the slipstream, the other car must be perfectly AHEAD
                    const nx = Math.cos(car.angle);
                    const ny = Math.sin(car.angle);
                    const dot = (dx/physDist) * nx + (dy/physDist) * ny;
                    
                    // 1200 pixels is roughly 1 second gap at 300km/h. dot > 0.85 means a tight 30-degree cone ahead
                    if (physDist < 1200 && physDist > 50 && dot > 0.85) {
                       minChaseDist = Math.min(minChaseDist, physDist);
                    }
                 }
              });

              if (minChaseDist < 1200) {
                 car.slipstreamActive = true;
                 
                 // Check DRS Activation Zones if inside slipstream
                 if (rawTrack.drsZones && closestNode.nodeIndex !== undefined) {
                    const nodeIdx = closestNode.nodeIndex;
                    const inZone = rawTrack.drsZones.some(z => {
                        if (z.start <= z.end) return nodeIdx >= z.start && nodeIdx <= z.end;
                        return nodeIdx >= z.start || nodeIdx <= z.end; // Wrap around support
                    });
                    if (inZone) car.drsEnabled = true;
                 }
              }
          }

          // Overrides de Condução (Carro terminou a corrida!)
          if (car.finishTime !== null) {
              car.throttle = 0.0;
              car.steer *= 0.5; // Não volta a curvar a fundo
              // Trava suavemente
              if (speed > 200) car.brake = 0.6;
              else if (speed > 50) car.brake = 0.9;
              else car.brake = 1.0; 
          }

          // Apply Physics ONLY for local instances (Bots master / Local human)
          if (car.isLocal || car.isBot) {
              updateCarPhysics(car, dt, surface);
              
              if (car.isLocal && socket.connected) {
                 if (now - lastEmitRef.current > 50) { // 20Hz limit
                    socket.emit('player_tick', {
                        id: car.id,
                        x: car.x,
                        y: car.y,
                        a: car.angle,
                        vx: car.vx,
                        vy: car.vy,
                        s: car.steer,
                        b: car.brake,
                        t: car.throttle
                    });
                    lastEmitRef.current = now;
                 }
              }
          }
          
          audio.updateEngine(car.id, Math.sqrt(car.vx*car.vx + car.vy*car.vy) / 1200, car.throttle, car.isBot);

          // Generate Persistent Skid Marks purely if Tire Degradation Physics are in Tier III / Tier IV conditions!
          if (speed > 100 && car.isSkidding) {
             skidMarksRef.current.push({ x: car.x, y: car.y, a: car.angle, w: 22 });
             if (skidMarksRef.current.length > 3000) skidMarksRef.current.shift();
          }

          // Robust Lap counting logic
          // Only increment tracking waypoint if moving forwards linearly (increased to 400 for pit-lane skips)
          if (closestIndex > car.currentWaypoint && closestIndex < car.currentWaypoint + 400) {
             car.currentWaypoint = closestIndex;
          }
          
          // Cross start line forwards
          if (closestIndex < 20 && car.currentWaypoint > spline.length * 0.8) {
             car.laps++;
             car.currentWaypoint = 0; // reset
             
             // Track Lap Times
             if (car.laps > 0 && car.currentLapStartTime) {
                const lapTime = now - car.currentLapStartTime;
                car.lastLapTime = lapTime;
                if (!car.bestLapTime || lapTime < car.bestLapTime) car.bestLapTime = lapTime;
                
                if (lapTime < globalBestLapRef.current) {
                    const isInitial = globalBestLapRef.current === Infinity;
                    globalBestLapRef.current = lapTime;
                    
                    const pDetails = players.find(p => p.id === car.id);
                    const name = pDetails?.driverName || (car.isBot ? 'BOT AI' : `P${car.id}`);
                    setFastLapPopup({ name, time: formatTime(lapTime), color: car.color, isInitial });
                    setTimeout(() => setFastLapPopup(null), 4000);
                }

                const lastEl = document.getElementById(`hud-last-${car.id}`);
                if (lastEl) lastEl.innerText = formatTime(lapTime);
                const bestEl = document.getElementById(`hud-best-${car.id}`);
                if (bestEl) bestEl.innerText = formatTime(car.bestLapTime);
             }
             car.currentLapStartTime = now;

             if (car.laps >= totalLaps && totalLaps > 0) {
               if (car.finishTime === null || car.finishTime === undefined) {
                   car.finishTime = now - startTimeRef.current;
                   if (!car.isBot && !car.scorePosted) {
                       car.scorePosted = true;
                       submitLapTime(car.finishTime);
                   }
               }
             }
          }
        });

        // ------------------ MULTIPLAYER SYNC (20Hz ~ 50ms) ------------------
        const nowMs = Date.now();
        if (nowMs - lastEmitRef.current > 50) {
           carsRef.current.filter(c => c.isLocal).forEach(c => {
               socket.emit('player_tick', {
                   id: c.id, x: c.x, y: c.y, a: c.angle,
                   vx: c.vx, vy: c.vy, s: c.steer, b: c.brake, t: c.throttle
               });
           });
           lastEmitRef.current = nowMs;
        }

        if (carsRef.current.some(c => c.finishTime !== null && c.finishTime !== undefined) && firstFinishTimeRef.current === null) {
          firstFinishTimeRef.current = now;
          audio.playVictory();
        }

        const activeHumanCars = carsRef.current.filter(c => !c.isBot);
        const allHumansFinished = activeHumanCars.length > 0 && activeHumanCars.every(c => c.finishTime !== null || c.givenUp);

        if (allHumansFinished) {
            if (allHumansFinishedTimeRef.current === null) {
                allHumansFinishedTimeRef.current = now;
            } else if (now - allHumansFinishedTimeRef.current > 5000) {
                setRaceFinished(true);
            }
        }
      } // end if race started
      } catch (e: any) {
         (window as any).lastCrash = e.stack || e.message;
         console.error("F1 PHYSICS ENGINE CRASH:", e);
      }

      // RENDER
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      GAME_WIDTH = canvasRef.current.width;
      GAME_HEIGHT = canvasRef.current.height;

      // CRITICAL: In multiplayer, target YOUR OWN car (isLocal), not just the first non-bot
      const mainCar = carsRef.current.find(c => c.isLocal) || carsRef.current.find(c => !c.isBot) || carsRef.current[0];
      const speed = Math.sqrt(mainCar.vx*mainCar.vx + mainCar.vy*mainCar.vy);
      
      // Dynamic zoom based on speed + Cinematic Intro / Outro
      const baseScale = Math.max(0.35, 1.0 - (speed / 1000) * 0.6);
      let targetScale = baseScale;
      
      // Amplia a câmara apenas ANTES do 2º Beep e volta a subir para os "Céus" quando a corrida terminar para os humanos!
      if (startSequence < 2 || raceFinished) {
         targetScale = 0.08; // High-altitude orbit view
      } else if (cameraModeRef.current === 'QUADRANTS') {
         targetScale = baseScale; // Use normal zoom dynamically
      }

      let targetCamX = mainCar.x;
      let targetCamY = mainCar.y;
      
      let quadScreenOffsetX = 0;
      let quadScreenOffsetY = 0;

      // ----------------------------------------------------
      // APEX LOOK-AHEAD CAMERA (O Foco Ocular de um Piloto de F1)
      // Em vez de olhar ingenuamente para a relva à frente do Nariz do Carro, 
      // o Piloto projeta o olhar para o interior da próxima Curva (Spline Path).
      let lookAngle = mainCar.angle;
      if (spline && spline.length > 0) {
          // O quão à frente o piloto olha depende intrinsecamente da velocidade
          const lookAheadNodes = Math.min(25, Math.floor(speed / 40) + 5); 
          const futureIndex = (mainCar.currentWaypoint + lookAheadNodes) % spline.length;
          const futureNode = spline[futureIndex];
          
          if (futureNode) {
              // Vector do carro para o asfalto futuro
              lookAngle = Math.atan2(futureNode.y - mainCar.y, futureNode.x - mainCar.x);
              
              // Se o carro for em marcha atrás (ou derrapar 180º), invertemos o ângulo para não ficar estrábico 
              const cosDiff = Math.cos(lookAngle) * Math.cos(mainCar.angle) + Math.sin(lookAngle) * Math.sin(mainCar.angle);
              if (cosDiff < -0.5) lookAngle += Math.PI; // Face backwards smoothly
          }
      }

      // Filtro de Micro-Tremor: Apenas segue alterações do angulo se o carro estiver efetivamente a andar. 
      let angleDiff = lookAngle - camAngleRef.current;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      if (speed > 2) {
          camAngleRef.current += angleDiff * 0.05;
      }

      if (cameraModeRef.current === 'DYNAMIC' && startSequence >= 4) {
          // Dynamic Mode: Smooth scaling look-ahead sem jitter.
          const speedRatio = Math.min(1.0, speed / 1000); 
          const maxDynamicW = GAME_WIDTH * 0.35;
          const maxDynamicH = GAME_HEIGHT * 0.35;
          
          quadScreenOffsetX = -Math.cos(camAngleRef.current) * (speedRatio * maxDynamicW);
          quadScreenOffsetY = -Math.sin(camAngleRef.current) * (speedRatio * maxDynamicH);
          
      } else if (cameraModeRef.current === 'QUADRANTS' && startSequence >= 4) {
          // Quadrants Mode: Transição 100% analógica em vez da quebra agressiva de 0.2
          const offsetW = GAME_WIDTH * 0.25;
          const offsetH = GAME_HEIGHT * 0.25;
          
          const cosA = Math.cos(camAngleRef.current);
          const sinA = Math.sin(camAngleRef.current);
          
          quadScreenOffsetX = -cosA * offsetW;
          quadScreenOffsetY = -sinA * offsetH;
      }
      
      if (!cameraRef.current) cameraRef.current = { x: targetCamX, y: targetCamY, scale: 0.08 };
      
      // Smooth fluid tracking for car target (World Base) - Tensionado de 0.08 para 0.30 para acompanhar velocidades F1 sem deixar o carro chegar à borda!
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.30;
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.30;
      cameraRef.current.scale += (targetScale - cameraRef.current.scale) * 0.02;

      // Smooth pan for the Screen Offset (Viewport Base)
      const panSpeed = cameraModeRef.current === 'DYNAMIC' ? 0.05 : 0.015;
      quadOffsetRef.current.x += (quadScreenOffsetX - quadOffsetRef.current.x) * panSpeed;
      quadOffsetRef.current.y += (quadScreenOffsetY - quadOffsetRef.current.y) * panSpeed;

      // SUPER AGGRESSIVE HARD RESET
      // Fallback natively to setTransform(1,0,0,1,0,0) in case resetTransform fails silently in React Canvas wrappers
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      // FORCE CLEAR THE PIXEL BUFFER (Unlocks corrupted Alpha Premultiplications that make fillRect invisible)
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#315722'; // Fallback grass shade base harmonizado
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.save();

      // Blindagem Sub-Pixel Math.round(): Impede que translações a 0.001 pixels criem Anti-Aliasing no ecrã = Jitter Visual Zero!
      ctx.translate(Math.round(GAME_WIDTH/2 + quadOffsetRef.current.x), Math.round(GAME_HEIGHT/2 + quadOffsetRef.current.y));
      ctx.scale(cameraRef.current.scale, cameraRef.current.scale);
      ctx.translate(Math.round(-cameraRef.current.x), Math.round(-cameraRef.current.y));

      // Draw map mathematically in real-time, preventing DOM memory limits on ultra-large splines
      drawTrack(ctx, spline, pitSpline, false);
      
      // Draw cached procedural environments geometry 
      drawEnvironments(ctx, spline, pitSpline, false);

      // Render persistent skid marks onto the asphalt before the cars are drawn
      ctx.fillStyle = 'rgba(10, 10, 10, 0.5)';
      skidMarksRef.current.forEach(sm => {
         ctx.save();
         ctx.translate(sm.x, sm.y);
         ctx.rotate(sm.a);
         ctx.fillRect(-sm.w/2, -5, sm.w, 10);
         ctx.restore();
      });

      // Draw "Under-Bridge" or Ground Cars (Level 0)
      carsRef.current.forEach(car => {
        const cNode = spline[car.currentWaypoint % spline.length];
        if (cNode?.isBridge) return; // Vai ser desenhado DEPOIS da Ponte!
          
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        ctx.scale(1.5, 1.5); // F1 visual scale
        drawF1Car(ctx, car.color, car.color2 || '#222', car.helmetColor || '#FFDD00', car.drsEnabled);
        ctx.restore();
      });

      // Z-INDEX LEVEL 1: OVERPASS BRIDGES (Obscures anything underneath!)
      drawBridges3D(ctx, spline);

      // Draw "Top-Bridge" Cars (Level 1)
      carsRef.current.forEach(car => {
        const cNode = spline[car.currentWaypoint % spline.length];
        if (!cNode?.isBridge) return; // Já foi desenhado debaixo da ponte
          
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        ctx.scale(1.5, 1.5);
        drawF1Car(ctx, car.color, car.color2 || '#222', car.helmetColor || '#FFDD00', car.drsEnabled);
        ctx.restore();
      });

      // Restore main canvas camera matrix!
      ctx.restore();

      // ==========================================
      // EXTERNAL HUD CANVAS UPDATES
      // ==========================================

      // Painel de F1 (Velocímetro, Saúde do Motor e Pneus) ao centro em baixo
      const speedKmH = Math.min(999, Math.ceil(speed * 0.36)); 
      const engineHealth = Math.floor(100 - mainCar.damage);
      const tireHealth = (mainCar.tireHealth !== undefined ? mainCar.tireHealth : 100).toFixed(1);
      
      const hudX = GAME_WIDTH / 2;
      const hudY = GAME_HEIGHT - 80;

      // Caixa HUD Preta de fundo (Alargada para não cortar as Margens do % nos Pneus!)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(hudX - 290, hudY, 580, 60);
      
      // --- VELOCÍMETRO ---
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(hudX - 270, hudY + 10, 85, 40);
      
      ctx.font = '900 36px monospace';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right';
      ctx.fillText(`${speedKmH.toString().padStart(3, '0')}`, hudX - 190, hudY + 41);
      
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText("KM/H", hudX - 180, hudY + 38);

      // --- ENGINE HEALTH (%) ---
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#AAAAAA';
      ctx.textAlign = 'right';
      ctx.fillText("MOTOR", hudX - 10, hudY + 38);

      ctx.font = '900 36px monospace';
      ctx.fillStyle = engineHealth < 20 ? '#FF0000' : (engineHealth < 50 ? '#FFD700' : '#00FF00');
      ctx.textAlign = 'left';
      ctx.fillText(`${engineHealth}%`, hudX, hudY + 41);

      // --- TIRE HEALTH (%) ---
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#AAAAAA';
      ctx.textAlign = 'right';
      ctx.fillText("PNEUS", hudX + 150, hudY + 38);

      ctx.font = '900 36px monospace';
      const parsedTire = parseFloat(tireHealth);
      ctx.fillStyle = parsedTire < 40 ? '#FF0000' : (parsedTire < 70 ? '#FFD700' : '#00FF00');
      ctx.textAlign = 'left';
      ctx.fillText(`${tireHealth}%`, hudX + 160, hudY + 41);

      if ((window as any).lastCrash) {
         ctx.fillStyle = '#FF0000';
         ctx.font = 'bold 24px monospace';
         ctx.textAlign = 'left';
         ctx.fillText("ENGINE CRASH: " + (window as any).lastCrash.substring(0, 150), 100, 200);
      }

      // Start Lights
      if (startSequence > 0 && startSequence < 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(GAME_WIDTH/2 - 80, 50, 160, 60);
        for(let i=0; i<3; i++) {
          ctx.beginPath();
          ctx.arc(GAME_WIDTH/2 - 40 + i*40, 80, 15, 0, Math.PI*2);
          ctx.fillStyle = startSequence > i ? (i===2 ? '#00FF00' : '#FF0000') : '#333';
          ctx.fill();
        }
      }

      // Update HUD DOM dynamically
      players.filter(p => !p.isBot).forEach(p => {
         const car = carsRef.current.find(c => c.id === p.id);
         if (!car) return;
         const timeEl = document.getElementById(`hud-time-${car.id}`);
         if (timeEl) {
            const currentLapTime = Date.now() - (car.currentLapStartTime || startTimeRef.current || Date.now());
            timeEl.innerText = formatTime(currentLapTime);
         }
         const lapEl = document.getElementById(`hud-lap-${car.id}`);
         if (lapEl) {
            lapEl.innerText = `${Math.max(1, car.laps + 1)}/${totalLaps}`;
         }
      });
      
      const mapW = mapBounds.maxX - mapBounds.minX;
      const mapH = mapBounds.maxY - mapBounds.minY;
      carsRef.current.forEach(c => {
          const dot = document.getElementById(`minimap-dot-${c.id}`);
          if (dot) {
              const px = ((c.x - mapBounds.minX) / mapW) * 100;
              const py = ((c.y - mapBounds.minY) / mapH) * 100;
              dot.style.left = `${px}%`;
              dot.style.top = `${py}%`;
          }
      });

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [raceFinished, startSequence, spline]);

  // Remove dynamic resizer to lock resolution scale physically.
  useEffect(() => {
     // intentionally left blank to wipe old window binding.
  }, []);

  return (
    <div className="w-full h-full absolute inset-0 bg-[#15151e] overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full z-0 block ${isSetupPhase ? 'blur-md opacity-60' : ''}`}
      />
      
      {isSetupPhase && (
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-[#111116]/80 backdrop-blur-md animate-in fade-in duration-500 overflow-y-auto">
            <h1 className="text-5xl md:text-7xl text-white font-black italic uppercase tracking-tighter mb-2 text-center drop-shadow-2xl mt-12">
               PARC FERMÉ
            </h1>
            <p className="text-[#E10600] font-bold tracking-widest uppercase mb-6">Afinação Aerodinâmica de Corrida</p>
            
            <div className="flex flex-col xl:flex-row gap-8 w-full max-w-7xl mx-auto items-start mb-12">
               
               {/* LEFT SIDE: Track Info */}
               <div className="w-full xl:w-5/12 flex flex-col gap-4">
                  {/* Track Preview & Name */}
                  <div className="w-full rounded-xl border-2 border-gray-800 shadow-2xl overflow-hidden relative bg-[#15151e]">
                     <div className="absolute top-4 left-6 z-10 pointer-events-none">
                       <h2 className="text-3xl md:text-4xl text-white font-black italic uppercase tracking-tighter drop-shadow-lg">{track?.name || "PISTA OFICIAL"}</h2>
                       <p className="text-gray-400 text-[10px] font-bold tracking-widest uppercase mt-1">Traçado Físico</p>
                     </div>
                     <div className="h-[240px] md:h-[300px] w-full">
                       <TrackPreview track={track} />
                     </div>
                  </div>

                  {/* Track Telemetry HUD */}
                  <div className="w-full bg-[#111116]/90 rounded-xl p-4 grid grid-cols-4 gap-x-2 text-center text-white border-2 border-gray-800 shadow-2xl">
                    {(() => {
                       const telemetry = getTrackTelemetry(spline);
                       return (
                         <>
                            <div className="flex flex-col justify-center">
                               <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Extensão</span>
                               <span className="block text-xl font-black leading-none">{telemetry.lengthKm} <span className="text-[10px] text-gray-400">KM</span></span>
                            </div>
                            <div className="border-l border-gray-800 flex flex-col justify-center">
                               <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Curvas</span>
                               <span className="block text-xl font-black leading-none">{telemetry.corners}</span>
                            </div>
                            <div className="border-l border-gray-800 flex flex-col justify-center">
                               <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Top Speed</span>
                               <span className="block text-xl font-black text-[#E10600] leading-none">{telemetry.topSpeedKmh} <span className="text-[10px] text-gray-400">KM/H</span></span>
                            </div>
                            <div className="border-l border-gray-800 flex flex-col justify-center">
                               <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Min Apex</span>
                               <span className="block text-xl font-black text-yellow-500 leading-none">{telemetry.minCornerKmh} <span className="text-[10px] text-gray-400">KM/H</span></span>
                            </div>
                         </>
                       )
                    })()}
                  </div>
               </div>

               {/* RIGHT SIDE: Players Setups */}
               <div className="w-full xl:w-7/12 flex flex-col gap-6">
                  {/* Remote players: read-only waiting card */}
                   {players.filter(p => !p.isBot && !p.isLocal).map(p => (
                      <div key={p.id} className="bg-[#15151e] border-t-4 border-gray-700 rounded-xl p-4 shadow-xl w-full opacity-70">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div>
                          <div className="flex-1">
                            <div className="text-base font-black text-gray-400 uppercase tracking-tighter leading-none">{p.driverName}</div>
                            <div className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">A configurar setup...</div>
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500 border border-yellow-800 bg-yellow-900/20 px-2 py-1 rounded">⏳ AGUARDAR</div>
                        </div>
                      </div>
                   ))}
                   {/* Local player: full editable setup card */}
                   {players.filter(p => !p.isBot && p.isLocal).map(p => (
                     <div key={p.id} className="bg-[#15151e] border-t-4 border-[#E10600] rounded-xl p-6 shadow-2xl w-full">
                     <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div>
                        <div>
                           <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-none">{p.driverName}</h3>
                           <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{p.teamName}</span>
                        </div>
                     </div>
                     
                     <div className="w-full bg-[#111116] rounded-lg p-6 border border-gray-800 relative shadow-inner">
                        {(() => {
                           const currentSpeed = playerSetups[p.id] || 260;
                           const currentSetup = getSetupFromSpeed(currentSpeed);
                           
                           // Setup Descriptor
                           let setupName = 'BALANCED';
                           let setupColor = 'text-white';
                           if (currentSpeed >= 320) { setupName = 'FULL SPEED (MONZA)'; setupColor = 'text-blue-400'; }
                           else if (currentSpeed <= 200) { setupName = 'FULL CURVE (MÓNACO)'; setupColor = 'text-[#E10600]'; }
                           
                           return (
                             <>
                               {/* HUD Data */}
                               <div className="flex justify-between items-end mb-8 pt-2">
                                  <div>
                                     <span className={`block text-2xl font-black italic tracking-tighter ${setupColor}`}>{setupName}</span>
                                     <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Configuração de Asas Ativa</span>
                                  </div>
                                  <div className="text-right">
                                     <span className="block text-4xl font-black text-white leading-none tracking-tighter">{currentSpeed}<span className="text-sm text-gray-400 ml-1 tracking-widest">KM/H</span></span>
                                     <span className="block text-[10px] text-[#E10600] font-bold uppercase tracking-widest mt-1">Velocidade Máxima Estimada</span>
                                  </div>
                               </div>

                               {/* Dynamic Slider */}
                               <div className="relative w-full h-10 flex items-center mb-8">
                                  <div className="absolute inset-0 top-1/2 -mt-1 h-2 rounded-full overflow-hidden flex shadow-inner">
                                     <div className="h-full bg-gradient-to-r from-[#E10600] via-white to-blue-500 w-full"></div>
                                  </div>
                                  
                                  <input 
                                    type="range" 
                                    min="160" max="360" step="10"
                                    value={currentSpeed}
                                    onChange={(e) => setPlayerSetups(prev => ({ ...prev, [p.id]: parseInt(e.target.value) }))}
                                    className="w-full absolute inset-0 opacity-0 cursor-pointer z-20"
                                  />
                                  
                                  {/* Custom Thumb Visualizer */}
                                  <div 
                                    className="absolute w-6 h-6 bg-white border-2 border-black rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10 pointer-events-none transition-all duration-75"
                                    style={{ left: `calc(${((currentSpeed - 160) / 200) * 100}% - 12px)` }}
                                  ></div>
                               </div>

                               <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-6">
                                  <div className="bg-[#15151e] p-3 rounded flex flex-col items-center">
                                     <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Downforce (Grip Lateral)</span>
                                     <span className={`text-lg font-black ${currentSetup.gripMultiplier > 1.3 ? 'text-[#E10600]' : (currentSetup.gripMultiplier < 1.1 ? 'text-blue-500' : 'text-white')}`}>
                                        +{Math.round((currentSetup.gripMultiplier - 1.0) * 100)}%
                                     </span>
                                  </div>
                                  <div className="bg-[#15151e] p-3 rounded flex flex-col items-center">
                                     <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Arrasto (Drag Aero)</span>
                                     <span className={`text-lg font-black ${currentSetup.dragMultiplier > 1.2 ? 'text-yellow-500' : (currentSetup.dragMultiplier < 0.9 ? 'text-green-500' : 'text-gray-400')}`}>
                                        {(currentSetup.dragMultiplier * 100).toFixed(0)}% Nível Base
                                     </span>
                                  </div>
                               </div>
                             </>
                           );
                        })()}
                     </div>
                  </div>
               ))}
            </div>
          </div>

          {(() => {
            const isMultiRace = players.filter(p => !p.isBot && !p.isLocal).length > 0;
            if (localSetupReady) {
              return (
                <div className="px-12 py-5 bg-gray-800 text-gray-400 font-black text-2xl tracking-tighter italic rounded flex items-center gap-4 animate-pulse">
                  <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10"/></svg>
                  A AGUARDAR ADVERSÁRIO...
                </div>
              );
            }
            return (
              <button
                onClick={() => {
                  if (isMultiRace) {
                    // Multiplayer: signal ready, wait for all_setup_ready from server
                    setLocalSetupReady(true);
                    socket.emit('setup_ready');
                  } else {
                    // Solo: start immediately
                    setIsSetupPhase(false);
                    setStartSequence(1);
                    setForceRender(Date.now());
                  }
                }}
                className="px-12 py-5 bg-green-600 hover:bg-green-500 text-white font-black text-3xl tracking-tighter italic transition-colors rounded shadow-[0_0_40px_rgba(22,163,74,0.4)] flex items-center group"
              >
                IR PARA A PISTA
                <svg className="w-8 h-8 ml-3 transform group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            );
          })()}
         </div>
      )}
      
      {/* Global Fastest Lap Popup HUD */}
      {fastLapPopup && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 right-8 z-50 flex flex-col items-end drop-shadow-2xl animate-pulse">
            <div className="bg-black/90 backdrop-blur-md px-8 py-3 border-t-4 flex flex-col items-center justify-center gap-1" style={{borderColor: fastLapPopup.color, boxShadow: `0 0 30px ${fastLapPopup.color}66`}}>
               <span className="text-xl font-bold tracking-widest uppercase" style={{color: fastLapPopup.color}}>{fastLapPopup.isInitial ? 'TEMPO DE REFERÊNCIA' : 'NOVA VOLTA RÁPIDA!'}</span>
               <span className="text-5xl font-black italic tracking-tighter text-white" style={{textShadow: `0 0 15px ${fastLapPopup.color}`}}>{fastLapPopup.time}</span>
            </div>
            <div className="text-black px-12 py-2 w-full text-center border-b-8 border-black font-black flex justify-center items-center" style={{backgroundColor: fastLapPopup.color}}>
               <span className="text-2xl tracking-widest uppercase">{fastLapPopup.name}</span>
            </div>
         </div>
      )}
      
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 left-0 flex flex-col gap-2 z-10 pointer-events-none">
            {players.filter(p => !p.isBot).map(p => {
               const car = carsRef.current.find(c => c.id === p.id);
               if (!car) return null;
               
               return (
                 <div key={p.id} className="bg-black/80 border-l-4 p-3 rounded-r-xl w-64 shadow-2xl flex flex-col backdrop-blur-md" style={{borderColor: p.color}}>
                    <span className="text-white font-black text-xl italic tracking-tighter uppercase">{p.driverName || 'P'+p.id}</span>
                    <div className="flex justify-between items-end mt-1">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Tempo <span id={`hud-time-${p.id}`} className="text-yellow-400 font-mono text-base ml-1">00:00.00</span></span>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">L<span id={`hud-lap-${p.id}`} className="text-white font-black text-base ml-1">1/{totalLaps}</span></span>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
                         <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest flex flex-col">
                            Última <span id={`hud-last-${p.id}`} className="font-mono text-white text-xs">--:--.--</span>
                         </span>
                         <span className="text-[9px] text-[#E10600] font-bold uppercase tracking-widest flex flex-col text-right">
                            Melhor <span id={`hud-best-${p.id}`} className="font-mono text-white text-xs">--:--.--</span>
                         </span>
                    </div>
                 </div>
               );
            })}
         </div>
      )}

      {/* Live TV Standings HUD */}
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute top-20 left-4 flex flex-col gap-1 z-10 w-48">
            {liveStandings.map((carId, idx) => {
               const p = players.find(x => x.id === carId);
               if (!p) return null;
               return (
                  <div key={carId} className="flex items-center bg-black/80 backdrop-blur-md rounded border-l-4 overflow-hidden shadow-md transition-all duration-300" style={{borderColor: p.color}}>
                     <span className="w-8 text-center text-white font-black text-sm bg-gray-900 py-1 border-r border-gray-800">{idx + 1}</span>
                     <span className="flex-1 text-white font-bold text-xs pl-3 uppercase tracking-widest truncate">{p.driverName || 'BOT'}{p.isBot ? '*' : ''}</span>
                  </div>
               );
            })}
         </div>
      )}

      {/* Track Minimap HUD */}
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 right-8 w-48 h-48 bg-black/60 shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md border-2 border-gray-800 rounded-2xl p-4 z-10 overflow-hidden">
            <svg viewBox={`${mapBounds.minX} ${mapBounds.minY} ${mapBounds.maxX - mapBounds.minX} ${mapBounds.maxY - mapBounds.minY}`} className="w-full h-full opacity-50 drop-shadow-lg">
               <polygon points={spline.map(pt => `${pt[0]},${pt[1]}`).join(' ')} fill="none" stroke="#FFFFFF" strokeWidth={(mapBounds.maxX - mapBounds.minX) * 0.02} strokeLinejoin="round" />
               {rawTrack.pitNodes && rawTrack.pitNodes.length > 0 && (
                  <polyline points={rawTrack.pitNodes.map(pt => `${pt[0]},${pt[1]}`).join(' ')} fill="none" stroke="#AAAAAA" strokeWidth={(mapBounds.maxX - mapBounds.minX) * 0.015} strokeLinejoin="round" strokeDasharray="5,5" />
               )}
            </svg>
            {players.map(p => (
               <div key={`dot-${p.id}`} id={`minimap-dot-${p.id}`} className="absolute w-3 h-3 rounded-full transform -translate-x-1.5 -translate-y-1.5 shadow-[0_0_8px_rgba(0,0,0,1)] transition-all duration-75 z-20" style={{backgroundColor: p.color, border: '1px solid white', left: '50%', top: '50%'}}></div>
            ))}
         </div>
      )}

      {/* HUD Control Hints List */}
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (() => {
         const p = players.find(player => !player.isBot);
         if (!p) return null;
         
         // Fix ts undefined fallback explicitly
         const fmtKey = (k?: string, def: string = '') => (k || def).replace('Key', '').replace('Arrow', '');
         const KeyCap = ({ k, color = 'text-black' }: { k: string, color?: string }) => (
            <kbd className={`bg-white ${color} px-1.5 py-0.5 rounded shadow-[0_1px_0_#ccc] font-black mx-0.5`}>{k}</kbd>
         );
         
         return (
            <div className="absolute top-16 right-4 z-10 flex flex-col items-end gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
               <span className="text-[9.5px] text-white font-mono bg-black/60 px-2.5 py-1 rounded inline-flex items-center border border-gray-800">
                  <span className="text-gray-400 mr-2">ACEL/TRAV:</span> 
                  <KeyCap k={fmtKey(p.controls?.up, 'Up')} /> 
                  <span className="mx-1 text-gray-500">/</span> 
                  <KeyCap k={fmtKey(p.controls?.down, 'Down')} />
               </span>
               <span className="text-[9.5px] text-white font-mono bg-black/60 px-2.5 py-1 rounded inline-flex items-center border border-gray-800">
                  <span className="text-gray-400 mr-2">DIREÇÃO:</span> 
                  <KeyCap k={fmtKey(p.controls?.left, 'Left')} /> 
                  <span className="mx-1 text-gray-500">/</span> 
                  <KeyCap k={fmtKey(p.controls?.right, 'Right')} />
               </span>
               <div className="text-[9.5px] text-white font-mono bg-black/60 px-2.5 py-1 rounded mt-1 flex items-center border border-gray-800">
                  <span className="text-gray-400 mr-2">CÂMARA:</span>
                  <KeyCap k={fmtKey(p.controls?.camera, 'C')} color="text-[#E10600]" />
                  <span className="text-gray-300 ml-2">{cameraModeUI === 'CENTRAL' ? 'CLÁSSICA CENTRAL' : (cameraModeUI === 'DYNAMIC' ? 'DINÂMICA' : 'QUADRANTES')}</span>
               </div>
            </div>
         );
      })()}
      
      {!raceFinished && (
        <button onClick={() => onBackToMenu([], 'quit')} className="fixed top-4 right-4 bg-red-600 text-white font-bold px-4 py-2 hover:bg-red-700 z-50 rounded-lg shadow-lg text-sm tracking-wider uppercase">
          DESISTIR
        </button>
      )}
      
      {raceFinished && (() => {
        const finishedCars = carsRef.current.filter(c => c.finishTime && c.finishTime !== Infinity);
        finishedCars.sort((a,b) => a.finishTime! - b.finishTime!);

        const unfinishedCars = carsRef.current.filter(c => !c.finishTime || c.finishTime === Infinity);
        unfinishedCars.sort((a,b) => {
             const scoreA = (a.laps * 100000) + a.currentWaypoint;
             const scoreB = (b.laps * 100000) + b.currentWaypoint;
             return scoreB - scoreA;
        });

        const sortedCars = [...finishedCars, ...unfinishedCars];
        const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
        
        let fastestLapCarId = -1;
        let fastestLapTime = Infinity;
        sortedCars.forEach(c => {
           if (c.bestLapTime && c.bestLapTime > 0 && c.bestLapTime < fastestLapTime) {
               fastestLapTime = c.bestLapTime;
               fastestLapCarId = c.id;
           }
        });

        const compiledResults: RaceResultEntry[] = sortedCars.map((c, i) => {
           const pDetails = players.find(p => p.id === c.id);
           const name = pDetails?.driverName || (c.isBot ? 'BOT AI' : `P${c.id}`);
           const isFinished = c.finishTime && c.finishTime !== Infinity;
           
           // Assign points even if DNF! (Fair distribution of surviving bots based on their ordered rank)
           const basePoints = (i < 10) ? F1_POINTS[i] : 0;
           
           const isFastestLap = (c.id === fastestLapCarId);
           const extraPoint = (isFastestLap && i < 10) ? 1 : 0; // Top 10 gets FL point
           const totalPoints = basePoints + extraPoint;
           const previousChampionshipPoints = championshipStandings[c.id] || 0;

           return {
              playerId: c.id,
              position: i + 1,
              driverName: name,
              teamName: pDetails?.teamName || 'Equipa Independente',
              color: c.color,
              color2: c.color2,
              totalTimeMs: isFinished ? c.finishTime! : null,
              bestLapMs: (c.bestLapTime && c.bestLapTime !== Infinity) ? c.bestLapTime : null,
              pointsEarned: totalPoints,
              totalChampionshipPoints: previousChampionshipPoints + totalPoints
           };
        });

        return (
           <RaceResults 
              results={compiledResults}
              isHost={isHost}
              hasNextTrack={hasNextTrack}
              onNextTrack={() => onBackToMenu(compiledResults, 'next')}
              onFinishEvent={() => onBackToMenu(compiledResults, 'finish')}
           />
        );
      })()}
    </div>
  );
}
