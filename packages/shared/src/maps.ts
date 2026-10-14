import m0 from '../../../assets/data/map000.json';
import m1 from '../../../assets/data/map001.json';
import m2 from '../../../assets/data/map002.json';
import type { MapData, MapId } from './types.js';

export const MAPS: Record<MapId, MapData> = {
  0: m0 as unknown as MapData,
  1: m1 as unknown as MapData,
  2: m2 as unknown as MapData,
};

export const MAP_NAMES: Record<MapId, string> = { 0: '標準', 1: '短編', 2: '長編' };
