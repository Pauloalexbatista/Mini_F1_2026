import { CarSetupStats } from './types';

export interface CarPhysics {
  id: number;
  vehicleType?: 'F1' | 'DRIFT' | 'MOTO' | 'RALLY';
  x: number;
  y: number;
  vx: number; // velocity vector X
  vy: number; // velocity vector Y
  angle: number; // facing direction (radians)
  angularVelocity: number;
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
  steer: number; // -1 to 1 (left to right)
  
  // Stats
  maxSpeed: number;
  enginePower: number;
  brakingPower: number;
  grip: number;
  mass: number;

  color: string;
  color2?: string;
  helmetColor?: string;
  isBot: boolean;
  isLocal?: boolean;
  remoteTarget?: { x: number, y: number, a: number };
  givenUp: boolean;
  damage: number;
  tireHealth: number; 
  drsEnabled: boolean;
  slipstreamActive: boolean;
  
  // Track logic
  laps: number;
  currentWaypoint: number;
  finishTime?: number | null;
  currentLapStartTime?: number;
  lastLapTime?: number;
  bestLapTime?: number;
  controls?: { up: string, down: string, left: string, right: string };
  setupProfile?: CarSetupStats;
  isSkidding?: boolean;
  scorePosted?: boolean;
}

export type SurfaceType = 'TRACK' | 'CURB' | 'CURB_WIDE' | 'CURB_APEX' | 'GRASS';

export function updateCarPhysics(car: CarPhysics, dt: number, surface: SurfaceType) {
  const speed = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
  if (speed < 1.0 && car.throttle === 0 && car.brake === 0) {
    car.vx = 0; car.vy = 0;
  }

  const cosA = Math.cos(car.angle);
  const sinA = Math.sin(car.angle);
  
  const forwardVel = car.vx * cosA + car.vy * sinA;
  const lateralVel = car.vx * -sinA + car.vy * cosA;

  let gripPenalty = 1.0;
  let accelPenalty = 1.0;
  let dragPenalty = 1.0;
  let maxSpeedMod = 1.0;

  if (car.setupProfile) {
      gripPenalty *= car.setupProfile.gripMultiplier;
      dragPenalty *= car.setupProfile.dragMultiplier;
  }

  // Tire Wear Mechanical Drop-off (Cliff effect)
  if (car.tireHealth !== undefined && car.tireHealth < 40) {
      const tireCliff = Math.max(0.3, car.tireHealth / 40); // 70% grip loss when bald!
      gripPenalty *= tireCliff;
  }

  const isRally = car.vehicleType === 'RALLY';
  const isMoto = car.vehicleType === 'MOTO';
  const isDrift = car.vehicleType === 'DRIFT';

  if (surface === 'GRASS') {
    if (isRally) {
      // Rally WRC 4WD: quase imune a relva/terra (excelente vantagem em atalhos!)
      gripPenalty *= 0.92; accelPenalty *= 0.95; dragPenalty *= 1.15; maxSpeedMod *= 0.95;
    } else if (isMoto) {
      // Moto em relva: instável e escorregadia
      gripPenalty *= 0.45; accelPenalty *= 0.50; dragPenalty *= 2.2; maxSpeedMod *= 0.35;
    } else {
      gripPenalty *= 0.55; accelPenalty *= 0.6; dragPenalty *= 2.0; maxSpeedMod *= 0.4;
    }
  } else if (surface === 'CURB_APEX') {
    if (isRally) {
      gripPenalty *= 0.90; accelPenalty *= 0.92; dragPenalty *= 1.2; maxSpeedMod *= 0.92;
    } else {
      gripPenalty *= 0.6; accelPenalty *= 0.6; dragPenalty *= 3.5; maxSpeedMod *= 0.7;
    }
  } else if (surface === 'CURB_WIDE') {
    if (isRally) {
      gripPenalty *= 0.94; accelPenalty *= 0.96; dragPenalty *= 1.15; maxSpeedMod *= 0.95;
    } else {
      gripPenalty *= 0.75; accelPenalty *= 0.75; dragPenalty *= 2.5; maxSpeedMod *= 0.8;
    }
  } else if (surface === 'CURB') {
    if (isRally) {
      gripPenalty *= 0.98; accelPenalty *= 0.98; dragPenalty *= 1.05; maxSpeedMod *= 0.98;
    } else {
      gripPenalty *= 0.9; accelPenalty *= 0.95; dragPenalty *= 1.2; maxSpeedMod *= 0.9;
    }
  }

  if (car.slipstreamActive) {
    dragPenalty *= 0.6; // 40% less aerodynamic drag when tailgating
  }
  if (car.drsEnabled) {
    dragPenalty *= 0.5; // Even less drag
    maxSpeedMod *= 1.15; // 15% higher absolute top speed
  }

  // 2. Acceleration (Engine & Brakes)
  const damagePenalty = 1.0 - (Math.min(car.damage, 90) / 100);
  let tractionAccel = 0;
  if (car.throttle > 0) {
    tractionAccel = car.throttle * car.enginePower * accelPenalty * damagePenalty;
  }
  if (car.brake > 0 && forwardVel > 0) {
    tractionAccel = -car.brake * car.brakingPower * gripPenalty; 
  } else if (car.brake > 0 && forwardVel <= 0) {
    tractionAccel = -car.brake * car.enginePower * 0.2; 
  }

  const baseDragRate = car.setupProfile ? (car.setupProfile.dragMultiplier / 1000) : 0.0005;
  const dragRate = baseDragRate * dragPenalty;
  const rollingResist = 5.0 * dragPenalty;
  const resistanceAccel = -(dragRate * forwardVel * Math.abs(forwardVel) + rollingResist * Math.sign(forwardVel));
  let longAccel = tractionAccel + resistanceAccel;

  // 3. Apply Steering and Lateral Grip
  if (Math.abs(forwardVel) > 10) {
    if (isDrift) {
      // Drift steering: snappy, high-angle turn with power oversteer
      const turnRadius = 28 + (Math.abs(forwardVel) * 0.95);
      let steerTurn = (forwardVel / turnRadius) * car.steer;
      if (car.throttle > 0.1 && Math.abs(car.steer) > 0.05) {
        steerTurn += car.steer * 2.2 * car.throttle;
      }
      car.angularVelocity = steerTurn;
    } else if (isMoto) {
      // Moto steering: ultra-ágil, rápida mudança de trajetória
      const turnRadius = 24 + (Math.abs(forwardVel) * 0.75);
      let steerTurn = (forwardVel / turnRadius) * car.steer * 1.25;
      car.angularVelocity = steerTurn * gripPenalty;
    } else if (isRally) {
      // Rally steering: AWD power-slide com tração dianteira a puxar à saída
      const turnRadius = 30 + (Math.abs(forwardVel) * 1.05);
      let steerTurn = (forwardVel / turnRadius) * car.steer;
      if (car.throttle > 0.2 && Math.abs(car.steer) > 0.1) {
        steerTurn += car.steer * 0.9 * car.throttle; // AWD pivot
      }
      car.angularVelocity = steerTurn * gripPenalty;
    } else {
      const speedFactor = 1.8 / gripPenalty;
      const turnRadius = 40 + (Math.abs(forwardVel) * speedFactor); 
      car.angularVelocity = (forwardVel / turnRadius) * car.steer * gripPenalty;
    }
  } else {
    car.angularVelocity = car.steer * (isDrift ? 2.8 : isMoto ? 3.2 : isRally ? 2.4 : 2.0) * gripPenalty;
  }
  car.angle += car.angularVelocity * dt;

  // Lateral acceleration (Tire Grip)
  const corneringStiffnessAccel = (
    isDrift ? 2200.0 :
    isMoto ? 4200.0 :
    isRally ? 3600.0 :
    5000.0
  ) * car.grip * gripPenalty;

  const maxLateralAccel = (
    isDrift ? 900.0 :
    isMoto ? 1350.0 :
    isRally ? 1150.0 :
    1500.0
  ) * car.grip * gripPenalty; 
  
  let slipAngle = Math.atan2(lateralVel, Math.abs(forwardVel) + 1);
  let latAccel = -corneringStiffnessAccel * slipAngle;
  
  if (latAccel > maxLateralAccel) latAccel = maxLateralAccel;
  if (latAccel < -maxLateralAccel) latAccel = -maxLateralAccel;

  if (Math.abs(latAccel) >= maxLateralAccel) {
    const slideLoss = isDrift ? 0.35 : isRally ? 0.45 : isMoto ? 1.2 : 1.5;
    longAccel -= Math.abs(forwardVel) * slideLoss;
  }

  const globalAccelX = longAccel * cosA - latAccel * sinA;
  const globalAccelY = longAccel * sinA + latAccel * cosA;

  car.vx += globalAccelX * dt;
  car.vy += globalAccelY * dt;

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  
  const newSpeed = Math.sqrt(car.vx*car.vx + car.vy*car.vy);
  const baseMaxSpeed = car.setupProfile ? (car.setupProfile.maxSpeedKmh / 0.36) : car.maxSpeed;
  const currentMaxSpeed = (baseMaxSpeed * maxSpeedMod) * damagePenalty;
  
  if (newSpeed > currentMaxSpeed) {
    const ratio = currentMaxSpeed / newSpeed;
    car.vx *= ratio;
    car.vy *= ratio;
  }

  // 6. Pirâmide de Desgaste (User F1 Tier System - V1.1 Re-Calibrado)
  // Valores calibrados SUPER DILUIDOS para Pneus F1 aguentarem cerca de 10 Voltas antes da Box (Pit aos 30%)!
  let wearRate = 0.05; // NÍVEL I: Reta (0.05/sec, dura imenso)
  car.isSkidding = false;
  
  if (car.setupProfile) {
    const scrubFactor = Math.abs(latAccel) / 500; // 0 to ~3 multiplier
    const curveWear = scrubFactor * car.setupProfile.gripMultiplier * 0.26;
    
    if (curveWear > 0.15) {
       wearRate += 0.05; // NÍVEL III: Curvas (0.05 extra/sec)
       if (curveWear > 0.4) {
           wearRate += 0.05; // Extra penalização se derrapar à bruta
           car.isSkidding = true; 
       }
    }
  }
  
  if (surface === 'GRASS') {
      wearRate += 0.1; // NÍVEL II: Relva
  }
  
  if (isDrift && (Math.abs(lateralVel) > 24 || (car.throttle > 0.5 && Math.abs(car.steer) > 0.2))) { car.isSkidding = true; }
  else if (isRally && (Math.abs(lateralVel) > 28 || (surface === 'GRASS' && speed > 50))) { car.isSkidding = true; }
  else if (isMoto && (Math.abs(lateralVel) > 40 || (car.throttle > 0.8 && speed < 100))) { car.isSkidding = true; }
  if (car.brake > 0.6) {
      wearRate += 0.15; // NÍVEL IV: Travagem a fundo
      car.isSkidding = true; 
  }
  
  // Apply final wear logic
  if (car.tireHealth !== undefined && speed > 50) {
     car.tireHealth -= wearRate * dt;
     if (car.tireHealth < 10) car.tireHealth = 10;
  }
}
