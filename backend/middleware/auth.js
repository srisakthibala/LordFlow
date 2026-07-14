import crypto from 'crypto';
import { get, run } from '../db.js';

const JWT_SECRET = 'loadflow-super-secure-secret-key-123456';

const base64url = (source) => {
  let encoded = Buffer.from(JSON.stringify(source)).toString('base64');
  encoded = encoded.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return encoded;
};

const base64urlDecode = (encoded) => {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
};

const signToken = (payload) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(header);
  const encodedPayload = base64url(payload);
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const verifyToken = (token) => {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    const calculatedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (calculatedSignature === signature) {
      return base64urlDecode(encodedPayload);
    }
  } catch (e) {
    return null;
  }
  return null;
};

export const generateUserToken = (user) => {
  return signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    org_id: user.org_id,
    role_id: user.role_id,
    role_type: user.role_type,
    org_type: user.org_type,
    timestamp: Date.now()
  });
};

export const logPermissionDenied = async (userId, orgId, action, details) => {
  const logId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const logMsg = `[PERMISSION_DENIED] User: ${userId || 'Unauthenticated'} | Org: ${orgId || 'None'} | Action: ${action} | Details: ${JSON.stringify(details)}`;
  console.warn(logMsg);

  try {
    await run(
      `INSERT INTO audit_logs (id, load_id, org_id, user_id, action, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        logId,
        details.load_id || null,
        orgId || null,
        userId || null,
        'PERMISSION_DENIED',
        JSON.stringify({ ...details, action_attempted: action }),
        timestamp
      ]
    );
  } catch (err) {
    console.error('Failed to log audit details to database:', err);
  }
};

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token missing or invalid.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Session expired or invalid token.' });
  }

  try {
    const user = await get(
      `SELECT u.*, o.name as org_name, r.permissions as role_permissions, r.name as role_name
       FROM users u
       LEFT JOIN organizations o ON u.org_id = o.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [payload.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    let permissions = [];
    if (user.role_type === 'admin') {
      if (user.org_type === 'broker') {
        permissions = [
          'load.create',
          'load.assign_carrier',
          'load.override_compliance_flag',
          'rate.confirm',
          'load.update_status',
          'staff.manage',
          'pod.upload'
        ];
      } else if (user.org_type === 'carrier') {
        permissions = [
          'rate.confirm',
          'load.update_status',
          'staff.manage',
          'pod.upload'
        ];
      }
    } else if (user.role_type === 'staff') {
      try {
        permissions = JSON.parse(user.role_permissions || '[]');
      } catch (e) {
        permissions = [];
      }
    } else if (user.role_type === 'shipper') {
      permissions = ['shipper.view'];
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      org_id: user.org_id,
      org_name: user.org_name,
      org_type: user.org_type,
      role_id: user.role_id,
      role_name: user.role_name || (user.role_type === 'admin' ? 'Admin' : 'Shipper'),
      role_type: user.role_type,
      permissions
    };

    next();
  } catch (err) {
    console.error('Auth check error:', err);
    return res.status(500).json({ error: 'Database authentication failure.' });
  }
};

export const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated.' });
    }

    if (!req.user.permissions.includes(permission)) {
      await logPermissionDenied(req.user.id, req.user.org_id, permission, {
        url: req.originalUrl,
        method: req.method,
        reason: `Requires permission '${permission}', which user does not possess.`
      });
      return res.status(403).json({ error: `Forbidden: requires permission ${permission}` });
    }

    next();
  };
};

export const requireOrgScope = (req, res, next) => {
  const orgIdParam = req.params.orgId || req.body.org_id || req.query.org_id;
  if (!orgIdParam) {
    return next();
  }

  if (req.user.role_type !== 'shipper' && req.user.org_id !== orgIdParam) {
    logPermissionDenied(req.user.id, req.user.org_id, 'ORG_SCOPE_ACCESS', {
      target_org: orgIdParam,
      url: req.originalUrl,
      reason: 'Cross-organization data access blocked.'
    });
    return res.status(403).json({ error: 'Access Denied: Cross-organization scope violation.' });
  }

  next();
};
