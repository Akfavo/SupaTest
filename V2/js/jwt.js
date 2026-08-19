/**
 * JWT Decoder and Claims Inspector
 */

export function parseJwt(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64UrlDecode = (str) => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      return decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    };

    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));

    const appMetadata = payload.app_metadata || {};
    const userMetadata = payload.user_metadata || {};

    // Detect role from standard or custom RBAC locations (app_metadata.role, user_metadata.role, custom claims, or payload.role)
    const detectedRole = appMetadata.role
      || userMetadata.role
      || (Array.isArray(appMetadata.roles) ? appMetadata.roles.join(', ') : null)
      || (Array.isArray(userMetadata.roles) ? userMetadata.roles.join(', ') : null)
      || payload.role
      || 'authenticated';

    return {
      raw: token,
      header,
      payload,
      isValid: true,
      role: detectedRole,
      jwtRole: payload.role || 'authenticated',
      appRole: appMetadata.role || null,
      userId: payload.sub || payload.id || null,
      email: payload.email || userMetadata.email || null,
      exp: payload.exp ? new Date(payload.exp * 1000) : null,
      isExpired: payload.exp ? Date.now() >= payload.exp * 1000 : false,
      userMetadata,
      appMetadata
    };
  } catch (err) {
    console.error('Failed to parse JWT token:', err);
    return null;
  }
}

export function formatTimeRemaining(expDate) {
  if (!expDate) return 'Illimité';
  const diffMs = expDate.getTime() - Date.now();
  if (diffMs <= 0) return 'Expiré';

  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s restant`;
  }
  return `${mins}m ${secs}s restant`;
}
