import type {KeyDefinition} from '../layouts/qwerty';

export type Point = {x: number; y: number};

export type TrailPoint = Point & {timestampMs: number};

export type KeyBounds = {
  id: string;
  letter?: string;
  keyDef: KeyDefinition;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};
