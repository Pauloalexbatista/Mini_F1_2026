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

  useEffect(() => {
      audio.init();
      return () => audio.stopAllEngines();
  }, []);

  useEffect(() => {
      if (raceFinished) {
          audio.stopAllEngines();
      }
      return () => audio.stopAllEngines();
  }, [raceFinished]);

  // Track constraints caching
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
  const spline = React.useMemo(() => rawTrack?.nodes || [], [rawTrack]);

  const mapBounds = React.useMemo(() => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      if (spline && spline.length > 0) {
        spline.forEach(({x, y}) => {
           if (x < minX) minX = x;
           if (x > maxX) maxX = x;
           if (y < minY) minY = y;
           if (y > maxY) maxY = y;
        });
      } else {
          return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
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
    
    // Safety check for empty tracks
    if (!spline || spline.length === 0) return;
    
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
      
      const botSpeed = 160 + Math.floor(Math.random() * 21) * 10;
      let finalSpeed = 260;
      if (!p.isBot && playerSetups[p.id]) finalSpeed = playerSetups[p.id];
      const assignedSetupProfile = getSetupFromSpeed(p.isBot ? botSpeed : finalSpeed);

      const spawnNode = spline[computedIndex] || { x: 0, y: 0 };
      const nextSpawnNode = spline[(computedIndex + 1) % spline.length] || { x: 1, y: 0 };
      const sAngle = Math.atan2(nextSpawnNode.y - spawnNode.y, nextSpawnNode.x - spawnNode.x);
      
      const offsetY = col === 0 ? -40 : 40;
      const rotX = -offsetY * Math.sin(sAngle);
      const rotY = offsetY * Math.cos(sAngle);

      return {
        id: p.id,
        x: (spawnNode.x || 0) + rotX,
        y: (spawnNode.y || 0) + rotY,
        vx: 0,
        vy: 0,
        angle: sAngle,
        angularVelocity: 0,
        throttle: 0,
        brake: 0,
        steer: 0,
        maxSpeed: 800 + (p.isBot ? (p.difficulty || 0.8) * 100 : 200),
        enginePower: 350 + (p.isBot ? (p.difficulty || 0.8) * 50 : 150),
        brakingPower: 400,
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
        laps: -1, 
        currentWaypoint: (computedIndex + 8) % spline.length,
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
    if (isSetupPhase) return;
    
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
        if (!token) return;
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
    
    canvasRef.current.width = window.innerWidth;
    canvasRef.current.height = window.innerHeight;
    
    let animationFrameId: number;
    let lastTime = performance.now();

    const pitSpline = (rawTrack?.pitNodes && rawTrack.pitNodes.length > 0) ? rawTrack.pitNodes : null;
    let pitEntrySplineIndex = -1;
    if (pitSpline && spline && spline.length > 0) {
      let minDist = Infinity;
      for (let i = 0; i < spline.length; i++) {
        const dSq = (spline[i].x - pitSpline[0].x)**2 + (spline[i].y - pitSpline[0].y)**2;
        if (dSq < minDist) { minDist = dSq; pitEntrySplineIndex = i; }
      }
    }

    const update = (time: number) => {
      if (!spline || spline.length === 0) return;

      let dt = (time - lastTime) / 1000;
      if (dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.016; 
      lastTime = time;
      
      const now = Date.now();

      try {
        if (startSequence >= 4) {
          carsRef.current.forEach(car => {
          if (car.finishTime !== null) return;

          // 1. Find Closest Spline Segment
          let minSplineDistSq = Infinity;
          let closestIndex = car.currentWaypoint;
          let resolveX = car.x;
          let resolveY = car.y;
          
          let searchRange = spline.length; 
          if (car.currentWaypoint > 0) searchRange = 400; 

          for (let s = 0; s <= searchRange * 2; s++) {
             let i = (car.currentWaypoint - searchRange + s + spline.length) % spline.length;
             if (searchRange === spline.length && s >= spline.length) break;
             
             let nextI = (i + 1) % spline.length;
             const p1 = spline[i];
             const p2 = spline[nextI];
             
             const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
             let t_seg = 0;
             if (l2 > 0) {
                 t_seg = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2;
                 t_seg = Math.max(0, Math.min(1, t_seg));
             }
             
             const projX = p1.x + t_seg * (p2.x - p1.x);
             const projY = p1.y + t_seg * (p2.y - p1.y);
             const distSq = (car.x - projX)**2 + (car.y - projY)**2;
             
             if (distSq < minSplineDistSq) {
               minSplineDistSq = distSq;
               closestIndex = t_seg < 0.5 ? i : nextI;
               resolveX = projX;
               resolveY = projY;
             }
          }
          
          const closestNode = spline[closestIndex] || { width: 300 };
          const distToCenter = Math.sqrt(minSplineDistSq);
          const trackWidth = closestNode.width || 300;
          
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
              let t_seg = 0;
              if (l2 > 0) {
                  t_seg = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2;
                  t_seg = Math.max(0, Math.min(1, t_seg));
              }
              const projX = p1.x + t_seg * (p2.x - p1.x);
              const projY = p1.y + t_seg * (p2.y - p1.y);
              const pDistSq = (car.x - projX)**2 + (car.y - projY)**2;
              if (pDistSq < pitDistToCenter) {
                 pitDistToCenter = pDistSq;
                 closestPitIndex = t_seg < 0.5 ? i : i+1;
                 pitResolveX = projX;
                 pitResolveY = projY;
              }
            }
            pitDistToCenter = Math.sqrt(pitDistToCenter);
          }

          let surface: 'TRACK' | 'CURB' | 'CURB_WIDE' | 'CURB_APEX' | 'GRASS' = 'TRACK';
          let isInPitLane = false;
          
          if (pitSpline && closestPitIndex >= 0 && pitDistToCenter < pitSpline[closestPitIndex].width * 0.5 && pitDistToCenter < distToCenter) {
             isInPitLane = true;
          } else {
             let extendedTight = closestNode.isExtendedTight || false;
             let apexTight = closestNode.isApexTight || false;

             if (apexTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.95) {
                 if (distToCenter > trackWidth * 0.80) surface = 'CURB_APEX';
                 else if (distToCenter > trackWidth * 0.65) surface = 'CURB_WIDE';
                 else surface = 'CURB';
             } else if (extendedTight && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.80) {
                 if (distToCenter > trackWidth * 0.65) surface = 'CURB_WIDE';
                 else surface = 'CURB';
             } else if (distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.65) {
                 surface = 'CURB';
             } else if (distToCenter > trackWidth * 0.5) {
                 surface = 'GRASS';
             }
          }

          const mainWallRadius = closestNode.maxWallRadius || (trackWidth * 1.70);
          const pitWallRadius = pitSpline && closestPitIndex >= 0 ? pitSpline[closestPitIndex].width * 0.495 : 0;
          const isOutsideMain = distToCenter > mainWallRadius - 10;
          const isOutsidePit = pitSpline ? (pitDistToCenter > pitWallRadius - 4) : true;

          if (isOutsideMain && isOutsidePit) {
             let resX = resolveX, resY = resolveY, resolveDist = distToCenter, resolveRadius = mainWallRadius;
             if (pitSpline && (pitDistToCenter - pitWallRadius) < (distToCenter - mainWallRadius)) {
                 resX = pitResolveX; resY = pitResolveY; resolveDist = Math.max(0.1, pitDistToCenter); resolveRadius = pitWallRadius;
             } else { resolveDist = Math.max(0.1, distToCenter); }
             const nx = (car.x - resX) / resolveDist;
             const ny = (car.y - resY) / resolveDist;
             car.x = resX + nx * (resolveRadius - 10);
             car.y = resY + ny * (resolveRadius - 10);
             car.vx = 0; car.vy = 0;
             if (Math.sqrt(car.vx**2 + car.vy**2) > 50) car.damage = Math.min(90, car.damage + 5);
          }

          car.throttle = 0; car.brake = 0; car.steer = 0;
          const speed_val = Math.sqrt(car.vx*car.vx + car.vy*car.vy);

          if (car.isBot) {
            const lookAhead = Math.floor(10 + (speed_val / 15)); 
            let targetArray = spline, myClosestIndex = closestIndex, useLoop = true;
            if (isInPitLane && pitSpline) {
               targetArray = pitSpline; useLoop = false;
               let minDist = Infinity;
               for (let i = 0; i < pitSpline.length; i++) {
                  const dSq = (car.x - pitSpline[i].x)**2 + (car.y - pitSpline[i].y)**2;
                  if (dSq < minDist) { minDist = dSq; myClosestIndex = i; }
               }
            }
            const targetIndex = useLoop ? (myClosestIndex + lookAhead) % targetArray.length : Math.min(myClosestIndex + lookAhead, targetArray.length - 1);
            const rawTarget = targetArray[targetIndex] || { x: 0, y: 0 };
            const dx = rawTarget.x - car.x; const dy = rawTarget.y - car.y;
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - car.angle;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            car.steer = Math.max(-1, Math.min(1, angleDiff * Math.max(1.5, 4.0 - (speed_val / 120))));
            const cornerSafeSpeed = car.maxSpeed * Math.max(0.20, 1.0 - (Math.max(0, Math.abs(angleDiff) - 0.05) * 3.5)); 
            const safeSpeed = (surface === 'GRASS') ? car.maxSpeed * 0.3 : cornerSafeSpeed;
            if (speed_val < safeSpeed - 5) { car.throttle = 1.0; } else if (speed_val > safeSpeed + 15) { car.brake = Math.min(1.0, (speed_val - safeSpeed) / 100); }
          } else if (car.isLocal) {
            if (car.controls) {
              if (keysRef.current[car.controls.up]) car.throttle = (surface === 'GRASS' ? 0.4 : 1.0);
              if (keysRef.current[car.controls.down]) car.brake = 1.0;
              const steerLimit = Math.max(0.70, 1.0 - (speed_val / 1200));
              if (keysRef.current[car.controls.left]) car.steer = -steerLimit;
              if (keysRef.current[car.controls.right]) car.steer = steerLimit;
            }
          } else if (car.remoteTarget) {
            car.x += (car.remoteTarget.x - car.x) * 0.3; car.y += (car.remoteTarget.y - car.y) * 0.3;
            let ad = car.remoteTarget.a - car.angle; ad = Math.atan2(Math.sin(ad), Math.cos(ad)); car.angle += ad * 0.3;
          }

          if (surface === 'GRASS') {
             car.damage = Math.min(90, car.damage + 0.01); 
             if (speed_val > car.maxSpeed * 0.6) { car.vx *= 0.98; car.vy *= 0.98; }
          }
          if (isInPitLane && pitSpline && closestPitIndex >= 0) {
            const pitNode = pitSpline[closestPitIndex];
            const pitMaxDist = pitSpline[pitSpline.length - 1].distFromStart || 0;
            if (pitNode.distFromStart !== undefined && pitNode.distFromStart > 1000 && pitNode.distFromStart < pitMaxDist - 1000) {
                const limit = car.maxSpeed * 0.4;
                if (speed_val > limit) { car.throttle = 0; car.brake = 1.0; if (speed_val > limit * 1.2) { car.vx *= 0.95; car.vy *= 0.95; } }
                const restricted = Math.max(1, pitMaxDist - 2000);
                if (pitNode.distFromStart > 1000 + (restricted * 0.4) && pitNode.distFromStart < 1000 + (restricted * 0.6)) { car.damage = 0; car.tireHealth = 100; }
            }
          }

          carsRef.current.forEach(otherCar => {
            if (otherCar.id > car.id) {
               const trackDist = Math.abs(car.currentWaypoint - otherCar.currentWaypoint);
               if (!(trackDist > 500 && trackDist < spline.length - 500)) {
                   const dx = otherCar.x - car.x, dy = otherCar.y - car.y, d = Math.sqrt(dx*dx + dy*dy);
                   if (d < 40 && d > 0.1) {
                     const nx = dx / d, ny = dy / d, rVx = car.vx - otherCar.vx, rVy = car.vy - otherCar.vy;
                     if (Math.abs(rVx * nx + rVy * ny) > 200) { car.damage = Math.min(90, car.damage + 5); otherCar.damage = Math.min(90, otherCar.damage + 5); }
                     const push = (40 - d) * 0.5; car.x -= nx*push; car.y -= ny*push; otherCar.x += nx*push; otherCar.y += ny*push;
                     if (rVx * nx + rVy * ny > 0) {
                         const imp = (1.5) * (rVx * nx + rVy * ny) / 2; car.vx -= imp * nx; car.vy -= imp * ny; otherCar.vx += imp * nx; otherCar.vy += imp * ny;
                     }
                   }
               }
            }
          });

          if (car.isLocal || car.isBot) {
              updateCarPhysics(car, dt, surface);
              if (car.isLocal && socket.connected && now - lastEmitRef.current > 50) {
                 socket.emit('player_tick', { id: car.id, x: car.x, y: car.y, a: car.angle, vx: car.vx, vy: car.vy, s: car.steer, b: car.brake, t: car.throttle });
                 lastEmitRef.current = now;
              }
          }
          audio.updateEngine(car.id, speed_val / 1200, car.throttle, car.isBot);
          if (speed_val > 100 && car.isSkidding) { skidMarksRef.current.push({ x: car.x, y: car.y, a: car.angle, w: 22 }); if (skidMarksRef.current.length > 3000) skidMarksRef.current.shift(); }
          if (closestIndex > car.currentWaypoint && closestIndex < car.currentWaypoint + 400) car.currentWaypoint = closestIndex;
          if (closestIndex < 20 && car.currentWaypoint > spline.length * 0.8) {
             car.laps++; car.currentWaypoint = 0;
             if (car.laps > 0 && car.currentLapStartTime) {
                const lapT = now - car.currentLapStartTime; car.lastLapTime = lapT; if (!car.bestLapTime || lapT < car.bestLapTime) car.bestLapTime = lapT;
                if (lapT < globalBestLapRef.current) {
                    globalBestLapRef.current = lapT;
                    const pDef = players.find(p => p.id === car.id);
                    setFastLapPopup({ name: pDef?.driverName || (car.isBot ? 'BOT' : 'P'+car.id), time: formatTime(lapT), color: car.color, isInitial: false });
                    setTimeout(() => setFastLapPopup(null), 4000);
                }
             }
             car.currentLapStartTime = now;
             if (car.laps >= totalLaps && totalLaps > 0 && car.finishTime === null) {
                car.finishTime = now - startTimeRef.current;
                if (!car.isBot && !car.scorePosted) { car.scorePosted = true; submitLapTime(car.finishTime); }
             }
          }
        });

        if (carsRef.current.some(c => c.finishTime !== null) && firstFinishTimeRef.current === null) {
          firstFinishTimeRef.current = now; audio.playVictory();
        }
        const activeHumans = carsRef.current.filter(c => !c.isBot);
        if (activeHumans.length > 0 && activeHumans.every(c => c.finishTime !== null || c.givenUp)) {
            if (allHumansFinishedTimeRef.current === null) allHumansFinishedTimeRef.current = now;
            else if (now - allHumansFinishedTimeRef.current > 5000) setRaceFinished(true);
        }
       }
      } catch (e: any) { console.error("F1 PHYSICS ENGINE CRASH:", e); }

      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      GAME_WIDTH = canvasRef.current.width; GAME_HEIGHT = canvasRef.current.height;
      const mainCar = carsRef.current.find(c => c.isLocal) || carsRef.current.find(c => !c.isBot) || carsRef.current[0] || { x:0,y:0,vx:0,vy:0,angle:0,currentWaypoint:0 };
      const spd = Math.sqrt(mainCar.vx**2 + mainCar.vy**2);
      const targetScale = (startSequence < 2 || raceFinished) ? 0.08 : Math.max(0.35, 1.0 - (spd / 1000) * 0.6);
      
      let lookA = mainCar.angle;
      if (spline && spline.length > 0) {
          const futureIdx = (mainCar.currentWaypoint + Math.min(25, Math.floor(spd / 40) + 5)) % spline.length;
          const futureN = spline[futureIdx];
          if (futureN) {
              lookA = Math.atan2(futureN.y - mainCar.y, futureN.x - mainCar.x);
              if (Math.cos(lookA)*Math.cos(mainCar.angle) + Math.sin(lookA)*Math.sin(mainCar.angle) < -0.5) lookA += Math.PI;
          }
      }
      let aDiff = lookA - camAngleRef.current; aDiff = Math.atan2(Math.sin(aDiff), Math.cos(aDiff));
      if (spd > 2) camAngleRef.current += aDiff * 0.05;

      let offX = 0, offY = 0;
      if (cameraModeRef.current === 'DYNAMIC' && startSequence >= 4) {
          offX = -Math.cos(camAngleRef.current) * (Math.min(1, spd / 1000) * GAME_WIDTH * 0.35);
          offY = -Math.sin(camAngleRef.current) * (Math.min(1, spd / 1000) * GAME_HEIGHT * 0.35);
      } else if (cameraModeRef.current === 'QUADRANTS' && startSequence >= 4) {
          offX = -Math.cos(camAngleRef.current) * GAME_WIDTH * 0.25;
          offY = -Math.sin(camAngleRef.current) * GAME_HEIGHT * 0.25;
      }
      
      if (!cameraRef.current) cameraRef.current = { x: mainCar.x, y: mainCar.y, scale: 0.08 };
      cameraRef.current.x += (mainCar.x - cameraRef.current.x) * 0.30;
      cameraRef.current.y += (mainCar.y - cameraRef.current.y) * 0.30;
      cameraRef.current.scale += (targetScale - cameraRef.current.scale) * 0.02;
      quadOffsetRef.current.x += (offX - quadOffsetRef.current.x) * 0.05;
      quadOffsetRef.current.y += (offY - quadOffsetRef.current.y) * 0.05;

      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = '#315722'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.save();
      ctx.translate(Math.round(GAME_WIDTH/2 + quadOffsetRef.current.x), Math.round(GAME_HEIGHT/2 + quadOffsetRef.current.y));
      ctx.scale(cameraRef.current.scale, cameraRef.current.scale);
      ctx.translate(Math.round(-cameraRef.current.x), Math.round(-cameraRef.current.y));
      drawTrack(ctx, spline, pitSpline, false);
      drawEnvironments(ctx, spline, pitSpline, false);
      skidMarksRef.current.forEach(sm => { ctx.save(); ctx.translate(sm.x, sm.y); ctx.rotate(sm.a); ctx.fillStyle='rgba(10,10,10,0.5)'; ctx.fillRect(-sm.w/2, -5, sm.w, 10); ctx.restore(); });
      carsRef.current.forEach(car => {
        if (spline[car.currentWaypoint % spline.length]?.isBridge) return;
        ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle); ctx.scale(1.5, 1.5);
        drawF1Car(ctx, car.color, car.color2 || '#222', car.helmetColor || '#FFDD00', car.drsEnabled); ctx.restore();
      });
      drawBridges3D(ctx, spline);
      carsRef.current.forEach(car => {
        if (!spline[car.currentWaypoint % spline.length]?.isBridge) return;
        ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle); ctx.scale(1.5, 1.5);
        drawF1Car(ctx, car.color, car.color2 || '#222', car.helmetColor || '#FFDD00', car.drsEnabled); ctx.restore();
      });
      ctx.restore();

      const hudX = GAME_WIDTH / 2, hudY = GAME_HEIGHT - 80;
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(hudX - 290, hudY, 580, 60);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hudX - 270, hudY + 10, 85, 40);
      ctx.font = '900 36px monospace'; ctx.fillStyle = '#000000'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.min(999, Math.ceil(spd * 0.36)).toString().padStart(3, '0')}`, hudX - 190, hudY + 41);
      ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left'; ctx.fillText("KM/H", hudX - 180, hudY + 38);
      ctx.textAlign = 'right'; ctx.fillStyle = '#AAAAAA'; ctx.fillText("MOTOR", hudX - 10, hudY + 38);
      const eH = Math.floor(100 - mainCar.damage);
      ctx.fillStyle = eH < 20 ? '#F00' : (eH < 50 ? '#FD0' : '#0F0'); ctx.textAlign = 'left'; ctx.font='900 36px monospace'; ctx.fillText(`${eH}%`, hudX, hudY + 41);
      ctx.textAlign = 'right'; ctx.fillStyle = '#AAAAAA'; ctx.font='bold 18px monospace'; ctx.fillText("PNEUS", hudX + 150, hudY + 38);
      const tH = (mainCar.tireHealth || 100).toFixed(1); ctx.textAlign = 'left'; 
      ctx.fillStyle = parseFloat(tH) < 40 ? '#F00' : (parseFloat(tH) < 70 ? '#FD0' : '#0F0'); ctx.font='900 36px monospace'; ctx.fillText(`${tH}%`, hudX + 160, hudY + 41);

      if (startSequence > 0 && startSequence < 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(GAME_WIDTH/2-80, 50, 160, 60);
        for(let i=0; i<3; i++) { ctx.beginPath(); ctx.arc(GAME_WIDTH/2-40+i*40, 80, 15, 0, Math.PI*2); ctx.fillStyle = startSequence > i ? (i===2 ? '#0F0' : '#F00') : '#333'; ctx.fill(); }
      }

      players.filter(p => !p.isBot).forEach(p => {
         const car = carsRef.current.find(c => c.id === p.id); if (!car) return;
         const timeEl = document.getElementById(`hud-time-${car.id}`); if (timeEl) timeEl.innerText = formatTime(Date.now() - (car.currentLapStartTime || startTimeRef.current || Date.now()));
         const lapEl = document.getElementById(`hud-lap-${car.id}`); if (lapEl) lapEl.innerText = `${Math.max(1, car.laps + 1)}/${totalLaps}`;
      });
      const mW = mapBounds.maxX - mapBounds.minX, mH = mapBounds.maxY - mapBounds.minY;
      carsRef.current.forEach(c => { const dot = document.getElementById(`minimap-dot-${c.id}`); if (dot) { dot.style.left = `${((c.x - mapBounds.minX) / mW) * 100}%`; dot.style.top = `${((c.y - mapBounds.minY) / mH) * 100}%`; } });

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [raceFinished, startSequence, spline]);

  return (
    <div className="w-full h-full absolute inset-0 bg-[#15151e] overflow-hidden">
      <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full z-0 block ${isSetupPhase ? 'blur-md opacity-60' : ''}`} />
      {isSetupPhase && (
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-[#111116]/80 backdrop-blur-md overflow-y-auto">
            <h1 className="text-5xl md:text-7xl text-white font-black italic uppercase tracking-tighter mb-2 text-center mt-12">PARC FERMÉ</h1>
            <p className="text-[#E10600] font-bold tracking-widest uppercase mb-6">Afinação Aerodinâmica de Corrida</p>
            <div className="flex flex-col xl:flex-row gap-8 w-full max-w-7xl mx-auto items-start mb-12">
               <div className="w-full xl:w-5/12 flex flex-col gap-4">
                  <div className="w-full rounded-xl border-2 border-gray-800 shadow-2xl relative bg-[#15151e]">
                     <div className="absolute top-4 left-6 z-10">
                       <h2 className="text-3xl text-white font-black italic uppercase tracking-tighter">{track?.name || "PISTA OFICIAL"}</h2>
                     </div>
                     <div className="h-[240px] w-full"><TrackPreview track={track} /></div>
                  </div>
                  <div className="w-full bg-[#111116]/90 rounded-xl p-4 grid grid-cols-4 gap-x-2 text-center text-white border-2 border-gray-800">
                    {(() => { const tel = getTrackTelemetry(spline); return ( <>
                      <div className="flex flex-col"><span className="text-[9px] text-gray-500 font-bold uppercase">Extensão</span><span className="text-xl font-black">{tel.lengthKm} KM</span></div>
                      <div className="border-l border-gray-800 flex flex-col"><span className="text-[9px] text-gray-500 font-bold uppercase">Curvas</span><span className="text-xl font-black">{tel.corners}</span></div>
                      <div className="border-l border-gray-800 flex flex-col"><span className="text-[9px] text-gray-500 font-bold uppercase">Top Speed</span><span className="text-xl font-black text-[#E10600]">{tel.topSpeedKmh} KM/H</span></div>
                      <div className="border-l border-gray-800 flex flex-col"><span className="text-[9px] text-gray-500 font-bold uppercase">Apex</span><span className="text-xl font-black text-yellow-500">{tel.minCornerKmh} KM/H</span></div>
                    </> ) })()}
                  </div>
               </div>
               <div className="w-full xl:w-7/12 flex flex-col gap-6">
                   {players.filter(p => !p.isBot && !p.isLocal).map(p => (
                      <div key={p.id} className="bg-[#15151e] border-t-4 border-gray-700 rounded-xl p-4 opacity-70 flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div>
                        <div className="flex-1"><div className="text-base font-black text-gray-400 uppercase">{p.driverName}</div><div className="text-[9px] text-gray-600 font-bold uppercase">A configurar setup...</div></div>
                      </div>
                   ))}
                   {players.filter(p => !p.isBot && p.isLocal).map(p => (
                      <div key={p.id} className="bg-[#15151e] border-t-4 border-[#E10600] rounded-xl p-6 shadow-2xl w-full">
                         <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div>
                            <h3 className="text-xl font-black text-white uppercase">{p.driverName}</h3>
                         </div>
                         <div className="bg-[#111116] rounded-lg p-6 border border-gray-800">
                            {(() => {
                               const curS = playerSetups[p.id] || 260; const curSet = getSetupFromSpeed(curS);
                               let sN = 'BALANCED', sC = 'text-white';
                               if (curS >= 320) { sN = 'FULL SPEED (MONZA)'; sC = 'text-blue-400'; }
                               else if (curS <= 200) { sN = 'FULL CURVE (MÓNACO)'; sC = 'text-[#E10600]'; }
                               return ( <>
                                  <div className="flex justify-between items-end mb-8"><span className={`text-2xl font-black italic ${sC}`}>{sN}</span><span className="text-4xl font-black text-white">{curS} KM/H</span></div>
                                  <input type="range" min="160" max="360" step="10" value={curS} onChange={(e) => setPlayerSetups(prev => ({ ...prev, [p.id]: parseInt(e.target.value) }))} className="w-full mb-8 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer" />
                                  <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-6">
                                     <div className="bg-[#15151e] p-3 rounded text-center"><span className="text-[10px] text-gray-500 font-bold uppercase">Grip</span><div className="text-lg font-black">{Math.round((curSet.gripMultiplier - 1.0) * 100)}%</div></div>
                                     <div className="bg-[#15151e] p-3 rounded text-center"><span className="text-[10px] text-gray-500 font-bold uppercase">Arrasto</span><div className="text-lg font-black">{(curSet.dragMultiplier * 100).toFixed(0)}%</div></div>
                                  </div>
                               </> );
                            })()}
                         </div>
                      </div>
                   ))}
               </div>
            </div>
            {localSetupReady ? (
               <div className="px-12 py-5 bg-gray-800 text-gray-400 font-black text-2xl animate-pulse">A AGUARDAR ADVERSÁRIO...</div>
            ) : (
               <button onClick={() => { if (players.some(p => !p.isBot && !p.isLocal)) { setLocalSetupReady(true); socket.emit('setup_ready'); } else { setIsSetupPhase(false); setStartSequence(1); } }} className="px-12 py-5 bg-green-600 hover:bg-green-500 text-white font-black text-3xl italic rounded">IR PARA A PISTA</button>
            )}
         </div>
      )}
      
      {fastLapPopup && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 right-8 z-50 flex flex-col items-end animate-pulse">
            <div className="bg-black/90 px-8 py-3 border-t-4" style={{borderColor: fastLapPopup.color}}>
               <span className="text-xl font-bold uppercase text-white">NOVA VOLTA RÁPIDA!</span>
               <div className="text-5xl font-black text-white">{fastLapPopup.time}</div>
            </div>
            <div className="px-12 py-2 text-black font-black uppercase text-2xl" style={{backgroundColor: fastLapPopup.color}}>{fastLapPopup.name}</div>
         </div>
      )}
      
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 left-0 flex flex-col gap-2 z-10">
            {players.filter(p => !p.isBot).map(p => (
               <div key={p.id} className="bg-black/80 border-l-4 p-3 rounded-r-xl w-64 shadow-2xl flex flex-col" style={{borderColor: p.color}}>
                  <span className="text-white font-black text-xl italic uppercase">{p.driverName || 'P'+p.id}</span>
                  <div className="flex justify-between"><div className="text-[10px] text-gray-500 font-bold uppercase">Tempo <span id={`hud-time-${p.id}`} className="text-yellow-400 font-mono text-base">00:00.00</span></div><div className="text-[10px] text-gray-500 font-bold uppercase">L<span id={`hud-lap-${p.id}`} className="text-white font-black text-base">1/{totalLaps}</span></div></div>
               </div>
            ))}
         </div>
      )}

      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute top-20 left-4 flex flex-col gap-1 z-10 w-48">
            {liveStandings.map((carId, idx) => {
               const p = players.find(x => x.id === carId); if (!p) return null;
               return ( <div key={carId} className="flex items-center bg-black/80 rounded border-l-4" style={{borderColor: p.color}}><span className="w-8 text-center text-white font-black text-sm bg-gray-900 py-1">{idx + 1}</span><span className="flex-1 text-white font-bold text-xs pl-3 uppercase tracking-widest truncate">{p.driverName}{p.isBot ? '*' : ''}</span></div> );
            })}
         </div>
      )}

      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 right-8 w-48 h-48 bg-black/60 border-2 border-gray-800 rounded-2xl p-4 z-10 overflow-hidden">
            <svg viewBox={`${mapBounds.minX} ${mapBounds.minY} ${mapBounds.maxX - mapBounds.minX} ${mapBounds.maxY - mapBounds.minY}`} className="w-full h-full opacity-50"><polygon points={spline.map(pt => `${pt.x},${pt.y}`).join(' ')} fill="none" stroke="#FFF" strokeWidth={(mapBounds.maxX-mapBounds.minX)*0.02} /></svg>
            {players.map(p => ( <div key={`dot-${p.id}`} id={`minimap-dot-${p.id}`} className="absolute w-3 h-3 rounded-full border border-white z-20" style={{backgroundColor: p.color, left: '50%', top: '50%'}}></div> ))}
         </div>
      )}
      
      {!raceFinished && (
        <button onClick={() => onBackToMenu([], 'quit')} className="fixed top-4 right-4 bg-red-600 text-white font-bold px-4 py-2 hover:bg-red-700 z-50 rounded-lg">DESISTIR</button>
      )}
      
      {raceFinished && (() => {
        const finished = carsRef.current.filter(c => c.finishTime !== null).sort((a,b) => a.finishTime! - b.finishTime!);
        const currentRes: RaceResultEntry[] = finished.map((c, i) => {
           const pDef = players.find(p => p.id === c.id);
           return { playerId: c.id, position: i + 1, driverName: pDef?.driverName || (c.isBot ? 'BOT' : 'P'+c.id), teamName: pDef?.teamName || 'Independente', color: c.color, color2: c.color2, totalTimeMs: c.finishTime, bestLapMs: c.bestLapTime || null, pointsEarned: (i < 10 ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] : 0), totalChampionshipPoints: (championshipStandings[c.id] || 0) + (i < 10 ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] : 0) };
        });
        return ( <RaceResults results={currentRes} isHost={isHost} hasNextTrack={hasNextTrack} onNextTrack={() => onBackToMenu(currentRes, 'next')} onFinishEvent={() => onBackToMenu(currentRes, 'finish')} /> );
      })()}
    </div>
  );
}
