export type Controls = {
  up: string;
  down: string;
  left: string;
  right: string;
  camera?: string;
};

export interface PlayerConfig {
  id: number | string;
  color: string;
  color2?: string;
  teamName?: string;
  driverName?: string;
  isBot: boolean;
  setupTopSpeed?: number;
  controls?: { up: string, down: string, left: string, right: string, camera?: string };
  difficulty?: number;
  socketId?: string;
  isReady?: boolean;
};

export type GameState = 'menu' | 'playing' | 'gameover';

export interface CarSetupStats {
  maxSpeedKmh: number;
  gripMultiplier: number;
  dragMultiplier: number;
}

export interface CarSetupStats {
  maxSpeedKmh: number;
  gripMultiplier: number;
  dragMultiplier: number;
}

export function getSetupFromSpeed(speedKmh: number): CarSetupStats {
  const minSpeed = 160;
  const maxSpeed = 360;
  
  const clampedSpeed = Math.max(minSpeed, Math.min(speedKmh, maxSpeed));
  
  // Normalized 0 to 1 where 0 = 160km/h (Monaco), 1 = 360km/h (Monza)
  const normalized = (clampedSpeed - minSpeed) / (maxSpeed - minSpeed);
  
  // Grip: 160km/h -> 1.60 | 360km/h -> 1.00
  const gripMultiplier = 1.60 - (normalized * 0.60);
  
  // Drag: 160km/h -> 1.50 | 360km/h -> 0.80
  const dragMultiplier = 1.50 - (normalized * 0.70);
  
  return {
    maxSpeedKmh: clampedSpeed,
    gripMultiplier: gripMultiplier,
    dragMultiplier: dragMultiplier
  };
}
