import React, { useEffect, useRef, useState } from 'react';
import { PlayerConfig, getSetupFromSpeed } from '../types';
import { TrackDef, computeSpline, getTrackTelemetry } from '../tracks';
import { audio } from '../audio';
import { updateCarPhysics, CarPhysics } from '../physics';
import { drawTrack, drawEnvironments, drawF1Car, drawBridges3D } from '../renderer';
import { drawAllTrackProps } from '../trackProps';
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
  const [cameraModeUI, setCameraModeUI] = useState<'CHASE' | 'CENTRAL' | 'DYNAMIC'>('CHASE');
  const [zoomHeightMode, setZoomHeightMode] = useState<'HIGH' | 'MAX' | 'STANDARD'>('HIGH');
  const zoomHeightModeRef = useRef<'HIGH' | 'MAX' | 'STANDARD'>('HIGH');

  const cycleCameraMode = () => {
    const modes: ('CHASE' | 'CENTRAL' | 'DYNAMIC')[] = ['CHASE', 'CENTRAL', 'DYNAMIC'];
    const curIdx = modes.indexOf(cameraModeRef.current);
    const next = modes[(curIdx + 1) % modes.length];
    cameraModeRef.current = next;
    setCameraModeUI(next);
    const labels: Record<string, string> = {
      'CHASE': 'Atrás do Carro',
      'CENTRAL': 'Vista de Topo',
      'DYNAMIC': 'Dinâmica'
    };
    setCamToast(labels[next]);
    if (camToastTimeoutRef.current) clearTimeout(camToastTimeoutRef.current);
    camToastTimeoutRef.current = setTimeout(() => setCamToast(null), 2000);
  };

  const cycleZoomMode = () => {
    const modes: ('HIGH' | 'MAX' | 'STANDARD')[] = ['HIGH', 'MAX', 'STANDARD'];
    const curIdx = modes.indexOf(zoomHeightModeRef.current);
    const next = modes[(curIdx + 1) % modes.length];
    zoomHeightModeRef.current = next;
    setZoomHeightMode(next);
    const labels: Record<string, string> = {
      'HIGH': 'Altitude Elevada (Curvas Visíveis)',
      'MAX': 'Altitude Máxima (Vista Aérea)',
      'STANDARD': 'Altitude Média'
    };
    setCamToast(labels[next]);
    if (camToastTimeoutRef.current) clearTimeout(camToastTimeoutRef.current);
    camToastTimeoutRef.current = setTimeout(() => setCamToast(null), 2000);
  };
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const hasTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
      const isMobileUA = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isNarrow = typeof window !== 'undefined' && window.innerWidth < 1024;
      setIsMobileDevice(Boolean(isMobileUA || (hasTouch && isNarrow)));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [touchActive, setTouchActive] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false
  });

  const handleTouchControl = (dir: 'up' | 'down' | 'left' | 'right', isPressed: boolean) => {
    setTouchActive(prev => ({ ...prev, [dir]: isPressed }));
    const localPlayer = players.find(p => !p.isBot && p.isLocal) || players[0];
    const keyMap = {
      up: localPlayer?.controls?.up || 'ArrowUp',
      down: localPlayer?.controls?.down || 'ArrowDown',
      left: localPlayer?.controls?.left || 'ArrowLeft',
      right: localPlayer?.controls?.right || 'ArrowRight'
    };
    const key = keyMap[dir];
    if (key) {
      keysRef.current[key] = isPressed;
    }
  };
  const [camToast, setCamToast] = useState<string | null>(null);
  const camToastTimeoutRef = useRef<any>(null);

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
  const cameraModeRef = useRef<'CHASE' | 'CENTRAL' | 'DYNAMIC'>('CHASE');
  const chaseAngleRef = useRef<number>(0);
  const quadOffsetRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  const skidMarksRef = useRef<{x: number, y: number, a: number, w: number}[]>([]);
  const camAngleRef = useRef<number>(0);
  const lastEmitRef = useRef<number>(0);
  const lastBotsEmitRef = useRef<number>(0);
  
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

  // Standings updated in physics loop now


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
    if (isHost) return;
    const onRemoteBotsTick = (bots: any[]) => {
        if (!Array.isArray(bots)) return;
        bots.forEach(b => {
            const car = carsRef.current.find(c => String(c.id) === String(b.id));
            if (car && car.isBot) {
                if (!car.remoteTarget) {
                    car.remoteTarget = { x: b.x, y: b.y, a: b.a };
                } else {
                    car.remoteTarget.x = b.x;
                    car.remoteTarget.y = b.y;
                    car.remoteTarget.a = b.a;
                }
                if (Math.hypot(car.x - b.x, car.y - b.y) > 250) {
                    car.x = b.x;
                    car.y = b.y;
                    car.angle = b.a;
                }
                car.vx = b.vx || 0;
                car.vy = b.vy || 0;
                if (b.laps !== undefined) car.laps = b.laps;
                if (b.ft !== undefined) car.finishTime = b.ft;
                if (b.cw !== undefined) car.currentWaypoint = b.cw;
                if (b.bl !== undefined) car.bestLapTime = b.bl;
                if (b.d !== undefined) car.damage = b.d;
            }
        });
    };
    socket.on('remote_bots_tick', onRemoteBotsTick);
    return () => { socket.off('remote_bots_tick', onRemoteBotsTick); };
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
     const onAllSetupReady = () => { setIsSetupPhase(false); setStartSequence(1); audio.playStartSequence(); setForceRender(Date.now()); };
     socket.on('all_setup_ready', onAllSetupReady);
     return () => { socket.off('all_setup_ready', onAllSetupReady); };
  }, []);

     useEffect(() => {
      const onLobbyState = (state: any[]) => {
         carsRef.current.forEach((car, carIndex) => {
            if (!car.isBot && !car.isLocal) {
               const stillInRoom = state.some(p => String(p.socketId) === String(car.id));
               if (!stillInRoom && car.finishTime === null) car.givenUp = true;
            }
         });
      };
      socket.on('lobby_state', onLobbyState);
      return () => { socket.off('lobby_state', onLobbyState); };
   }, []);

   useEffect(() => {
     if (isSetupPhase) return;
     const onRemoteTick = (data: any) => {
        const car = carsRef.current.find(c => String(c.id) === String(data.id));
        if (car && !car.isLocal && !car.isBot) {
           if (!car.remoteTarget) {
               car.remoteTarget = { x: data.x, y: data.y, a: data.a };
           } else {
               car.remoteTarget.x = data.x;
               car.remoteTarget.y = data.y;
               car.remoteTarget.a = data.a;
           }
           if (Math.hypot(car.x - data.x, car.y - data.y) > 250) {
               car.x = data.x;
               car.y = data.y;
               car.angle = data.a;
           }
           car.vx = data.vx || 0;
           car.vy = data.vy || 0;
           car.steer = data.s || 0;
           car.brake = data.b || 0;
           car.throttle = data.t || 0;
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
       if (cameraKeys.includes(e.code)) {
          cycleCameraMode();
       }
       if (e.code === 'KeyZ' || e.code === 'KeyV') {
          cycleZoomMode();
       }
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
    canvasRef.current.width = window.innerWidth; canvasRef.current.height = window.innerHeight;    const handleResize = () => {      if (canvasRef.current) {        canvasRef.current.width = window.innerWidth;        canvasRef.current.height = window.innerHeight;      }    };    window.addEventListener('resize', handleResize);    let animationFrameId: number; let lastTime = performance.now();
    const pitSpline = (rawTrack?.pitNodes && rawTrack.pitNodes.length > 0) ? rawTrack.pitNodes : null;

    const update = (time: number) => {
      if (!spline || spline.length === 0) return;
      let dt = (time - lastTime) / 1000;
      if (dt < 0) dt = 0; if (dt > 0.1) dt = 0.016; lastTime = time;
      const now = Date.now();
      try {
        if (startSequence >= 4) {
          carsRef.current.forEach((car, carIndex) => {
          const isFinished = car.finishTime !== null;
          if (isFinished) {
              car.vx = 0; car.vy = 0; car.angularVelocity = 0; car.throttle = 0; car.brake = 1;
          }
          
          let surface: 'TRACK' | 'CURB' | 'CURB_WIDE' | 'CURB_APEX' | 'GRASS' = 'TRACK';
          let closestIndex = car.currentWaypoint;
          let isInPitLane = false;
          const speed_val = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
          
          if (!isFinished) {
              let minSplineDistSq = Infinity;
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
            if (isHost) {
              const lookA = Math.floor(10 + (speed_val / 15)); 
              let tArr = spline, myIdx = closestIndex, useL = true;
              if (isInPitLane && pitSpline) { tArr = pitSpline; useL = false; let mD = Infinity; for (let i=0; i<pitSpline.length; i++) { const dSq = (car.x-pitSpline[i].x)**2 + (car.y-pitSpline[i].y)**2; if (dSq < mD) { mD=dSq; myIdx=i; } } }
              const tIdx = useL ? (myIdx + lookA) % tArr.length : Math.min(myIdx + lookA, tArr.length - 1);
              const rawT = tArr[tIdx] || { x: 0, y: 0 };
              const tAngle = Math.atan2(rawT.y - car.y, rawT.x - car.x); let aD = Math.atan2(Math.sin(tAngle-car.angle), Math.cos(tAngle-car.angle));
              car.steer = Math.max(-1, Math.min(1, aD * Math.max(1.5, 4.0 - (speed_val/120))));
              const sSpd = (surface==='GRASS') ? car.maxSpeed*0.3 : car.maxSpeed * Math.max(0.2, 1.0 - (Math.max(0, Math.abs(aD)-0.05)*3.5));
              if (speed_val < sSpd - 5) car.throttle = 1.0; else if (speed_val > sSpd + 15) car.brake = Math.min(1, (speed_val-sSpd)/100);
            } else if (car.remoteTarget) {
              // Dead reckoning for remote bots on client
              car.remoteTarget.x += car.vx * dt;
              car.remoteTarget.y += car.vy * dt;
              const lerpRate = Math.min(1, dt * 15);
              car.x += (car.remoteTarget.x - car.x) * lerpRate;
              car.y += (car.remoteTarget.y - car.y) * lerpRate;
              let ad = Math.atan2(Math.sin(car.remoteTarget.a-car.angle), Math.cos(car.remoteTarget.a-car.angle));
              car.angle += ad * lerpRate;
            }
          } else if (car.isLocal) {
            if (car.controls) { if (keysRef.current[car.controls.up]) car.throttle = (surface === 'GRASS' ? 0.4 : 1.0); if (keysRef.current[car.controls.down]) car.brake = 1.0; const sL = Math.max(0.70, 1.0 - (speed_val/1200)); if (keysRef.current[car.controls.left]) car.steer = -sL; if (keysRef.current[car.controls.right]) car.steer = sL; }
          } else if (car.remoteTarget) {
            // Dead reckoning for remote players
            car.remoteTarget.x += car.vx * dt;
            car.remoteTarget.y += car.vy * dt;
            const lerpRate = Math.min(1, dt * 15);
            car.x += (car.remoteTarget.x - car.x) * lerpRate;
            car.y += (car.remoteTarget.y - car.y) * lerpRate;
            let ad = Math.atan2(Math.sin(car.remoteTarget.a-car.angle), Math.cos(car.remoteTarget.a-car.angle));
            car.angle += ad * lerpRate;
          }

          if (surface === 'GRASS') { car.damage = Math.min(90, car.damage + 0.01); if (speed_val > car.maxSpeed * 0.6) { car.vx *= 0.98; car.vy *= 0.98; } }
          if (isInPitLane && pitSpline && closestPitIndex >= 0) {
            const pitN = pitSpline[closestPitIndex]; const pitM = pitSpline[pitSpline.length-1].distFromStart || 0;
            if (pitN.distFromStart! > 1000 && pitN.distFromStart! < pitM - 1000) {
                const lim = car.maxSpeed * 0.4; if (speed_val > lim) { car.throttle = 0; car.brake = 1.0; if (speed_val > lim*1.2) { car.vx *= 0.95; car.vy *= 0.95; } }
                if (pitN.distFromStart! > 1000 + (pitM-2000)*0.4 && pitN.distFromStart! < 1000 + (pitM-2000)*0.6) { car.damage = 0; car.tireHealth = 100; }
            }
          }
          
          carsRef.current.forEach((other, otherIdx) => { if (otherIdx > carIndex) { const tD = Math.abs(car.currentWaypoint - other.currentWaypoint); if (!(tD > 500 && tD < spline.length-500)) { const dx = other.x-car.x, dy = other.y-car.y, d = Math.sqrt(dx*dx+dy*dy); if (d < 40 && d > 0.1) { const nx = dx/d, ny = dy/d, rV = {x: car.vx-other.vx, y: car.vy-other.vy}; if (Math.abs(rV.x*nx+rV.y*ny) > 200) { car.damage = Math.min(90, car.damage+5); other.damage = Math.min(90, other.damage+5); } const push=(40-d)*0.5; car.x-=nx*push; car.y-=ny*push; other.x+=nx*push; other.y+=ny*push; if (rV.x*nx+rV.y*ny > 0) { const imp = 0.75 * (rV.x*nx+rV.y*ny); car.vx-=imp*nx; car.vy-=imp*ny; other.vx+=imp*nx; other.vy+=imp*ny; } } } } });

           if (!isFinished && (car.isLocal || (car.isBot && isHost))) {
              updateCarPhysics(car, dt, surface);
              if (car.isLocal && socket.connected && now - lastEmitRef.current > 50) {
                  socket.emit('player_tick', { id: String(car.id), x: car.x, y: car.y, a: car.angle, vx: car.vx, vy: car.vy, s: car.steer, b: car.brake, t: car.throttle, laps: car.laps, ft: car.finishTime, cw: car.currentWaypoint, bl: car.bestLapTime });
                  lastEmitRef.current = now;
              }
           }
          } // CLOSE if (!isFinished) started at 298

          const speed_val_final = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
          audio.updateEngine(car.id, speed_val_final * 0.36, car.throttle, car.isBot);

          if (!isFinished && (car.isLocal || (car.isBot && isHost))) {
              if (speed_val_final > 100 && car.isSkidding) { skidMarksRef.current.push({ x: car.x, y: car.y, a: car.angle, w: 22 }); if (skidMarksRef.current.length > 3000) skidMarksRef.current.shift(); }
              if (closestIndex > car.currentWaypoint && closestIndex < car.currentWaypoint + 400) car.currentWaypoint = closestIndex;
              if ((closestIndex < spline.length * 0.1 || closestIndex < 30) && car.currentWaypoint > spline.length * 0.7) {
                 car.laps++; car.currentWaypoint = 0;
                 if (car.laps > 0 && car.currentLapStartTime) {
                    const lapT = now - car.currentLapStartTime; car.lastLapTime = lapT; if (!car.bestLapTime || lapT < car.bestLapTime) car.bestLapTime = lapT;
                    if (lapT < globalBestLapRef.current) { globalBestLapRef.current = lapT; const pD = players.find(p => String(p.id) === String(car.id)); setFastLapPopup({ name: pD?.driverName || (car.isBot ? 'BOT' : 'P'+car.id), time: formatTime(lapT), color: car.color, isInitial: false }); setTimeout(() => setFastLapPopup(null), 4000); }
                 }
                 car.currentLapStartTime = now;
                 if (car.laps >= Number(totalLaps) && Number(totalLaps) > 0 && car.finishTime === null) { 
                    car.finishTime = now - startTimeRef.current; 
                    if (!car.isBot && !car.scorePosted) { 
                        car.scorePosted = true; 
                        if (car.bestLapTime) submitLapTime(car.bestLapTime); 
                        else submitLapTime(car.finishTime / totalLaps);
                    } 
                 }
              }
          }
        });

         if (carsRef.current.some(c => c.finishTime !== null) && firstFinishTimeRef.current === null) { firstFinishTimeRef.current = now; audio.playVictory(); }
         
         const activeMans = carsRef.current.filter(c => !c.isBot);
         const humansFinished = activeMans.length > 0 && activeMans.every(c => c.finishTime !== null || c.givenUp);
         
          // HOST BOTS BROADCAST (Throttled 50ms)
          if (isHost && socket.connected && now - lastBotsEmitRef.current > 50) {
              lastBotsEmitRef.current = now;
              const botsData = carsRef.current.filter(c => c.isBot).map(c => ({
                  id: c.id,
                  x: c.x,
                  y: c.y,
                  a: c.angle,
                  vx: c.vx,
                  vy: c.vy,
                  laps: c.laps,
                  ft: c.finishTime,
                  cw: c.currentWaypoint,
                  bl: c.bestLapTime,
                  d: c.damage
              }));
              if (botsData.length > 0) {
                  socket.emit('host_bots_tick', botsData);
              }
          }

         // HOST SAFETY TIMEOUT
                   // HOST STANDINGS BROADCAST (Throttled 500ms)
          const lastStandingsEmit = carsRef.current.lastStandingsEmit || 0;
          if (isHost && now - lastStandingsEmit > 500) {
              carsRef.current.lastStandingsEmit = now;
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

          // LOCAL SAFETY TIMER: Starts for everyone when the race winner finishes
          if (!raceFinished) {
            // Trigger grace period as soon as ANY car (bot or human) completes the race
            const anyoneFinished = carsRef.current.some(c => c.finishTime !== null);
            if (anyoneFinished && raceGraceEndTimeRef.current === null) {
                raceGraceEndTimeRef.current = now + 25000; // 25s grace period
            }
            if (raceGraceEndTimeRef.current !== null && now > raceGraceEndTimeRef.current) {
                console.log("SAFETY TIMEOUT - FORCING END");
                setRaceFinished(true);
            }
         }

         if (isHost && humansFinished && !raceFinished) {
             if (allHumansFinishedTimeRef.current === null) allHumansFinishedTimeRef.current = now;
             else if (now - allHumansFinishedTimeRef.current > 5000) setRaceFinished(true);
         }
       }
      } catch (e: any) { console.error("F1 PHYSICS ENGINE CRASH:", e); }

      const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
      GAME_WIDTH = canvasRef.current.width; GAME_HEIGHT = canvasRef.current.height;
      const mainCar = carsRef.current.find(c => c.isLocal) || carsRef.current.find(c => !c.isBot) || carsRef.current[0] || { x:0,y:0,vx:0,vy:0,angle:0,currentWaypoint:0 };
      const spd = Math.sqrt(mainCar.vx**2 + mainCar.vy**2);
      // Altitude da câmara elevada para máxima visibilidade das curvas
      const isMobile = typeof window !== 'undefined' && (window.innerWidth < 1024 || window.innerHeight < 600);
      let baseScale = 0.72;
      let minScale = 0.52;
      if (zoomHeightModeRef.current === 'MAX') {
        baseScale = isMobile ? 0.46 : 0.56;
        minScale = isMobile ? 0.34 : 0.40;
      } else if (zoomHeightModeRef.current === 'STANDARD') {
        baseScale = isMobile ? 0.78 : 0.95;
        minScale = isMobile ? 0.60 : 0.72;
      } else {
        // 'HIGH' (Default elevado - curvas e traçado bem visíveis à frente)
        baseScale = isMobile ? 0.60 : 0.72;
        minScale = isMobile ? 0.44 : 0.52;
      }
      const targetScale = raceFinished ? minScale : Math.max(minScale, baseScale - (spd / 1200) * 0.20);
      
      let lookA = mainCar.angle;
      if (spline && spline.length > 0) { const fIdx = (mainCar.currentWaypoint + Math.min(25, Math.floor(spd / 40) + 5)) % spline.length; const fN = spline[fIdx]; if (fN) { lookA = Math.atan2(fN.y-mainCar.y, fN.x-mainCar.x); if (Math.cos(lookA)*Math.cos(mainCar.angle)+Math.sin(lookA)*Math.sin(mainCar.angle) < -0.5) lookA += Math.PI; } }
      let aDiff = Math.atan2(Math.sin(lookA-camAngleRef.current), Math.cos(lookA-camAngleRef.current)); if (spd > 2) camAngleRef.current += aDiff * 0.05;

      let offX = 0, offY = 0;
      if (cameraModeRef.current === 'DYNAMIC' && startSequence >= 4) {
        offX = -Math.cos(camAngleRef.current)*(Math.min(1, spd/1000)*GAME_WIDTH*0.35);
        offY = -Math.sin(camAngleRef.current)*(Math.min(1, spd/1000)*GAME_HEIGHT*0.35);
      }
      
      if (!cameraRef.current) cameraRef.current = { x: mainCar.x, y: mainCar.y, scale: baseScale };
      cameraRef.current.x += (mainCar.x - cameraRef.current.x) * 0.3;
      cameraRef.current.y += (mainCar.y - cameraRef.current.y) * 0.3;
      cameraRef.current.scale += (targetScale - cameraRef.current.scale) * 0.06;
      quadOffsetRef.current.x += (offX - quadOffsetRef.current.x) * 0.05;
      quadOffsetRef.current.y += (offY - quadOffsetRef.current.y) * 0.05;

      let camRot = 0;
      let anchorX = GAME_WIDTH / 2;
      let anchorY = GAME_HEIGHT / 2;

      if (cameraModeRef.current === 'CHASE') {
        if (startSequence < 2) {
          chaseAngleRef.current = mainCar.angle;
        } else {
          const aDiffChase = Math.atan2(Math.sin(mainCar.angle - chaseAngleRef.current), Math.cos(mainCar.angle - chaseAngleRef.current));
          chaseAngleRef.current += aDiffChase * 0.12;
        }
        camRot = -chaseAngleRef.current - Math.PI / 2;
        // Posicionar o carro a 80% da altura do ecrã: 80% de visão à frente da pista e 20% atrás
        anchorY = Math.min(GAME_HEIGHT - 70, GAME_HEIGHT * 0.82);
      } else if (cameraModeRef.current === 'DYNAMIC' && startSequence >= 4) {
        anchorX += quadOffsetRef.current.x;
        anchorY += quadOffsetRef.current.y;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = '#315722'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.save();
      ctx.translate(Math.round(anchorX), Math.round(anchorY));
      if (camRot !== 0) ctx.rotate(camRot);
      ctx.scale(cameraRef.current.scale, cameraRef.current.scale);
      ctx.translate(Math.round(-cameraRef.current.x), Math.round(-cameraRef.current.y));
      drawTrack(ctx, spline, pitSpline, false); drawEnvironments(ctx, spline, pitSpline, false); drawAllTrackProps(ctx, track.props, "ground");
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
          const c = carsRef.current.find(x => String(x.id) === String(p.id)); 
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
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
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
            {localSetupReady ? (
               <div className="flex flex-col items-center gap-3">
                  <div className="px-12 py-5 bg-gray-800 text-gray-400 font-black text-2xl animate-pulse rounded-xl">
                     A AGUARDAR ADVERSÁRIO...
                  </div>
                  {isHost && (
                     <button
                        onClick={() => socket.emit('force_start_countdown')}
                        className="text-xs text-yellow-400 hover:text-yellow-300 underline font-bold uppercase tracking-widest cursor-pointer"
                     >
                        Forçar Início da Corrida ➔
                     </button>
                  )}
               </div>
            ) : (
               <button
                  onClick={() => {
                     if (players.some(p => !p.isBot && !p.isLocal)) {
                        setLocalSetupReady(true);
                        socket.emit('setup_ready');
                     } else {
                        setIsSetupPhase(false);
                        setStartSequence(1);
                     }
                  }}
                  className="px-12 py-5 bg-green-600 hover:bg-green-500 text-white font-black text-3xl italic rounded-xl shadow-lg cursor-pointer"
               >
                  IR PARA A PISTA
               </button>
            )}
          </div>
       )}
       {fastLapPopup && !raceFinished && startSequence >= 4 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-black/90 backdrop-blur-md px-3 py-1 rounded-full border border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-in fade-in duration-200 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
          <span className="text-[9px] font-black uppercase text-purple-400 tracking-wider">VOLTA RÁPIDA</span>
          <span className="text-[10px] font-bold text-white uppercase truncate max-w-[80px]">{fastLapPopup.name}</span>
          <span className="text-[10px] font-mono font-black text-yellow-300 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-500/30">{fastLapPopup.time}</span>
        </div>
      )}
       
       {raceEndCountdown !== null && !raceFinished && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center">
             <div className="bg-red-600/90 text-white font-black italic tracking-tighter text-4xl px-12 py-4 rounded-xl shadow-[0_0_50px_rgba(225,6,0,0.5)] border-2 border-white/20 animate-bounce">
                A CONCLUIR PROVA EM {raceEndCountdown}s
             </div>
             <p className="text-white/50 font-bold uppercase tracking-widest text-[10px] mt-3">A FIA está a encerrar a sessão devido ao tempo limite</p>
          </div>
       )}

       {!isSetupPhase && !finalClassification && startSequence >= 4 && (
         <div className="absolute top-24 sm:top-28 md:top-auto md:bottom-12 left-4 md:left-8 flex flex-col gap-2 z-10 pointer-events-none scale-90 sm:scale-100 origin-top-left">
            {players.filter(p => !p.isBot && p.isLocal).map(p => ( 
               <div key={p.id} className="bg-black/80 border-l-4 p-4 rounded-r-xl w-72 shadow-2xl flex flex-col border-white/20" style={{borderLeftColor: p.color}}>
                  <div className="flex items-center gap-2 mb-1">
                     <span className="w-3 h-3 rounded-full animate-pulse" style={{backgroundColor: p.color}}></span>
                     <span className="text-white font-black text-2xl italic uppercase tracking-tighter">{p.driverName || 'DRIVER'}</span>
                  </div>
                  <div className="flex justify-between items-end">
                     <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold uppercase mb-[-4px]">Live Time</span>
                        <span id={`hud-time-${p.id}`} className="text-yellow-400 font-mono text-2xl tabular-nums">00:00.00</span>
                     </div>
                     <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-400 font-bold uppercase mb-[-4px]">Volta</span>
                        <span id={`hud-lap-${p.id}`} className="text-white font-black text-2xl italic">1 <span className="text-gray-500 text-sm">/ {totalLaps}</span></span>
                     </div>
                  </div>
               </div> 
            ))}
         </div>
      )}

      {!isSetupPhase && !finalClassification && startSequence >= 4 && (
         <div className="absolute top-16 right-4 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/20 shadow-2xl z-10 pointer-events-none w-48 transition-all">
             {players.filter(p => !p.isBot && p.isLocal).slice(0, 1).map(p => {
                const ctrls: any = p.controls || {};
                const c = {
                    up: (ctrls.up || 'ArrowUp').replace('Key','').replace('Arrow','▲'),
                    down: (ctrls.down || 'ArrowDown').replace('Key','').replace('Arrow','▼'),
                    left: (ctrls.left || 'ArrowLeft').replace('Key','').replace('Arrow','◀'),
                    right: (ctrls.right || 'ArrowRight').replace('Key','').replace('Arrow','▶'),
                    camera: (ctrls.camera || 'KeyC').replace('Key','').replace('Arrow','C')
                };
                return (
                  <div key="controls-hint" className="grid grid-cols-2 gap-x-2 gap-y-3">
                     <div className="flex items-center gap-2">
                        <kbd className="w-8 h-8 rounded bg-white text-black font-black flex items-center justify-center text-sm shadow-[0_2px_0_#ccc] uppercase">{c.up}</kbd>
                        <span className="text-[8px] font-black text-white uppercase italic tracking-tighter">GAS</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <kbd className="w-8 h-8 rounded bg-[#E10600] text-white font-black flex items-center justify-center text-sm shadow-[0_2px_0_#900] uppercase">{c.down}</kbd>
                        <span className="text-[8px] font-black text-white uppercase italic tracking-tighter">STOP</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="flex bg-white/10 rounded p-0.5 border border-white/10 gap-0.5">
                           <kbd className="w-6 h-7 rounded bg-white text-black font-black flex items-center justify-center text-[10px] uppercase">{c.left}</kbd>
                           <kbd className="w-6 h-7 rounded bg-white text-black font-black flex items-center justify-center text-[10px] uppercase">{c.right}</kbd>
                        </div>
                        <span className="text-[8px] font-black text-white uppercase italic tracking-tighter">TURN</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <kbd className="w-8 h-8 rounded bg-yellow-400 text-black font-black flex items-center justify-center text-sm shadow-[0_2px_0_#b80] uppercase">{c.camera}</kbd>
                        <span className="text-[8px] font-black text-white uppercase italic tracking-tighter">{`CAM (${cameraModeUI === 'CHASE' ? 'ATRÁS' : cameraModeUI === 'CENTRAL' ? 'FIXO' : 'DINÂMICO'})`}</span>
                     </div>
                  </div>
                );
             })}
         </div>
      )}
      {!isSetupPhase && !finalClassification && startSequence >= 4 && liveStandings.length > 0 && (() => {
         const mainCar = carsRef.current.find(c => c.isLocal) || carsRef.current.find(c => !c.isBot) || carsRef.current[0];
         const mainCarId = mainCar?.id;
         const myIdx = liveStandings.findIndex(entry => String(entry.id) === String(mainCarId));
         const safeIdx = myIdx >= 0 ? myIdx : 0;
         
         let startIdx = safeIdx - 1;
         if (safeIdx === 0) {
            startIdx = 0;
         } else if (safeIdx >= liveStandings.length - 1) {
            startIdx = Math.max(0, liveStandings.length - 3);
         }
         const displayed = liveStandings.slice(startIdx, startIdx + 3);

         return (
            <div className="absolute top-14 right-3 z-20 flex flex-col gap-1 w-32 sm:w-40 select-none pointer-events-none">
               {displayed.map((entry) => {
                  const p = players.find(x => String(x.id) === String(entry.id));
                  if (!p) return null;
                  const posIndex = liveStandings.findIndex(e => String(e.id) === String(entry.id)) + 1;
                  const isMe = String(entry.id) === String(mainCarId);
                  
                  return (
                     <div 
                        key={entry.id} 
                        className={`flex items-center h-5 sm:h-6 rounded overflow-hidden shadow backdrop-blur-md border ${
                           isMe ? 'bg-black/95 border-yellow-400 font-black' : 'bg-black/75 border-white/10'
                        }`}
                     >
                        <span 
                           className={`w-5 sm:w-6 h-full flex items-center justify-center text-[9px] sm:text-[10px] font-black ${
                              isMe ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-white'
                           }`}
                        >
                           {posIndex}
                        </span>
                        <div className="w-1.5 h-full" style={{ backgroundColor: p.color }}></div>
                        <span className={`flex-1 pl-1 text-[9px] sm:text-[10px] uppercase truncate ${isMe ? 'text-yellow-300 font-black' : 'text-white font-medium'}`}>
                           {p.driverName} {isMe ? '★' : ''}
                        </span>
                        {entry.isFastestLap && <span className="text-purple-400 text-[9px] pr-1 animate-pulse">🟣</span>}
                     </div>
                  );
               })}
            </div>
         );
      })()}
      {!isSetupPhase && (
         <div className="absolute top-3 left-3 z-10 p-1 bg-black/60 backdrop-blur-md rounded-xl border border-white/20 shadow-md overflow-hidden" style={{ width: 88, height: 88 }}>
            <svg viewBox={`${mapBounds.minX} ${mapBounds.minY} ${mapBounds.maxX - mapBounds.minX} ${mapBounds.maxY - mapBounds.minY}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
               <polygon points={spline.map(pt => `${pt.x},${pt.y}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={(mapBounds.maxX-mapBounds.minX)*0.04} strokeLinejoin="round" />
               <polygon points={spline.map(pt => `${pt.x},${pt.y}`).join(' ')} fill="none" stroke="#FFF" strokeWidth={(mapBounds.maxX-mapBounds.minX)*0.015} strokeLinejoin="round" opacity="0.8" />
               {players.map(p => ( <circle key={`dot-${p.id}`} id={`minimap-dot-${p.id}`} cx="0" cy="0" r={(mapBounds.maxX-mapBounds.minX)*0.035} fill={p.color} stroke="#FFF" strokeWidth={(mapBounds.maxX-mapBounds.minX)*0.01} className="transition-all duration-75 origin-center shadow-lg" /> ))}
            </svg>
         </div>
      )}
       {camToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-yellow-400 text-black font-black px-6 py-2 rounded-full uppercase tracking-widest text-sm shadow-2xl z-[70] animate-bounce border-2 border-black flex items-center gap-2 pointer-events-none">
             <span>🎥</span>
             <span>CÂMARA: {camToast}</span>
          </div>
       )}
      
      {/* CONTROLOS T�TEIS PARA TELEM�VEL */}
      {!isSetupPhase && !raceFinished && isMobileDevice && (
        <>
          {/* ESQUERDA: Cima / Baixo (2 quadrados colados na vertical com as setas) - Só em Mobile */}
          <div className="fixed bottom-6 left-6 z-40 select-none touch-none flex flex-col items-center md:hidden">
            <div className="flex flex-col bg-black/80 backdrop-blur-md rounded-2xl border-2 border-white/25 overflow-hidden shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
              {/* Bot�o Cima */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); handleTouchControl('up', true); }}
                onPointerUp={(e) => { e.preventDefault(); handleTouchControl('up', false); }}
                onPointerLeave={(e) => { e.preventDefault(); handleTouchControl('up', false); }}
                onPointerCancel={(e) => { e.preventDefault(); handleTouchControl('up', false); }}
                className={`w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center border-b border-white/15 transition-all active:scale-95 ${
                  touchActive.up 
                    ? 'bg-[#E10600] text-white shadow-inner' 
                    : 'bg-white/5 text-gray-200 active:bg-[#E10600] active:text-white'
                }`}
                aria-label="Acelerar"
              >
                <svg className="w-8 h-8 sm:w-9 sm:h-9 fill-current" viewBox="0 0 24 24">
                  <path d="M12 4l-8 8h5v8h6v-8h5z" />
                </svg>
                <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">ACELERAR</span>
              </button>

              {/* Bot�o Baixo */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); handleTouchControl('down', true); }}
                onPointerUp={(e) => { e.preventDefault(); handleTouchControl('down', false); }}
                onPointerLeave={(e) => { e.preventDefault(); handleTouchControl('down', false); }}
                onPointerCancel={(e) => { e.preventDefault(); handleTouchControl('down', false); }}
                className={`w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center transition-all active:scale-95 ${
                  touchActive.down 
                    ? 'bg-[#E10600] text-white shadow-inner' 
                    : 'bg-white/5 text-gray-200 active:bg-[#E10600] active:text-white'
                }`}
                aria-label="Travar"
              >
                <svg className="w-8 h-8 sm:w-9 sm:h-9 fill-current" viewBox="0 0 24 24">
                  <path d="M12 20l8-8h-5V4h-6v8H4z" />
                </svg>
                <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">TRAVAR</span>
              </button>
            </div>
          </div>

          {/* DIREITA: Esquerda / Direita (2 quadrados colados na horizontal com as setas) - Só em Mobile */}
          <div className="fixed bottom-6 right-6 z-40 select-none touch-none flex items-center md:hidden">
            <div className="flex flex-row bg-black/80 backdrop-blur-md rounded-2xl border-2 border-white/25 overflow-hidden shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
              {/* Bot�o Esquerda */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); handleTouchControl('left', true); }}
                onPointerUp={(e) => { e.preventDefault(); handleTouchControl('left', false); }}
                onPointerLeave={(e) => { e.preventDefault(); handleTouchControl('left', false); }}
                onPointerCancel={(e) => { e.preventDefault(); handleTouchControl('left', false); }}
                className={`w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center border-r border-white/15 transition-all active:scale-95 ${
                  touchActive.left 
                    ? 'bg-[#E10600] text-white shadow-inner' 
                    : 'bg-white/5 text-gray-200 active:bg-[#E10600] active:text-white'
                }`}
                aria-label="Virar � Esquerda"
              >
                <svg className="w-8 h-8 sm:w-9 sm:h-9 fill-current" viewBox="0 0 24 24">
                  <path d="M4 12l8-8v5h8v6h-8v5z" />
                </svg>
                <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">ESQ</span>
              </button>

              {/* Bot�o Direita */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); handleTouchControl('right', true); }}
                onPointerUp={(e) => { e.preventDefault(); handleTouchControl('right', false); }}
                onPointerLeave={(e) => { e.preventDefault(); handleTouchControl('right', false); }}
                onPointerCancel={(e) => { e.preventDefault(); handleTouchControl('right', false); }}
                className={`w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center transition-all active:scale-95 ${
                  touchActive.right 
                    ? 'bg-[#E10600] text-white shadow-inner' 
                    : 'bg-white/5 text-gray-200 active:bg-[#E10600] active:text-white'
                }`}
                aria-label="Virar � Direita"
              >
                <svg className="w-8 h-8 sm:w-9 sm:h-9 fill-current" viewBox="0 0 24 24">
                  <path d="M20 12l-8 8v-5H4v-6h8V4z" />
                </svg>
                <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">DIR</span>
              </button>
            </div>
          </div>
        </>
      )}

      {!raceFinished && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5">
          {/* Botão Ícone de Modo de Câmara */}
          <button
            type="button"
            onClick={cycleCameraMode}
            className="w-8 h-8 rounded-full bg-black/80 hover:bg-black text-yellow-400 border border-yellow-500/40 shadow-md flex items-center justify-center transition-all active:scale-90"
            title={`Câmara: ${cameraModeUI === 'CHASE' ? 'Atrás' : cameraModeUI === 'CENTRAL' ? 'Topo' : 'Dinâmica'} (Tecla C)`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>

          {/* Botão Ícone de Altitude / Zoom */}
          <button
            type="button"
            onClick={cycleZoomMode}
            className="w-8 h-8 rounded-full bg-black/80 hover:bg-black text-green-400 border border-white/20 shadow-md flex items-center justify-center transition-all active:scale-90"
            title={`Altitude: ${zoomHeightMode === 'HIGH' ? 'Alta' : zoomHeightMode === 'MAX' ? 'Máxima' : 'Média'} (Tecla Z)`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
          </button>

          {/* Botão Ícone de Desistir */}
          <button
            type="button"
            onClick={() => onBackToMenu([], 'quit')}
            className="w-8 h-8 rounded-full bg-red-600/85 hover:bg-red-700 text-white shadow-md flex items-center justify-center transition-all active:scale-90"
            title="Desistir da Corrida"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
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
               const pDef = players.find(p => String(p.id) === String(c.id));
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
