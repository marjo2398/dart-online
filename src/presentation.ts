import type { GameSnapshot } from './types';

export function originLabel(game: { origin?: GameSnapshot['game']['origin'] }): string {
  if (game.origin?.mode === 'archive') return 'Archiwum z APK · tylko odczyt';
  if (game.origin?.mode === 'unknown') return 'Import APK · tryb niepotwierdzony, tylko odczyt';
  return game.origin?.kind === 'android' ? 'Udostępniony z APK · prowadzi serwer' : 'Mecz online · prowadzi serwer';
}
