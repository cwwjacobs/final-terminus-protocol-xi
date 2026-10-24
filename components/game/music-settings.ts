export const MUSIC_SOURCE = '/audio/siege-of-the-gilded-hall.mp3';
export const MUSIC_TITLE = 'Siege of the Gilded Hall';
export const MUSIC_STORAGE_KEY = 'terminus-xi-music-v1';

export interface MusicSettings {
  enabled: boolean;
  muted: boolean;
  volume: number;
}

export const DEFAULT_MUSIC_SETTINGS: Readonly<MusicSettings> = {
  enabled: true,
  muted: false,
  volume: 0.1,
};

export function normalizeMusicSettings(raw: unknown): MusicSettings {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_MUSIC_SETTINGS.enabled,
    muted: typeof source.muted === 'boolean' ? source.muted : DEFAULT_MUSIC_SETTINGS.muted,
    volume: typeof source.volume === 'number' && Number.isFinite(source.volume)
      ? Math.max(0, Math.min(1, source.volume)) : DEFAULT_MUSIC_SETTINGS.volume,
  };
}
