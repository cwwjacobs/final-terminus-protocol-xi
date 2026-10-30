import type { Action } from '../../game/types.ts';
import type { PendingManualHeal } from './kit-ui.ts';

export interface RoomSyncPacket { seq: number; actions: Action[]; loaded: boolean }

/** A rejected request cannot succeed through replay. Uncertain/transient failures
 * retain the exact sequence and intents so the server can deduplicate retries. */
export function rejectedRoomPacket(status: number, packet: RoomSyncPacket, pendingHeals: PendingManualHeal[]) {
  const discard = status === 400 || status === 413 || status === 422;
  return {
    packet: discard ? null : packet,
    pendingHeals: discard ? pendingHeals.filter(intent => !packet.actions.includes(intent.action)) : pendingHeals,
  };
}
