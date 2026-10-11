/** Browser tests run on their own ports so they never collide with `pnpm dev` (8787/5173). */
export const TEST_API_PORT = 18787;
export const TEST_GAME_PORT = 15173;
export const API = `http://localhost:${TEST_API_PORT}`;
export const GAME = `http://localhost:${TEST_GAME_PORT}`;
