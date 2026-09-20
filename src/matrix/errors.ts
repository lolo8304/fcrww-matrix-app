// Keep the SDK's distinction between absent keys and identity/trust failures.
export function describeDecryptionError(code: string | null): string {
    switch (code) {
        case 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID':
            return 'Das sendende Gerät hat diesem Gerät den Nachrichtenschlüssel noch nicht übermittelt.';
        case 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE':
            return 'Das sendende Gerät gibt den Schlüssel nur an verifizierte Geräte weiter. Bitte verifiziere diese Sitzung.';
        case 'MEGOLM_KEY_WITHHELD':
            return 'Das sendende Gerät hat den Nachrichtenschlüssel zurückgehalten.';
        case 'HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED':
            return 'Diese Nachricht stammt aus einer früheren Sitzung. Stelle die Nachrichtenschlüssel unter „Gerät & Sicherung“ wieder her.';
        case 'HISTORICAL_MESSAGE_NO_KEY_BACKUP':
            return 'Für diese ältere Nachricht fehlt der Schlüssel. Es ist keine Matrix-Sicherung vorhanden; der Schlüssel wird von einem früheren Gerät benötigt.';
        case 'HISTORICAL_MESSAGE_WORKING_BACKUP':
            return 'Für diese ältere Nachricht fehlt der Schlüssel noch. Die Matrix-Sicherung wird geprüft.';
        case 'HISTORICAL_MESSAGE_USER_NOT_JOINED':
            return 'Diese Nachricht wurde vor deinem Beitritt zum Raum gesendet. Der Nachrichtenschlüssel ist nicht verfügbar.';
        case 'OLM_UNKNOWN_MESSAGE_INDEX':
            return 'Der vorhandene Schlüssel deckt diese frühere Nachricht nicht ab. Ein älterer Schlüssel aus einer Sicherung oder einem anderen Gerät wird benötigt.';
        case 'SENDER_IDENTITY_PREVIOUSLY_VERIFIED':
            return 'Die zuvor verifizierte Identität des Absenders ist nicht mehr verifiziert. Bitte prüfe die Identität in deinem Matrix-Client.';
        case 'UNSIGNED_SENDER_DEVICE':
        case 'UNKNOWN_SENDER_DEVICE':
            return 'Die Identität des sendenden Geräts konnte nicht bestätigt werden. Bitte prüfe das Gerät in deinem Matrix-Client.';
        default:
            return 'Nachricht konnte nicht entschlüsselt werden. Die Ursache ist unbekannt.';
    }
}

export function describeSendError(error: unknown): string {
    const code = error && typeof error === 'object' && 'errcode' in error ? String(error.errcode) : '';
    switch (code) {
        case 'M_FORBIDDEN': return 'Du hast keine Berechtigung, in diesem Raum Nachrichten zu senden.';
        case 'M_UNKNOWN_TOKEN':
        case 'M_MISSING_TOKEN': return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
        case 'M_LIMIT_EXCEEDED': return 'Zu viele Nachrichten. Bitte warte kurz und versuche es erneut.';
    }
    const message = error instanceof Error ? error.message : '';
    if (message.includes('does not support encryption')) {
        return 'Die Verschlüsselung ist noch nicht bereit. Bitte lade die Seite neu.';
    }
    if (message.includes('not yet sent')) {
        return 'Eine vorherige Nachricht ist fehlgeschlagen. Bitte versuche diese Nachricht zuerst erneut zu senden.';
    }
    return `Nachricht konnte nicht gesendet werden.${code ? ` (${code})` : ''} Bitte versuche es erneut.`;
}
