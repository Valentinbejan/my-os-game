/**
 * The clips, as ASCII on the faces' block of cells: loaded the first time each plays (they
 * are 50-210 KB each). The voice that goes with each is public/audio/voice/<name>.ogg.
 */
export type VideoName = 'hate' | 'love' | 'plea' | 'scream' | 'cry';
export interface Video {
  fps: number;
  /** Each frame: the face block's characters, row by row. */
  chars: string[];
  /** Each frame: the brightness (0 dim, 1 normal, 2 bright) of every character. */
  levels: string[];
}
const sources: Record<VideoName, () => Promise<{ default: Video }>> = {
  hate: () => import('./videos/hate'),
  love: () => import('./videos/love'),
  plea: () => import('./videos/plea'),
  scream: () => import('./videos/scream'),
  cry: () => import('./videos/cry'),
};
export const loadVideo = async (name: VideoName) => (await sources[name]()).default;
export const videoLength = (video: Video) => (video.chars.length / video.fps) * 1000;
