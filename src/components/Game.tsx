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

  const [raceFinished, setRaceFinished] = useState(false);
  const [startSequence, setStartSequence] = useState(isSetupPhase ? 0 : 1); 
  const [, setForceRender] = useState(0);
  const [cameraModeUI, setCameraModeUI] = useState<'CENTRAL' | 'DYNAMIC' | 'QUADRANTS'>('CENTRAL');

  const [finalClassification, setFinalClassification] = useState<RaceResultEntry[] | null>(null);

  useEffect(() => {
     const onFinalRaceResults = (classification: RaceResultEntry[]) => {
         setFinalClassification(classification);
         setRaceFinished(true); // forces physics to stop
     };
     socket.on('final_race_results', onFinalRaceResults);
     return () => { socket.off('final_race_results', onFinalRaceResults); };
  }, []);

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

  const [localSetupReady, setLocalSetupReady] = useState(false);
  const globalBestLapRef = useRef<number>(Infinity);
  const [fastLapPopup, setFastLapPopup] = useState<{name: string, time: string, color: string, isInitial: boolean} | null>(null);
  const [liveStandings, setLiveStandings] = useState<{id: number, bestLapMs: number | null, isFastestLap: boolean}[]>([]);
  const [raceEndCountdown, setRaceEndCountdown] = useState<number | null>(null);
  const raceGraceEndTimeRef = useRef<number | null>(null);
  
  const carsRef = useRef<CarPhysics[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const startTimeRef = useRef<number>(0);
  const firstFinishTimeRef = useRef<number | null>(null);
  const allHumansFinishedTimeRef = useRef<number | null>(null);
  const cameraRef = useRef<{x: number, y: number, scale: number} | null>(null);
  const cameraModeRef = useRef<'CENTRAL' | 'DYNAMIC' | 'QUADRANTS'>('CENTRAL');
  const quadOffsetRef = useRef<{x: number, y: number}>({x: 0, y: 0});
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
         if (isHost) {
             const sorted = [...carsRef.current].sort((a,b) => {
                 if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
                 if (a.finishTime !== null) return -1;
                 if (b.finishTime !== null) return 1;
                 const scoreA = (a.laps * 1000000) + a.currentWaypoint;
                 const scoreB = (b.laps * 1000000) + b.currentWaypoint;
                 return scoreB - scoreA;
             });
             
             const standingsData = sorted.map(c => ({
                 id: c.id,
                 bestLapMs: c.bestLapTime || null,
                 isFastestLap: (c.bestLapTime !== null && c.bestLapTime === globalBestLapRef.current && globalBestLapRef.current !== Infinity)
             }));
             
             let countdownRemaining = null;
             if (raceGraceEndTimeRef.current !== null) {
                 countdownRemaining = Math.max(0, Math.ceil((raceGraceEndTimeRef.current - Date.now()) / 1000));
                 setRaceEndCountdown(countdownRemaining);
             }

             socket.emit('host_live_standings', { standings: standingsData, countdown: countdownRemaining });
             setLiveStandings(standingsData);
         }
     }, 500);
     return () => clearInterval(interval);
  }, [isHost, isSetupPhase, raceFinished, startSequence]);

  useEffect(() => {
    if (isHost) return;
    const onLiveStandings = (data: any) => {
        if (data.standings) setLiveStandings(data.standings);
        if (data.countdown !== undefined) setRaceEndCountdown(data.countdown);
    };
    socket.on('live_standings', onLiveStandings);
    return () => { socket.off('live_standings', onLiveStandings); };
  }, [isHost]);

  useEffect(() => {
    audio.init();
    firstFinishTimeRef.current = null;
    allHumansFinishedTimeRef.current = null;
    
    if (!spline || spline.length === 0) return;
    
    carsRef.current = players.map((p, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const targetDistance = 200 + row * 150;
      let computedIndex = 0;
      let accumulatedDistance = 0;
      
      for (let i = spline.length - 1; i > 0; i--) {
        const p1 = spline[i];
        const p2 = spline[(i + 1) % spline.length];
        const dist = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
        accumulatedDistance += dist;
        if (accumulatedDistance >= targetDistance) { computedIndex = i; break; }
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
    
    return () => { audio.stopAllEngines(); };
  }, [players, spline, playerSetups]);

  useEffect(() => {
    if (isSetupPhase) return;
    let timer: NodeJS.Timeout;
    if (startSequence === 0) { timer = setTimeout(() => { setStartSequence(1); audio.playStartSequence(); }, 1000); }
    else if (startSequence === 1) { timer = setTimeout(() => { setStartSequence(2); }, 1000); }
    else if (startSequence === 2) { timer = setTimeout(() => { setStartSequence(3); }, 1000); }
    else if (startSequence === 3) { timer = setTimeout(() => { startTimeRef.current = Date.now(); carsRef.current.forEach(c => c.currentLapStartTime = startTimeRef.current); setStartSequence(4); }, 1000); }
    return () => clearTimeout(timer);
  }, [startSequence, isSetupPhase]);

  useEffect(() => {
     const onAllSetupReady = () => { setIsSetupPhase(false); setStartSequence(1); setForceRender(Date.now()); };
     socket.on('all_setup_ready', onAllSetupReady);
     return () => { socket.off('all_setup_ready', onAllSetupReady); };
  }, []);

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
           // CRITICAL SYNC: Update Laps and Finish Time from Remote Player
           if (data.laps !== undefined) car.laps = data.laps;
           if (data.ft !== undefined) car.finishTime = data.ft;
           if (data.cw !== undefined) car.currentWaypoint = data.cw;
           if (data.bl !== undefined) car.bestLapTime = data.bl;
         }
     };
     socket.on('remote_tick', onRemoteTick);
     return () => { socket.off('remote_tick', onRemoteTick); };
  }, [isSetupPhase]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { 
       keysRef.current[e.code] = true;
       const cameraKeys = players.filter(p => !p.isBot).map(p => p.controls?.camera || 'KeyC');
       if (cameraKeys.includes(e.code)) { const next = cameraModeRef.current === 'CENTRAL' ? 'DYNAMIC' : (cameraModeRef.current === 'DYNAMIC' ? 'QUADRANTS' : 'CENTRAL'); cameraModeRef.current = next; setCameraModeUI(next); }
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [players]);

  const formatTime = (ms: number) => {
    if (!ms || ms === Infinity) return '---';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const milli = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${milli.toString().padStart(2,'0')}`;
  };

  const submitLapTime = async (timeMs: number) => {
     try {
        const token = localStorage.getItem('token'); if (!token) return;
        await fetch(`/api/lap-times`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ track_id: track.id, lap_time_ms: timeMs }) });
     } catch (e) { console.error("Error submitting lap time", e); }
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    canvasRef.current.width = window.innerWidth; canvasRef.current.height = window.innerHeight;
    let animationFrameId: number; let lastTime = performance.now();
    const pitSpline = (rawTrack?.pitNodes && rawTrack.pitNodes.length > 0) ? rawTrack.pitNodes : null;

    const update = (time: number) => {
      if (!spline || spline.length === 0) return;
      let dt = (time - lastTime) / 1000;
      if (dt < 0) dt = 0; if (dt > 0.1) dt = 0.016; lastTime = time;
      const now = Date.now();
      try {
        if (startSequence >= 4) {
          carsRef.current.forEach(car => {
          if (car.finishTime !== null) return;
          let minSplineDistSq = Infinity; let closestIndex = car.currentWaypoint;
          let resolveX = car.x; let resolveY = car.y;
          let searchRange = spline.length; if (car.currentWaypoint > 0) searchRange = 400; 

          for (let s = 0; s <= searchRange * 2; s++) {
             let i = (car.currentWaypoint - searchRange + s + spline.length) % spline.length;
             if (searchRange === spline.length && s >= spline.length) break;
             let nextI = (i + 1) % spline.length; const p1 = spline[i]; const p2 = spline[nextI];
             const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
             let t_seg = 0; if (l2 > 0) { t_seg = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2; t_seg = Math.max(0, Math.min(1, t_seg)); }
             const projX = p1.x + t_seg * (p2.x - p1.x); const projY = p1.y + t_seg * (p2.y - p1.y);
             const distSq = (car.x - projX)**2 + (car.y - projY)**2;
             if (distSq < minSplineDistSq) { minSplineDistSq = distSq; closestIndex = t_seg < 0.5 ? i : nextI; resolveX = projX; resolveY = projY; }
          }
          
          const closestNode = spline[closestIndex] || { width: 300 };
          const distToCenter = Math.sqrt(minSplineDistSq);
          const trackWidth = closestNode.width || 300;
          let pitDistToCenter = Infinity; let closestPitIndex = -1; let pitResolveX = car.x; let pitResolveY = car.y;
          
          if (pitSpline) {
            for (let i = 0; i < pitSpline.length - 1; i++) {
              const p1 = pitSpline[i]; const p2 = pitSpline[i+1];
              const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
              let t_seg = 0; if (l2 > 0) { t_seg = ((car.x - p1.x) * (p2.x - p1.x) + (car.y - p1.y) * (p2.y - p1.y)) / l2; t_seg = Math.max(0, Math.min(1, t_seg)); }
              const pSq = (car.x - (p1.x + t_seg * (p2.x - p1.x)))**2 + (car.y - (p1.y + t_seg * (p2.y - p1.y)))**2;
              if (pSq < pitDistToCenter) { pitDistToCenter = pSq; closestPitIndex = t_seg < 0.5 ? i : i+1; pitResolveX = p1.x + t_seg * (p2.x - p1.x); pitResolveY = p1.y + t_seg * (p2.y - p1.y); }
            }
            pitDistToCenter = Math.sqrt(pitDistToCenter);
          }

          let surface: 'TRACK' | 'CURB' | 'CURB_WIDE' | 'CURB_APEX' | 'GRASS' = 'TRACK';
          let isInPitLane = (pitSpline && closestPitIndex >= 0 && pitDistToCenter < pitSpline[closestPitIndex].width * 0.5 && pitDistToCenter < distToCenter);
          if (!isInPitLane) {
             let extT = closestNode.isExtendedTight || false; let apT = closestNode.isApexTight || false;
             if (apT && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.95) surface = distToCenter > trackWidth * 0.8 ? 'CURB_APEX' : (distToCenter > trackWidth * 0.65 ? 'CURB_WIDE' : 'CURB');
             else if (extT && distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.80) surface = distToCenter > trackWidth * 0.65 ? 'CURB_WIDE' : 'CURB';
             else if (distToCenter > trackWidth * 0.5 && distToCenter <= trackWidth * 0.65) surface = 'CURB';
             else if (distToCenter > trackWidth * 0.5) surface = 'GRASS';
          }

          const mW = closestNode.maxWallRadius || (trackWidth * 1.70);
          const pW = pitSpline && closestPitIndex >= 0 ? pitSpline[closestPitIndex].width * 0.495 : 0;
          if (distToCenter > mW - 10 && (pitSpline ? pitDistToCenter > pW - 4 : true)) {
             let rX = resolveX, rY = resolveY, rD = distToCenter, rR = mW;
             if (pitSpline && (pitDistToCenter - pW) < (distToCenter - mW)) { rX = pitResolveX; rY = pitResolveY; rD = Math.max(0.1, pitDistToCenter); rR = pW; } else { rD = Math.max(0.1, distToCenter); }
             const nx = (car.x - rX) / rD; const ny = (car.y - rY) / rD; car.x = rX + nx * (rR - 10); car.y = rY + ny * (rR - 10); car.vx = 0; car.vy = 0;
             if (Math.sqrt(car.vx**2 + car.vy**2) > 50) car.damage = Math.min(90, car.damage + 5);
          }

          car.throttle = 0; car.brake = 0; car.steer = 0;
          const speed_val = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
          if (car.isBot) {
            const lookA = Math.floor(10 + (speed_val / 15)); 
            let tArr = spline, myIdx = closestIndex, useL = true;
            if (isInPitLane && pitSpline) { tArr = pitSpline; useL = false; let mD = Infinity; for (let i=0; i<pitSpline.length; i++) { const dSq = (car.x-pitSpline[i].x)**2 + (car.y-pitSpline[i].y)**2; if (dSq < mD) { mD=dSq; myIdx=i; } } }
            const tIdx = useL ? (myIdx + lookA) % tArr.length : Math.min(myIdx + lookA, tArr.length - 1);
            const rawT = tArr[tIdx] || { x: 0, y: 0 };
            const tAngle = Math.atan2(rawT.y - car.y, rawT.x - car.x); let aD = Math.atan2(Math.sin(tAngle-car.angle), Math.cos(tAngle-car.angle));
            car.steer = Math.max(-1, Math.min(1, aD * Math.max(1.5, 4.0 - (speed_val/120))));
            const sSpd = (surface==='GRASS') ? car.maxSpeed*0.3 : car.maxSpeed * Math.max(0.2, 1.0 - (Math.max(0, Math.abs(aD)-0.05)*3.5));
            if (speed_val < sSpd - 5) car.throttle = 1.0; else if (speed_val > sSpd + 15) car.brake = Math.min(1, (speed_val-sSpd)/100);
          } else if (car.isLocal) {
            if (car.controls) { if (keysRef.current[car.controls.up]) car.throttle = (surface === 'GRASS' ? 0.4 : 1.0); if (keysRef.current[car.controls.down]) car.brake = 1.0; const sL = Math.max(0.70, 1.0 - (speed_val/1200)); if (keysRef.current[car.controls.left]) car.steer = -sL; if (keysRef.current[car.controls.right]) car.steer = sL; }
          } else if (car.remoteTarget) { car.x += (car.remoteTarget.x - car.x) * 0.3; car.y += (car.remoteTarget.y - car.y) * 0.3; let ad = Math.atan2(Math.sin(car.remoteTarget.a-car.angle), Math.cos(car.remoteTarget.a-car.angle)); car.angle += ad * 0.3; }

          if (surface === 'GRASS') { car.damage = Math.min(90, car.damage + 0.01); if (speed_val > car.maxSpeed * 0.6) { car.vx *= 0.98; car.vy *= 0.98; } }
          if (isInPitLane && pitSpline && closestPitIndex >= 0) {
            const pitN = pitSpline[closestPitIndex]; const pitM = pitSpline[pitSpline.length-1].distFromStart || 0;
            if (pitN.distFromStart! > 1000 && pitN.distFromStart! < pitM - 1000) {
                const lim = car.maxSpeed * 0.4; if (speed_val > lim) { car.throttle = 0; car.brake = 1.0; if (speed_val > lim*1.2) { car.vx *= 0.95; car.vy *= 0.95; } }
                if (pitN.distFromStart! > 1000 + (pitM-2000)*0.4 && pitN.distFromStart! < 1000 + (pitM-2000)*0.6) { car.damage = 0; car.tireHealth = 100; }
            }
          }
          
          carsRef.current.forEach(other => { if (other.id > car.id) { const tD = Math.abs(car.currentWaypoint - other.currentWaypoint); if (!(tD > 500 && tD < spline.length-500)) { const dx = other.x-car.x, dy = other.y-car.y, d = Math.sqrt(dx*dx+dy*dy); if (d < 40 && d > 0.1) { const nx = dx/d, ny = dy/d, rV = {x: car.vx-other.vx, y: car.vy-other.vy}; if (Math.abs(rV.x*nx+rV.y*ny) > 200) { car.damage = Math.min(90, car.damage+5); other.damage = Math.min(90, other.damage+5); } const push=(40-d)*0.5; car.x-=nx*push; car.y-=ny*push; other.x+=nx*push; other.y+=ny*push; if (rV.x*nx+rV.y*ny > 0) { const imp = 0.75 * (rV.x*nx+rV.y*ny); car.vx-=imp*nx; car.vy-=imp*ny; other.vx+=imp*nx; other.vy+=imp*ny; } } } } });

          if (car.isLocal || car.isBot) {
              updateCarPhysics(car, dt, surface);
              if (car.isLocal && socket.connected && now - lastEmitRef.current > 50) {
                  // SYNC: Added laps, finishTime, currentWaypoint, and bestLapTime to telemetry
                  socket.emit('player_tick', { id: car.id, x: car.x, y: car.y, a: car.angle, vx: car.vx, vy: car.vy, s: car.steer, b: car.brake, t: car.throttle, laps: car.laps, ft: car.finishTime, cw: car.currentWaypoint, bl: car.bestLapTime });
                  lastEmitRef.current = now;
               }
           }
          audio.updateEngine(car.id, speed_val/1200, car.throttle, car.isBot);
          if (speed_val > 100 && car.isSkidding) { skidMarksRef.current.push({ x: car.x, y: car.y, a: car.angle, w: 22 }); if (skidMarksRef.current.length > 3000) skidMarksRef.current.shift(); }
          if (closestIndex > car.currentWaypoint && closestIndex < car.currentWaypoint + 400) car.currentWaypoint = closestIndex;
          if (closestIndex < 20 && car.currentWaypoint > spline.length * 0.8) {
             car.laps++; car.currentWaypoint = 0;
             if (car.laps > 0 && car.currentLapStartTime) {
                const lapT = now - car.currentLapStartTime; car.lastLapTime = lapT; if (!car.bestLapTime || lapT < car.bestLapTime) car.bestLapTime = lapT;
                if (lapT < globalBestLapRef.current) { globalBestLapRef.current = lapT; const pD = players.find(p => p.id === car.id); setFastLapPopup({ name: pD?.driverName || (car.isBot ? 'BOT' : 'P'+car.id), time: formatTime(lapT), color: car.color, isInitial: false }); setTimeout(() => setFastLapPopup(null), 4000); }
             }
             car.currentLapStartTime = now;
             if (car.laps >= totalLaps && totalLaps > 0 && car.finishTime === null) { car.finishTime = now - startTimeRef.current; if (!car.isBot && !car.scorePosted) { car.scorePosted = true; submitLapTime(car.finishTime); } }
          }
        });

         if (carsRef.current.some(c => c.finishTime !== null) && firstFinishTimeRef.current === null) { firstFinishTimeRef.current = now; audio.playVictory(); }
         
         const activeMans = carsRef.current.filter(c => !c.isBot);
         const humansFinished = activeMans.length > 0 && activeMans.every(c => c.finishTime !== null || c.givenUp);
         
         // HOST SAFETY TIMEOUT
         if (isHost && !raceFinished) {
            const anyoneFinished = carsRef.current.some(c => !c.isBot && c.finishTime !== null);
            if (anyoneFinished && raceGraceEndTimeRef.current === null) {
                raceGraceEndTimeRef.current = now + 20000; // 20s grace since first finisher
            }
            if (raceGraceEndTimeRef.current !== null && now > raceGraceEndTimeRef.current) {
                console.log("SAFETY TIMEOUT - FORCING END");
                setRaceFinished(true);
            }
         }

         if (humansFinished) {
             if (allHumansFinishedTimeRef.current === null) allHumansFinishedTimeRef.current = now;
             else if (now - allHumansFinishedTimeRef.current > 5000) setRaceFinished(true);
         }
       }
      } catch (e: any) { console.error("F1 PHYSICS ENGINE CRASH:", e); }

      const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
      GAME_WIDTH = canvasRef.current.width; GAME_HEIGHT = canvasRef.current.height;
      const mainCar = carsRef.current.find(c => c.isLocal) || carsRef.current.find(c => !c.isBot) || carsRef.current[0] || { x:0,y:0,vx:0,vy:0,angle:0,currentWaypoint:0 };
      const spd = Math.sqrt(mainCar.vx**2 + mainCar.vy**2);
      const targetScale = (startSequence < 2 || raceFinished) ? 0.08 : Math.max(0.35, 1.0 - (spd / 1000) * 0.6);
      
      let lookA = mainCar.angle;
      if (spline && spline.length > 0) { const fIdx = (mainCar.currentWaypoint + Math.min(25, Math.floor(spd / 40) + 5)) % spline.length; const fN = spline[fIdx]; if (fN) { lookA = Math.atan2(fN.y-mainCar.y, fN.x-mainCar.x); if (Math.cos(lookA)*Math.cos(mainCar.angle)+Math.sin(lookA)*Math.sin(mainCar.angle) < -0.5) lookA += Math.PI; } }
      let aDiff = Math.atan2(Math.sin(lookA-camAngleRef.current), Math.cos(lookA-camAngleRef.current)); if (spd > 2) camAngleRef.current += aDiff * 0.05;

      let offX = 0, offY = 0;
      if (cameraModeRef.current === 'DYNAMIC' && startSequence >= 4) { offX = -Math.cos(camAngleRef.current)*(Math.min(1, spd/1000)*GAME_WIDTH*0.35); offY = -Math.sin(camAngleRef.current)*(Math.min(1, spd/1000)*GAME_HEIGHT*0.35); }
      else if (cameraModeRef.current === 'QUADRANTS' && startSequence >= 4) { offX = -Math.cos(camAngleRef.current)*GAME_WIDTH*0.25; offY = -Math.sin(camAngleRef.current)*GAME_HEIGHT*0.25; }
      
      if (!cameraRef.current) cameraRef.current = { x: mainCar.x, y: mainCar.y, scale: 0.08 };
      cameraRef.current.x += (mainCar.x - cameraRef.current.x) * 0.3; cameraRef.current.y += (mainCar.y - cameraRef.current.y) * 0.3;
      cameraRef.current.scale += (targetScale - cameraRef.current.scale) * 0.02;
      quadOffsetRef.current.x += (offX - quadOffsetRef.current.x) * 0.05; quadOffsetRef.current.y += (offY - quadOffsetRef.current.y) * 0.05;

      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = '#315722'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.save();
      ctx.translate(Math.round(GAME_WIDTH/2+quadOffsetRef.current.x), Math.round(GAME_HEIGHT/2+quadOffsetRef.current.y)); ctx.scale(cameraRef.current.scale, cameraRef.current.scale); ctx.translate(Math.round(-cameraRef.current.x), Math.round(-cameraRef.current.y));
      drawTrack(ctx, spline, pitSpline, false); drawEnvironments(ctx, spline, pitSpline, false);
      skidMarksRef.current.forEach(sm => { ctx.save(); ctx.translate(sm.x, sm.y); ctx.rotate(sm.a); ctx.fillStyle='rgba(10,10,10,0.5)'; ctx.fillRect(-sm.w/2, -5, sm.w, 10); ctx.restore(); });
      carsRef.current.forEach(c => { if (spline[c.currentWaypoint % spline.length]?.isBridge) return; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle); ctx.scale(1.5, 1.5); drawF1Car(ctx, c.color, c.color2 || '#222', c.helmetColor || '#FFDD00', c.drsEnabled); ctx.restore(); });
      drawBridges3D(ctx, spline);
      carsRef.current.forEach(c => { if (!spline[c.currentWaypoint % spline.length]?.isBridge) return; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle); ctx.scale(1.5, 1.5); drawF1Car(ctx, c.color, c.color2 || '#222', c.helmetColor || '#FFDD00', c.drsEnabled); ctx.restore(); });
      ctx.restore();

      const hX = GAME_WIDTH/2, hY = GAME_HEIGHT-80; ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(hX-290, hY, 580, 60); ctx.fillStyle = '#FFF'; ctx.fillRect(hX-270, hY+10, 85, 40);
      ctx.font = '900 36px monospace'; ctx.fillStyle = '#000'; ctx.textAlign = 'right'; ctx.fillText(`${Math.min(999, Math.ceil(spd*0.36)).toString().padStart(3, '0')}`, hX-190, hY+41);
      ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#FFF'; ctx.textAlign = 'left'; ctx.fillText("KM/H", hX-180, hY+38);
      ctx.textAlign = 'right'; ctx.fillStyle = '#AAA'; ctx.fillText("MOTOR", hX-10, hY+38);
      const eH = Math.floor(100 - mainCar.damage); ctx.fillStyle = eH < 20 ? '#F00' : (eH < 50 ? '#FD0' : '#0F0'); ctx.textAlign = 'left'; ctx.font='900 36px monospace'; ctx.fillText(`${eH}%`, hX, hY+41);
      ctx.textAlign = 'right'; ctx.fillStyle = '#AAA'; ctx.font='bold 18px monospace'; ctx.fillText("PNEUS", hX+150, hY+38);
      const tH = (mainCar.tireHealth || 100).toFixed(1); ctx.textAlign = 'left'; ctx.fillStyle = parseFloat(tH) < 40 ? '#F00' : (parseFloat(tH) < 70 ? '#FD0' : '#0F0'); ctx.font='900 36px monospace'; ctx.fillText(`${tH}%`, hX+160, hY+41);

      if (startSequence > 0 && startSequence < 4) { ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(GAME_WIDTH/2-80, 50, 160, 60); for(let i=0; i<3; i++) { ctx.beginPath(); ctx.arc(GAME_WIDTH/2-40+i*40, 80, 15, 0, Math.PI*2); ctx.fillStyle = startSequence > i ? (i===2 ? '#0F0' : '#F00') : '#333'; ctx.fill(); } }
      players.filter(p => !p.isBot).forEach(p => { 
          const c = carsRef.current.find(x => x.id === p.id); 
          if (!c) return; 
          const tE = document.getElementById(`hud-time-${c.id}`); 
          if (tE) {
              const displayTime = c.finishTime !== null ? c.finishTime : (Date.now() - (c.currentLapStartTime || startTimeRef.current || Date.now()));
              tE.innerText = formatTime(displayTime);
          }
          const lE = document.getElementById(`hud-lap-${c.id}`); 
          if (lE) lE.innerText = `${Math.max(1, (c.finishTime !== null ? totalLaps : c.laps + 1))}/${totalLaps}`; 
      });
      carsRef.current.forEach(c => { const dot = document.getElementById(`minimap-dot-${c.id}`); if (dot) { dot.setAttribute('cx', c.x.toString()); dot.setAttribute('cy', c.y.toString()); } });
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
                     <div className="absolute top-4 left-6 z-10"><h2 className="text-3xl text-white font-black italic uppercase tracking-tighter">{track?.name || "PISTA OFICIAL"}</h2></div>
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
                   {players.filter(p => !p.isBot && !p.isLocal).map(p => ( <div key={p.id} className="bg-[#15151e] border-t-4 border-gray-700 rounded-xl p-4 opacity-70 flex items-center gap-3"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div><div className="flex-1"><div className="text-base font-black text-gray-400 uppercase">{p.driverName}</div><div className="text-[9px] text-gray-600 font-bold uppercase">A configurar setup...</div></div></div> ))}
                   {players.filter(p => !p.isBot && p.isLocal).map(p => (
                      <div key={p.id} className="bg-[#15151e] border-t-4 border-[#E10600] rounded-xl p-6 shadow-2xl w-full">
                         <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div><h3 className="text-xl font-black text-white uppercase">{p.driverName}</h3></div>
                         <div className="bg-[#111116] rounded-lg p-6 border border-gray-800">
                            {(() => {
                               const curS = playerSetups[p.id] || 260; const curSet = getSetupFromSpeed(curS);
                               let sN = 'BALANCED', sC = 'text-white'; if (curS >= 320) { sN = 'FULL SPEED (MONZA)'; sC = 'text-blue-400'; } else if (curS <= 200) { sN = 'FULL CURVE (MÓNACO)'; sC = 'text-[#E10600]'; }
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
            {localSetupReady ? ( <div className="px-12 py-5 bg-gray-800 text-gray-400 font-black text-2xl animate-pulse">A AGUARDAR ADVERSÁRIO...</div> ) : ( <button onClick={() => { if (players.some(p => !p.isBot && !p.isLocal)) { setLocalSetupReady(true); socket.emit('setup_ready'); } else { setIsSetupPhase(false); setStartSequence(1); } }} className="px-12 py-5 bg-green-600 hover:bg-green-500 text-white font-black text-3xl italic rounded">IR PARA A PISTA</button> )}
          </div>
       )}
       {fastLapPopup && !raceFinished && startSequence >= 4 && ( <div className="absolute bottom-8 left-8 z-50 flex flex-col items-start animate-pulse"><div className="bg-black/90 px-8 py-3 border-t-4" style={{borderColor: fastLapPopup.color}}><span className="text-xl font-bold uppercase text-white">NOVA VOLTA RÁPIDA!</span><div className="text-5xl font-black text-white">{fastLapPopup.time}</div></div><div className="px-12 py-2 text-black font-black uppercase text-2xl" style={{backgroundColor: fastLapPopup.color}}>{fastLapPopup.name}</div></div> )}
       
       {raceEndCountdown !== null && !raceFinished && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center">
             <div className="bg-red-600/90 text-white font-black italic tracking-tighter text-4xl px-12 py-4 rounded-xl shadow-[0_0_50px_rgba(225,6,0,0.5)] border-2 border-white/20 animate-bounce">
                A CONCLUIR PROVA EM {raceEndCountdown}s
             </div>
             <p className="text-white/50 font-bold uppercase tracking-widest text-[10px] mt-3">A FIA está a encerrar a sessão devido ao tempo limite</p>
          </div>
       )}

       {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 left-0 flex flex-col gap-2 z-10">
            {players.filter(p => !p.isBot).map(p => ( <div key={p.id} className="bg-black/80 border-l-4 p-3 rounded-r-xl w-64 shadow-2xl flex flex-col" style={{borderColor: p.color}}><span className="text-white font-black text-xl italic uppercase">{p.driverName || 'P'+p.id}</span><div className="flex justify-between"><div className="text-[10px] text-gray-500 font-bold uppercase">Tempo <span id={`hud-time-${p.id}`} className="text-yellow-400 font-mono text-base">00:00.00</span></div><div className="text-[10px] text-gray-500 font-bold uppercase">L<span id={`hud-lap-${p.id}`} className="text-white font-black text-base">1/{totalLaps}</span></div></div></div> ))}
         </div>
      )}

      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute top-4 right-4 text-white text-[10px] sm:text-xs opacity-50 text-right space-y-1 font-bold tracking-widest uppercase z-10 pointer-events-none">
            {players.filter(p => !p.isBot && p.isLocal).slice(0, 1).map(p => {
               const c = p.controls || { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', camera: 'KeyC' };
               return (
                 <React.Fragment key="controls-hint">
                    <p><span className="text-[#E10600] inline-block text-center w-5">{c.up?.replace('Key','')?.replace('Arrow','▲')}</span> ACELERAR</p>
                    <p><span className="text-[#E10600] inline-block text-center w-5">{c.down?.replace('Key','')?.replace('Arrow','▼')}</span> TRAVAR</p>
                    <p><span className="text-[#E10600] inline-block text-center w-5">{c.left?.replace('Key','')?.replace('Arrow','◀')}</span> VIRAR <span className="text-[#E10600] inline-block text-center w-5">{c.right?.replace('Key','')?.replace('Arrow','▶')}</span></p>
                    <p><span className="text-yellow-500 inline-block text-center w-5">{c.camera?.replace('Key','')?.replace('Arrow','C')}</span> CÂMARA</p>
                 </React.Fragment>
               );
            })}
         </div>
      )}
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-28 right-4 flex flex-col gap-1 z-10 w-64">
            {liveStandings.map((entry, idx) => {
               const p = players.find(x => x.id === entry.id); if (!p) return null;
               return (
                 <div key={entry.id} className="flex items-center bg-black/80 rounded-l border-l-4 overflow-hidden shadow-lg h-8" style={{borderColor: p.color}}>
                    <span className="w-6 text-center text-white font-black text-[10px] bg-gray-900 h-full flex items-center justify-center">{idx + 1}</span>
                    <span className="flex-1 text-white font-bold text-[11px] pl-3 uppercase tracking-tighter truncate italic">{p.driverName}</span>
                    <div className="flex items-center gap-2 pr-3 h-full">
                       {entry.isFastestLap && <span className="text-purple-400 animate-pulse text-xs">⭐</span>}
                       <span className={`font-mono text-[9px] ${entry.isFastestLap ? 'text-purple-400 font-bold' : 'text-gray-400'}`}>
                          {entry.bestLapMs ? formatTime(entry.bestLapMs) : '--:--.--'}
                       </span>
                    </div>
                 </div>
               );
            })}
         </div>
      )}
      {!isSetupPhase && !raceFinished && startSequence >= 4 && (
         <div className="absolute bottom-8 right-8 w-48 h-48 bg-black/60 border-2 border-gray-800 rounded-2xl p-4 z-10 overflow-hidden">
            <svg viewBox={`${mapBounds.minX} ${mapBounds.minY} ${mapBounds.maxX - mapBounds.minX} ${mapBounds.maxY - mapBounds.minY}`} className="w-full h-full opacity-70" preserveAspectRatio="xMidYMid meet">
               <polygon points={spline.map(pt => `${pt.x},${pt.y}`).join(' ')} fill="none" stroke="#FFF" strokeWidth={(mapBounds.maxX-mapBounds.minX)*0.015} strokeLinejoin="round" />
               {players.map(p => ( <circle key={`dot-${p.id}`} id={`minimap-dot-${p.id}`} cx="0" cy="0" r={(mapBounds.maxX-mapBounds.minX)*0.025} fill={p.color} stroke="#FFF" strokeWidth={(mapBounds.maxX-mapBounds.minX)*0.008} className="transition-all duration-75 origin-center" /> ))}
            </svg>
         </div>
      )}
      {!raceFinished && ( <button onClick={() => onBackToMenu([], 'quit')} className="fixed top-4 right-4 bg-red-600 text-white font-bold px-4 py-2 hover:bg-red-700 z-50 rounded-lg">DESISTIR</button> )}
      {raceFinished && (() => {
        let currentRes: RaceResultEntry[] = [];
        if (finalClassification) {
            currentRes = finalClassification;
        } else if (isHost) {
            // ROBUST CLASSIFICATION: Priority 1: Finished by time. Priority 2: Unfinished by progression.
            const sorted = [...carsRef.current].sort((a,b) => {
                 if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
                 if (a.finishTime !== null) return -1;
                 if (b.finishTime !== null) return 1;
                 const scoreA = (a.laps * 1000000) + a.currentWaypoint;
                 const scoreB = (b.laps * 1000000) + b.currentWaypoint;
                 return scoreB - scoreA;
            });
            currentRes = sorted.map((c, i) => {
               const pDef = players.find(p => p.id === c.id);
               const F1_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
               return { 
                 playerId: c.id, 
                 position: i + 1, 
                 driverName: pDef?.driverName || (c.isBot ? 'BOT' : 'P'+c.id), 
                 teamName: pDef?.teamName || 'Independente', 
                 color: c.color, 
                 color2: c.color2, 
                 totalTimeMs: c.finishTime, 
                 bestLapMs: c.bestLapTime || null, 
                 pointsEarned: (i < 10 ? F1_PTS[i] : 0), 
                 totalChampionshipPoints: (championshipStandings[c.id] || 0) + (i < 10 ? F1_PTS[i] : 0) 
               };
            });
            setFinalClassification(currentRes);
            socket.emit('host_race_results', currentRes);
        } else {
            return <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/80"><div className="text-white text-3xl font-black italic animate-pulse">A SICRONIZAR RESULTADOS FIDEDIGNOS COM A FIA...</div></div>;
        }
        return ( <RaceResults results={currentRes} isHost={isHost} hasNextTrack={hasNextTrack} onNextTrack={() => onBackToMenu(currentRes, 'next')} onFinishEvent={() => onBackToMenu(currentRes, 'finish')} /> );
      })()}
    </div>
  );
}
