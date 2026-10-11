import type { Config } from "../config";
import type { VoiceProvisioner } from "../coach/contract";
import { createMockVoiceProvisioner } from "../mocks";

/** Lane E: ElevenLabs voice library, voice design and Agents create/update. */
export function createVoiceProvisioner(config: Config): VoiceProvisioner {
  if (config.mockElevenLabs) return createMockVoiceProvisioner().provisioner;
  throw new Error("not implemented: voice/provision.ts (lane E)");
}
