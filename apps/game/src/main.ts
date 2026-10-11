import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Title } from "./scenes/Title";
import { Airport } from "./scenes/Airport";
import { Street } from "./scenes/Street";
import { Hostel } from "./scenes/Hostel";
import { activeWorld } from "./scenes/WorldScene";
import { activate, skipEvening, talk } from "./game/actions";
import { voiceMode } from "./game/pushToTalk";
import { speech } from "./game/speech";
import { ui } from "./ui";
import { installTestHooks } from "./testHooks";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "stage",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: "#1a1423",
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [Boot, Title, Airport, Street, Hostel],
});

ui.phoneForm.onSubmit = activate;
ui.hud.onSkip = () => void skipEvening().catch((e) => ui.toast(`Skip failed: ${(e as Error).message}`));
ui.talkInput.onSubmit = (npcId, text) => void talk(npcId, { text }).catch(() => {});
ui.onBuzz = () => activeWorld(game)?.cameras.main.shake(300, 0.006);

installTestHooks(game, {
  talk: (npcId, text) => talk(npcId, { text }),
  submitPhone: (phone) => ui.phoneForm.submit(phone),
  skipEvening,
  world: () => activeWorld(game),
  ui: () => ui.snapshot(),
  fx: () => ({
    recording: ui.recording,
    buzzes: ui.buzzes,
    textMode: voiceMode.textMode,
    muted: speech.muted,
    spoken: speech.spoken,
  }),
});
