import Dexie, { type Table } from "dexie";
import type { Game } from "./types";

class GameHubDB extends Dexie {
  games!: Table<Game, string>;
  constructor() {
    super("GameHubDB");
    this.version(1).stores({ games: "id, name, category, genre, addedAt, favorite, lastPlayed" });
  }
}
export const db = new GameHubDB();
