export type GameFile = { path: string; blob: Blob; type: string };
export type Game = {
  id: string; name: string; description: string; category: string; genre: string;
  platform: string; system?: string; cover?: string; files: GameFile[]; entry: string;
  addedAt: number; favorite: boolean; lastPlayed?: number; playCount: number;
};
