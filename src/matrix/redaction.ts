import type { MatrixClient, Room } from 'matrix-js-sdk';

export async function redactMessage(client: MatrixClient, room: Room, eventId: string): Promise<void> {
    const txnId = client.makeTxnId();
    try {
        await client.redactEvent(room.roomId, eventId, txnId);
    } catch (error) {
        // A failed invisible redaction must not block retries or later messages.
        const pending = room.getEventForTxnId(txnId);
        if (pending?.status === 'not_sent') client.cancelPendingEvent(pending);
        throw error;
    }
}
