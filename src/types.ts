export type Controls = {
  up: string;
  down: string;
  left: string;
  right: string;
};

export interface PlayerConfig {
  id: number;
  color: string;
  color2?: string;
  teamName?: string;
  driverName?: string;
  isBot: boolean;
  setup?: CarSetupType;
  controls?: { up: string, down: string, left: string, right: string };
  difficulty?: number;
};

export type GameState = 'menu' | 'playing' | 'gameover';

export type CarSetupType = 'LOW_DF' | 'BALANCED' | 'HIGH_DF';

export interface CarSetupStats {
  maxSpeedKmh: number;
  gripMultiplier: number;
  dragMultiplier: number;
}

export const SETUP_CONFIGS: Record<CarSetupType, CarSetupStats> = {
  LOW_DF: { maxSpeedKmh: 360, gripMultiplier: 1.0, dragMultiplier: 0.8 }, // Monza
  BALANCED: { maxSpeedKmh: 260, gripMultiplier: 1.25, dragMultiplier: 1.0 }, // Standard
  HIGH_DF: { maxSpeedKmh: 160, gripMultiplier: 1.60, dragMultiplier: 1.5 } // Mónaco
};
