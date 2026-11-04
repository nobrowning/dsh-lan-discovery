// Expected environmental failures remain distinct from trust, auth and protocol errors.
export const isNetworkUnavailable = error => ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETDOWN', 'ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL', 'EPIPE'].includes(error?.code);
export const serviceUnavailable = () => Object.assign(new Error('This LAN service is temporarily unavailable. Reconnect when it returns or select another model.'), { code: 'SERVICE_UNAVAILABLE' });
