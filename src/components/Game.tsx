import React, { useEffect, useRef, useState } from 'react';
import { PlayerConfig, getSetupFromSpeed } from '../types';
import { TrackDef, computeSpline, getTrackTelemetry } from '../tracks';
import { audio } from '../audio';
import { updateCarPhysics, CarPhysics } from '../physics';
import { drawTrack, drawEnvironments, drawF1Car, drawBridges3D } from '../renderer';

interface GameProps {
  key?: React.Key;
  players: PlayerConfig[];
  track: TrackDef;
  totalLaps: number;
  onBackToMenu: (results?: { playerId: number, position: number, driverName: string }[]) => void;
}

let GAME_WIDTH = 1280;
let GAME_HEIGHT = 720;

export default function Game({ players, track, totalLaps, onBackToMenu }: GameProps) {
  const [isSetupPhase, setIsSetupPhase] = useState(true);
  const [playerSetups, setPlayerSetups] = useState<Record<number, number>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudLeftRef = useRef<HTMLCanvasElement>(null);
  const hudRightRef = useRef<HTMLCanvasElement>(null);

  const [raceFinished, setRaceFinished] = useState(false);
  const [startSequence, setStartSequence] = useState(isSetupPhase ? 0 : 1); 
  const [, setForceRender] = useState(0);
  const [cameraModeUI, setCameraModeUI] = useState<'CENTRAL' | 'DYNAMIC' | 'QUADRANTS'>('CENTRAL');
  
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
  
  const rawTrack = track;
  const spline = React.useMemo(() => rawTrack.nodes, [rawTrack]);

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
        isBot: p.isBot || false,
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

          // 1. Find Closest Spline Node with Temporal Coherence (Supports 3D Bridges!)
          let minSplineDistSq = Infinity;
          let closestIndex = car.currentWaypoint;
          
          let searchRange = spline.length; 
          if (car.currentWaypoint > 0) {
             // Ao limitar a pesquisa aos 400 nós mais próximos do carro (8.000 pixels de pista),
             // garantimos que quando o carro passa debaixo de uma ponte, ele NÃO faz "snap" matemático
             // para o nó da ponte lá em cima (que pode estar milissegundos mais perto fisicamente mas a léguas de distância na Corrida!).
             searchRange = 400; 
          }

          for (let s = 0; s <= searchRange * 2; s++) {
             let i = (car.currentWaypoint - searchRange + s + spline.length) % spline.length;
             if (searchRange === spline.length && s >= spline.length) break;
             
             const distSq = (car.x - spline[i].x)**2 + (car.y - spline[i].y)**2;
             if (distSq < minSplineDistSq) {
               minSplineDistSq = distSq;
               closestIndex = i;
             }
          }
          
          const closestNode = spline[closestIndex];
          const distToCenter = Math.sqrt(minSplineDistSq);
          const trackWidth = closestNode.width;
          
          // 2. Identify Pit Lane Proximity
          let pitDistToCenter = Infinity;
          let closestPitIndex = -1;
          if (pitSpline) {
            for (let i = 0; i < pitSpline.length; i++) {
              const pDistSq = (car.x - pitSpline[i].x)**2 + (car.y - pitSpline[i].y)**2;
              if (pDistSq < pitDistToCenter) {
                 pitDistToCenter = pDistSq;
                 closestPitIndex = i;
              }
            }
          }
          pitDistToCenter = Math.sqrt(pitDistToCenter);

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
             let resolveNode = closestNode;
             let resolveDist = distToCenter;
             let resolveRadius = mainWallRadius;
             
             if (pitSpline && (pitDistToCenter - pitWallRadius) < (distToCenter - mainWallRadius)) {
                 resolveNode = pitSpline[closestPitIndex];
                 resolveDist = Math.max(0.1, pitDistToCenter); // Prevent division by zero
                 resolveRadius = pitWallRadius;
             } else {
                 resolveDist = Math.max(0.1, distToCenter);
             }
             
             // Push car back inside the boundary
             const nx = (car.x - resolveNode.x) / resolveDist;
             const ny = (car.y - resolveNode.y) / resolveDist;
             car.x = resolveNode.x + nx * (resolveRadius - 10);
             car.y = resolveNode.y + ny * (resolveRadius - 10);
             
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
          } else {
            // Human (Com Ajudas de Condução F1 - "Assists")
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

          // Apply Physics
          updateCarPhysics(car, dt, surface);
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
             if (car.currentLapStartTime) {
                const lapTime = now - car.currentLapStartTime;
                car.lastLapTime = lapTime;
                if (!car.bestLapTime || lapTime < car.bestLapTime) car.bestLapTime = lapTime;
                
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

      const mainCar = carsRef.current.find(c => !c.isBot) || carsRef.current[0];
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
        drawF1Car(ctx, car.color, car.color2 || '#222', car.drsEnabled);
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
        drawF1Car(ctx, car.color, car.color2 || '#222', car.drsEnabled);
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
            
            {/* Track Telemetry HUD */}
            <div className="w-full max-w-2xl bg-[#111116]/90 rounded-xl p-4 grid grid-cols-4 gap-x-2 text-center text-white border-2 border-gray-800 shadow-2xl mb-10">
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
                         <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Top Speed Estimada</span>
                         <span className="block text-xl font-black text-[#E10600] leading-none">{telemetry.topSpeedKmh} <span className="text-[10px] text-gray-400">KM/H</span></span>
                      </div>
                      <div className="border-l border-gray-800 flex flex-col justify-center">
                         <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Min Apex (Ganchos)</span>
                         <span className="block text-xl font-black text-yellow-500 leading-none">{telemetry.minCornerKmh} <span className="text-[10px] text-gray-400">KM/H</span></span>
                      </div>
                   </>
                 )
              })()}
            </div>

            <div className="flex flex-col items-center justify-center gap-8 mb-12 w-full max-w-6xl mx-auto">
               {players.filter(p => !p.isBot).map(p => (
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

            <button 
               onClick={() => {
                  setIsSetupPhase(false);
                  setStartSequence(1);
                  // Force a re-render frame reset to clear any blurred canvas artifacts
                  setForceRender(Date.now());
               }}
               className="px-12 py-5 bg-green-600 hover:bg-green-500 text-white font-black text-3xl tracking-tighter italic transition-colors rounded shadow-[0_0_40px_rgba(22,163,74,0.4)] flex items-center group"
            >
               IR PARA A PISTA
               <svg className="w-8 h-8 ml-3 transform group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            </button>
         </div>
      )}
      
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
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

      {/* Camera Mode Indicator HUD */}
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-gray-800 flex items-center gap-3">
             <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">TECLA '{players.find(p => !p.isBot)?.controls?.camera?.replace('Key', '')?.replace('Arrow', '') || 'C'}' CÂMARA:</span>
             <span className={`text-[10px] font-black uppercase tracking-widest ${cameraModeUI === 'CENTRAL' ? 'text-white' : (cameraModeUI === 'DYNAMIC' ? 'text-[#39FF14]' : 'text-yellow-400')}`}>
                 {cameraModeUI === 'CENTRAL' ? 'CLÁSSICA CENTRAL' : (cameraModeUI === 'DYNAMIC' ? 'DINÂMICA (ANTECIPAÇÃO)' : 'MODO QUADRANTES OBTUSOS')}
             </span>
         </div>
      )}
      
      {!raceFinished && (
        <button onClick={onBackToMenu} className="fixed top-4 right-4 bg-red-600 text-white font-bold px-4 py-2 hover:bg-red-700 z-50 rounded-lg shadow-lg text-sm tracking-wider uppercase">
          DESISTIR
        </button>
      )}
      
      {raceFinished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <h1 className="text-5xl mb-8 text-white font-black italic">CLASSIFICAÇÃO</h1>
          <div className="bg-[#15151e] border-l-4 border-[#E10600] p-8 mb-8 w-full max-w-2xl">
            {carsRef.current.sort((a,b) => (a.finishTime || Infinity) - (b.finishTime || Infinity)).map((c, i) => {
              const pDetails = players.find(p => p.id === c.id);
              const name = pDetails?.driverName ? pDetails.driverName : (c.isBot ? 'BOT AI' : `P${c.id}`);
              return (
              <div key={c.id} className="flex justify-between mb-2 text-xl font-black uppercase" style={{color: c.color}}>
                <span>{i+1}º - {name}</span>
                <span className="font-mono">{c.finishTime && c.finishTime !== Infinity ? formatTime(c.finishTime) : 'DNF'}</span>
              </div>
            )})}
          </div>
          <button 
             onClick={() => {
                const results = carsRef.current.sort((a,b) => (a.finishTime || Infinity) - (b.finishTime || Infinity)).map((c, idx) => {
                   const pDetails = players.find(p => p.id === c.id);
                   return {
                      playerId: c.id,
                      position: idx + 1,
                      driverName: pDetails?.driverName || (c.isBot ? 'BOT AI' : `P${c.id}`)
                   };
                });
                onBackToMenu(results);
             }} 
             className="px-8 py-4 bg-white text-black font-bold uppercase tracking-widest rounded transition hover:bg-gray-300"
          >
             CONTINUAR
          </button>
        </div>
      )}
    </div>
  );
}
