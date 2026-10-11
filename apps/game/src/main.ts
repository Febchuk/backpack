import Phaser from "phaser";
import { Title } from "./scenes/Title";
import { Airport } from "./scenes/Airport";
import { Street } from "./scenes/Street";
import { Hostel } from "./scenes/Hostel";
import { installTestHooks } from "./testHooks";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: "#1a1423",
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [Title, Airport, Street, Hostel],
});

installTestHooks(game);
