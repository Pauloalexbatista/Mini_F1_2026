import React, { useEffect, useRef, useState } from 'react';
import { PlayerConfig, CarSetupType, SETUP_CONFIGS } from '../types';
import { TRACKS, computeSpline, getTrackTelemetry } from '../tracks';
import { audio } from '../audio';
import { updateCarPhysics, CarPhysics } from '../physics';
import { drawTrack, drawEnvironments, drawF1Car } from '../renderer';

interface GameProps {
  players: PlayerConfig[];
  trackId: string;
  totalLaps: number;
  onBackToMenu: () => void;
}

const SETUP_CARDS = [
  { id: 'LOW_DF' as CarSetupType, name: 'FULL SPEED', speed: '360 KM/H', grip: 'Normal', color: 'border-blue-500', desc: 'Aero Mínima. Feito para voar nas retas longas mas um diabo para curvar a alta velocidade.' },
  { id: 'BALANCED' as CarSetupType, name: 'BALANCED', speed: '260 KM/H', grip: 'Aumentado', color: 'border-white', desc: 'O Setup Standard Misto. Balanço matemático entre velocidade de ponta e agressividade em curva.' },
  { id: 'HIGH_DF' as CarSetupType, name: 'FULL CURVE', speed: '160 KM/H', grip: 'Extremo', color: 'border-[#E10600]', desc: 'Asas no ângulo máximo (+60% Downforce Lateral). Devora ganchos fechados sem pisar o travão.' }
];

let GAME_WIDTH = 1280;
let GAME_HEIGHT = 720;

export default function Game({ players, trackId, totalLaps, onBackToMenu }: GameProps) {
  const [isSetupPhase, setIsSetupPhase] = useState(true);
  const [playerSetups, setPlayerSetups] = useState<Record<number, CarSetupType>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudLeftRef = useRef<HTMLCanvasElement>(null);
  const hudRightRef = useRef<HTMLCanvasElement>(null);

  const [raceFinished, setRaceFinished] = useState(false);
  const [startSequence, setStartSequence] = useState(0); 
  const [, setForceRender] = useState(0);
  
  const carsRef = useRef<CarPhysics[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const startTimeRef = useRef<number>(0);
  const firstFinishTimeRef = useRef<number | null>(null);
  const cameraRef = useRef<{x: number, y: number, scale: number} | null>(null);
  const skidMarksRef = useRef<{x: number, y: number, a: number, w: number}[]>([]);
  
  const rawTrack = TRACKS.find(t => t.id === trackId) || TRACKS[0];
  const spline = React.useMemo(() => rawTrack.nodes, [rawTrack]);

  // Init cars
  useEffect(() => {
    audio.init();
    firstFinishTimeRef.current = null;
    
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
      
      const setupKeys: CarSetupType[] = ['LOW_DF', 'BALANCED', 'HIGH_DF'];
      const botSetupChoice = setupKeys[Math.floor(Math.random() * setupKeys.length)];
      
      // Default Setup for humans if not chosen
      let finalSetup: CarSetupType = 'BALANCED';
      if (!p.isBot && playerSetups[p.id]) finalSetup = playerSetups[p.id];
      const assignedSetupProfile = p.isBot ? SETUP_CONFIGS[botSetupChoice] : SETUP_CONFIGS[finalSetup];

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
        brakingPower: 700, // Reduzido de 1200 para travar suavemente e não como um rochedo
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
  }, [players, spline]);

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
        setStartSequence(4); 
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [startSequence, isSetupPhase]);

  // Keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

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
              track_id: trackId,
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

    const pitSpline = rawTrack.pitNodes ? rawTrack.pitNodes : null;
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

          // 1. Find Closest Spline Node
          let minSplineDistSq = Infinity;
          let closestIndex = car.currentWaypoint;
          for (let i = 0; i < spline.length; i++) {
             // ANTI-TELEPORTATION MASK (Crucial for Figure-8 tracks like Suzuka!)
             // Only allow the car to snap to nodes that are structurally adjacent to its last known sequence waypoint.
             let idxDist = Math.abs(i - car.currentWaypoint);
             if (idxDist > spline.length / 2) idxDist = spline.length - idxDist; // Circular array wrap
             
             if (idxDist < 40) {
                 const distSq = (car.x - spline[i].x)**2 + (car.y - spline[i].y)**2;
                 if (distSq < minSplineDistSq) {
                   minSplineDistSq = distSq;
                   closestIndex = i;
                 }
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
             // A física agora herda a topologia estática em O(1) diretamente da Inicialização da Pista!
             let extendedTight = closestNode.isExtendedTight || false;
             let apexTight = closestNode.isApexTight || false;

             if (apexTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.7) {
                 surface = 'CURB_APEX';
             } else if (extendedTight && !apexTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.7) {
                 surface = 'CURB_WIDE';
             } else if (!extendedTight && !apexTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.6) {
                 surface = 'CURB';
             } else if (
                 (apexTight && distToCenter > trackWidth * 0.7) || 
                 (extendedTight && !apexTight && distToCenter > trackWidth * 0.7) || 
                 (!extendedTight && !apexTight && distToCenter > trackWidth * 0.6)
             ) {
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
          // Cria arrasto dinâmico nas "rodas" do carro em vez de ativar travões bruscos!
          if (surface === 'GRASS') {
             car.damage = Math.min(90, car.damage + 0.01); // Relva suja os pneus incrivelmente devagar (0.01 por tick)
             // Soltámos muito mais a relva! Em vez de te espetar a 40km/h num instante (0.94), agora escorrega suavemente (0.98)
             if (speed > car.maxSpeed * 0.4) {
                car.vx *= 0.98; car.vy *= 0.98; 
             }
          } else if (surface === 'CURB_WIDE') {
             // 20% Penalty smoothly (max 80% speed)
             if (speed > car.maxSpeed * 0.8) {
                car.vx *= 0.97; car.vy *= 0.97; 
             }
          } else if (surface === 'CURB') {
             // 10% Penalty smoothly (max 90% speed)
             if (speed > car.maxSpeed * 0.9) {
                car.vx *= 0.985; car.vy *= 0.985; 
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

          // Apply Physics
          updateCarPhysics(car, dt, surface);
          audio.updateEngine(car.id, Math.sqrt(car.vx*car.vx + car.vy*car.vy) / 1200, car.isBot);

          // Generate Persistent Skid Marks purely if Tire Degradation Physics are in Tier III / Tier IV conditions!
          if (speed > 100 && car.isSkidding) {
             skidMarksRef.current.push({ x: car.x, y: car.y, a: car.angle, w: 22 });
             if (skidMarksRef.current.length > 3000) skidMarksRef.current.shift();
          }

          // Robust Lap counting logic
          // Only increment tracking waypoint if moving forwards linearly
          if (closestIndex > car.currentWaypoint && closestIndex < car.currentWaypoint + 100) {
             car.currentWaypoint = closestIndex;
          }
          
          // Cross start line forwards
          if (closestIndex < 20 && car.currentWaypoint > spline.length * 0.8) {
             car.laps++;
             car.currentWaypoint = 0; // reset
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
        const timeoutReached = firstFinishTimeRef.current !== null && (now - firstFinishTimeRef.current > 15000);

        if (allHumansFinished || timeoutReached) {
            setRaceFinished(true);
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
      }

      if (!cameraRef.current) cameraRef.current = { x: mainCar.x, y: mainCar.y, scale: 0.08 };
      cameraRef.current.scale += (targetScale - cameraRef.current.scale) * 0.02;

      // SUPER AGGRESSIVE HARD RESET
      // Fallback natively to setTransform(1,0,0,1,0,0) in case resetTransform fails silently in React Canvas wrappers
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      // FORCE CLEAR THE PIXEL BUFFER (Unlocks corrupted Alpha Premultiplications that make fillRect invisible)
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#1A3314'; // Fallback grass shade base
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      ctx.save();
      
      const camX = mainCar.x;
      const camY = mainCar.y;
      const camScale = cameraRef.current.scale;

      ctx.translate(GAME_WIDTH/2, GAME_HEIGHT/2);
      ctx.scale(camScale, camScale);
      ctx.translate(-camX, -camY);

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

      // Draw cars
      carsRef.current.forEach(car => {
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        
        ctx.scale(1.5, 1.5); // F1 visual scale

        // Offload mathematical rendering to dedicated Engine layer
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
      const tireHealth = Math.floor(mainCar.tireHealth || 100);
      
      const hudX = GAME_WIDTH / 2;
      const hudY = GAME_HEIGHT - 80;

      // Caixa HUD Preta de fundo (Alargada para os 3 dados)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(hudX - 250, hudY, 500, 60);
      
      // --- VELOCÍMETRO ---
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(hudX - 230, hudY + 10, 85, 40);
      
      ctx.font = '900 36px monospace';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right';
      ctx.fillText(`${speedKmH.toString().padStart(3, '0')}`, hudX - 150, hudY + 41);
      
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText("KM/H", hudX - 140, hudY + 38);

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
      ctx.fillStyle = tireHealth < 40 ? '#FF0000' : (tireHealth < 70 ? '#FFD700' : '#00FF00');
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
                     
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {SETUP_CARDS.map(s => {
                           const setupType = s.id;
                           const isSelected = (playerSetups[p.id] || 'BALANCED') === setupType;
                           return (
                             <button
                               key={setupType}
                               onClick={() => setPlayerSetups(prev => ({ ...prev, [p.id]: setupType }))}
                               className={`w-full py-4 px-5 flex flex-col justify-between items-start rounded-lg border-2 transition-all font-bold tracking-widest text-left ${isSelected ? 'border-white bg-[#1a1a24] text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] transform scale-[1.02]' : 'border-gray-800 bg-black/40 text-gray-500 hover:border-gray-600'}`}
                             >
                                <div className="flex justify-between w-full items-center mb-3">
                                   <span className={`text-base font-black italic uppercase ${isSelected ? 'text-white' : ''}`}>{s.name}</span>
                                   {isSelected && <svg className="w-5 h-5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                
                                <span className={`text-[11px] mb-4 leading-relaxed normal-case font-medium ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                                   {s.desc}
                                </span>

                                <div className={`flex w-full justify-between items-center text-[10px] pt-3 border-t uppercase ${isSelected ? 'border-gray-700 text-gray-400' : 'border-gray-800 text-gray-600'}`}>
                                   <span>Top Speed: <strong className={`ml-1 ${isSelected ? 'text-[#E10600]' : ''}`}>{s.speed}</strong></span>
                                   <span className="text-right">Aderência: <strong className={`ml-1 ${isSelected ? 'text-blue-500' : ''}`}>{s.grip}</strong></span>
                                </div>
                             </button>
                           );
                        })}
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
      
      {!raceFinished && (
        <button onClick={onBackToMenu} className="fixed top-4 right-4 bg-red-600 text-white font-bold px-4 py-2 hover:bg-red-700 z-50 rounded-lg shadow-lg text-sm tracking-wider uppercase">
          DESISTIR
        </button>
      )}
      
      {raceFinished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <h1 className="text-5xl mb-8 text-white font-black italic">CLASSIFICAÇÃO</h1>
          <div className="bg-[#15151e] border-l-4 border-[#E10600] p-8 mb-8 w-full max-w-2xl">
            {carsRef.current.sort((a,b) => (a.finishTime || Infinity) - (b.finishTime || Infinity)).map((c, i) => (
              <div key={c.id} className="flex justify-between mb-2 text-xl" style={{color: c.color}}>
                <span>{i+1}º - P{c.id}</span>
                <span>{c.finishTime && c.finishTime !== Infinity ? formatTime(c.finishTime) : 'DNF'}</span>
              </div>
            ))}
          </div>
          <button onClick={onBackToMenu} className="px-8 py-4 bg-white text-black font-bold">VOLTAR AO MENU</button>
        </div>
      )}
    </div>
  );
}
