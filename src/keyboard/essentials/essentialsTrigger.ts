import {getEssentialByKeyword} from './essentialsStore';

export type EssentialTrigger = {
  query: string;
  triggerLength: number;
};

export function extractEssentialTrigger(context: string): EssentialTrigger | null {
  const match = context.match(/@@([a-zA-Z0-9_]*)$/);
  if (!match) {
    return null;
  }
  return {
    query: match[1].toLowerCase(),
    triggerLength: match[0].length,
  };
}

export function resolveEssentialExpansion(context: string): {
  triggerLength: number;
  value: string;
} | null {
  const match = context.match(/@@([a-zA-Z0-9_]+)$/);
  if (!match) {
    return null;
  }
  const essential = getEssentialByKeyword(match[1]);
  if (!essential) {
    return null;
  }
  return {
    triggerLength: match[0].length,
    value: essential.value,
  };
}
