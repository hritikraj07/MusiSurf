import { registerPlugin } from '@capacitor/core';
import type { MusiSurfMediaPlugin } from './types';

export * from './types';

/**
 * MusiSurf Media Plugin Bridge
 * Communicates with native Android Media3 ExoPlayer background service
 */
const MusiSurfMedia = registerPlugin<MusiSurfMediaPlugin>('MusiSurfMediaPlugin', {
  web: () => import('./web').then(m => new m.MusiSurfMediaWeb()),
});

export default MusiSurfMedia;
