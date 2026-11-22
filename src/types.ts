export type Visibility = "public" | "family" | "private";
export type GameFile = { path: string; blob: Blob; type: string };
export type Game = {
  id: string; name: string; description: string; category: string; genre: string;
  platform: string; cover?: string; files: GameFile[]; entry: string;
  addedAt: number; favorite: boolean; lastPlayed?: number; playCount: number;
  isPublic?: boolean;
  visibility?: Visibility;
  stats?: { plays: number; votes: number; avg: number | null; comments: number };
  remote?: { filePath: string; coverPath?: string | null; restricted?: boolean };
};
