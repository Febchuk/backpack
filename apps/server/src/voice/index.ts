export { attachVoiceBridge, VOICE_PATH, type VoiceBridge, type VoiceBridgeOptions } from "./bridge";
export type { AgentConnection, AgentConnector, ElevenLabsEvent } from "./elevenlabs";
/** Re-exported so tests (outside this package) can open sockets with the same `ws` the bridge uses. */
export { WebSocket } from "ws";
