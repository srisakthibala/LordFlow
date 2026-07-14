import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import db, { initDb, run, get, all, hashPassword } from './db.js';
import { authenticate, requirePermission, requireOrgScope, generateUserToken, logPermissionDenied } from './middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const logAuditEvent = async (loadId, orgId, userId, action, details) => {
  const logId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  try {
    await run(
      `INSERT INTO audit_logs (id, load_id, org_id, user_id, action, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, loadId || null, orgId || null, userId || null, action, JSON.stringify(details), timestamp]
    );
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};

app.post('/api/auth/register-admin', async (req, res) => {
  const { email, password, name, orgName, orgType } = req.body;

  if (!email || !password || !name || !orgName || !orgType) {
    return res.status(400).json({ error: 'All fields (email, password, name, orgName, orgType) are required.' });
  }

  if (orgType !== 'broker' && orgType !== 'carrier') {
    return res.status(400).json({ error: 'Invalid organization type. Must be broker or carrier.' });
  }

  try {
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    await run(
      'INSERT INTO organizations (id, name, type, created_at) VALUES (?, ?, ?, ?)',
      [orgId, orgName, orgType, now]
    );

    await run(
      `INSERT INTO users (id, email, password_hash, password_salt, name, org_id, role_id, role_type, org_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'admin', ?, ?)`,
      [userId, email, hash, salt, name, orgId, orgType, now]
    );

    if (orgType === 'carrier') {
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      
      await run(
        `INSERT INTO compliance_records (org_id, insurance_expiry, authority_status, dot_number, mc_number, approved_equipment, approved_commodities, updated_at, updated_by)
         VALUES (?, ?, 'active', 'DOT1234567', 'MC123456', ?, ?, ?, ?)`,
        [orgId, oneYearLater.toISOString().split('T')[0], JSON.stringify(['Flatbed', 'Reefer', 'Dry Van']), JSON.stringify(['Produce', 'Steel', 'General Freight']), now, userId]
      );
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    const token = generateUserToken(user);

    await logAuditEvent(null, orgId, userId, 'ORG_BOOTSTRAPPED', { orgName, orgType, email });

    res.status(201).json({
      message: 'Organization and Admin account registered successfully.',
      token,
      user: { id: userId, email, name, org_id: orgId, role_type: 'admin', org_type: orgType }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to complete registration.' });
  }
});

app.post('/api/auth/register-shipper', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields (email, password, name) are required.' });
  }

  try {
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const userId = crypto.randomUUID();
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    await run(
      `INSERT INTO users (id, email, password_hash, password_salt, name, org_id, role_id, role_type, org_type, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, 'shipper', 'shipper', ?)`,
      [userId, email, hash, salt, name, now]
    );

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    const token = generateUserToken(user);

    await logAuditEvent(null, null, userId, 'SHIPPER_REGISTERED', { email, name });

    res.status(201).json({
      message: 'Shipper registered successfully.',
      token,
      user: { id: userId, email, name, role_type: 'shipper', org_type: 'shipper' }
    });
  } catch (err) {
    console.error('Shipper registration error:', err);
    res.status(500).json({ error: 'Failed to complete registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      await logPermissionDenied(null, null, 'LOGIN', { email, reason: 'Invalid email' });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const { hash } = hashPassword(password, user.password_salt);
    if (hash !== user.password_hash) {
      await logPermissionDenied(user.id, user.org_id, 'LOGIN', { email, reason: 'Invalid password' });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateUserToken(user);
    await logAuditEvent(null, user.org_id, user.id, 'USER_LOGIN', { email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        org_id: user.org_id,
        role_id: user.role_id,
        role_type: user.role_type,
        org_type: user.org_type
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed.' });
  }
});

app.post('/api/auth/roles', authenticate, requirePermission('staff.manage'), requireOrgScope, async (req, res) => {
  const { name, permissions } = req.body;

  if (!name || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Role name and permissions array are required.' });
  }

  const catalog = [
    'load.create',
    'load.assign_carrier',
    'load.override_compliance_flag',
    'rate.confirm',
    'load.update_status',
    'staff.manage',
    'pod.upload'
  ];

  const invalidPerms = permissions.filter(p => !catalog.includes(p));
  if (invalidPerms.length > 0) {
    return res.status(400).json({ error: `Invalid permissions requested: ${invalidPerms.join(', ')}` });
  }

  try {
    const roleId = crypto.randomUUID();
    const now = new Date().toISOString();

    await run(
      'INSERT INTO roles (id, org_id, name, permissions, created_at) VALUES (?, ?, ?, ?, ?)',
      [roleId, req.user.org_id, name, JSON.stringify(permissions), now]
    );

    await logAuditEvent(null, req.user.org_id, req.user.id, 'ROLE_CREATED', { roleId, name, permissions });

    res.status(201).json({ id: roleId, name, permissions });
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Failed to create role.' });
  }
});

app.get('/api/auth/roles', authenticate, requirePermission('staff.manage'), async (req, res) => {
  try {
    const roles = await all('SELECT * FROM roles WHERE org_id = ?', [req.user.org_id]);
    res.json(roles.map(r => ({ ...r, permissions: JSON.parse(r.permissions) })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch roles.' });
  }
});

app.post('/api/auth/staff', authenticate, requirePermission('staff.manage'), requireOrgScope, async (req, res) => {
  const { email, password, name, role_id } = req.body;

  if (!email || !password || !name || !role_id) {
    return res.status(400).json({ error: 'All fields (email, password, name, role_id) are required.' });
  }

  try {
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const role = await get('SELECT id FROM roles WHERE id = ? AND org_id = ?', [role_id, req.user.org_id]);
    if (!role) {
      return res.status(400).json({ error: 'Role does not exist in this organization.' });
    }

    const userId = crypto.randomUUID();
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    await run(
      `INSERT INTO users (id, email, password_hash, password_salt, name, org_id, role_id, role_type, org_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'staff', ?, ?)`,
      [userId, email, hash, salt, name, req.user.org_id, role_id, req.user.org_type, now]
    );

    await logAuditEvent(null, req.user.org_id, req.user.id, 'STAFF_CREATED', { userId, name, email, roleId: role_id });

    res.status(201).json({
      message: 'Staff member created successfully.',
      staff: { id: userId, email, name, role_id }
    });
  } catch (err) {
    console.error('Create staff error:', err);
    res.status(500).json({ error: 'Failed to create staff member.' });
  }
});

app.get('/api/auth/staff', authenticate, requirePermission('staff.manage'), async (req, res) => {
  try {
    const staff = await all(
      `SELECT u.id, u.email, u.name, u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.org_id = ? AND u.role_type = 'staff'`,
      [req.user.org_id]
    );
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff list.' });
  }
});

app.delete('/api/auth/staff/:id', authenticate, requirePermission('staff.manage'), async (req, res) => {
  try {
    const staffMember = await get('SELECT id, org_id FROM users WHERE id = ? AND role_type = "staff"', [req.params.id]);
    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    if (staffMember.org_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Cannot delete staff from another organization.' });
    }

    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logAuditEvent(null, req.user.org_id, req.user.id, 'STAFF_DELETED', { deletedUserId: req.params.id });

    res.json({ message: 'Staff member deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete staff member.' });
  }
});

app.get('/api/shippers', authenticate, async (req, res) => {
  try {
    const shippers = await all("SELECT id, name, email FROM users WHERE role_type = 'shipper'");
    res.json(shippers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shippers.' });
  }
});

app.get('/api/carriers', authenticate, async (req, res) => {
  try {
    const carriers = await all(
      `SELECT o.id, o.name, c.insurance_expiry, c.authority_status, c.dot_number, c.mc_number, c.approved_equipment, c.approved_commodities
       FROM organizations o
       LEFT JOIN compliance_records c ON o.id = c.org_id
       WHERE o.type = 'carrier'`
    );
    res.json(carriers.map(c => ({
      ...c,
      approved_equipment: JSON.parse(c.approved_equipment || '[]'),
      approved_commodities: JSON.parse(c.approved_commodities || '[]')
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch carriers.' });
  }
});

app.get('/api/compliance/:carrierId', authenticate, async (req, res) => {
  if (req.user.org_type === 'carrier' && req.user.org_id !== req.params.carrierId) {
    await logPermissionDenied(req.user.id, req.user.org_id, 'COMPLIANCE_VIEW', { carrierId: req.params.carrierId });
    return res.status(403).json({ error: 'Forbidden: Cannot view compliance of another carrier.' });
  }

  try {
    const record = await get('SELECT * FROM compliance_records WHERE org_id = ?', [req.params.carrierId]);
    if (!record) {
      return res.status(404).json({ error: 'Compliance record not found.' });
    }
    res.json({
      ...record,
      approved_equipment: JSON.parse(record.approved_equipment || '[]'),
      approved_commodities: JSON.parse(record.approved_commodities || '[]')
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve compliance records.' });
  }
});

app.put('/api/compliance/:carrierId', authenticate, requireOrgScope, async (req, res) => {
  if (req.user.org_type !== 'carrier' || req.user.org_id !== req.params.carrierId) {
    return res.status(403).json({ error: 'Forbidden: Only carrier staff can update compliance.' });
  }

  if (req.user.role_type !== 'admin' && !req.user.permissions.includes('staff.manage')) {
    return res.status(403).json({ error: 'Forbidden: Requires staff.manage permissions.' });
  }

  const { insurance_expiry, authority_status, dot_number, mc_number, approved_equipment, approved_commodities } = req.body;

  if (!insurance_expiry || !authority_status || !dot_number || !mc_number || !Array.isArray(approved_equipment) || !Array.isArray(approved_commodities)) {
    return res.status(400).json({ error: 'Required fields missing.' });
  }

  try {
    const now = new Date().toISOString();
    await run(
      `INSERT OR REPLACE INTO compliance_records (org_id, insurance_expiry, authority_status, dot_number, mc_number, approved_equipment, approved_commodities, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.carrierId,
        insurance_expiry,
        authority_status,
        dot_number,
        mc_number,
        JSON.stringify(approved_equipment),
        JSON.stringify(approved_commodities),
        now,
        req.user.id
      ]
    );

    const loads = await all(`SELECT id, equipment_type, commodity FROM loads WHERE carrier_id = ? AND status = 'Carrier Assigned'`, [req.params.carrierId]);
    for (const load of loads) {
      const today = new Date().toISOString().split('T')[0];
      const hasValidInsurance = insurance_expiry >= today;
      const isAuthorityActive = authority_status === 'active';
      const isEquipmentApproved = approved_equipment.includes(load.equipment_type);
      const isCommodityApproved = approved_commodities.includes(load.commodity);

      const compliant = hasValidInsurance && isAuthorityActive && isEquipmentApproved && isCommodityApproved;
      const flag = compliant ? 0 : 1;

      await run('UPDATE loads SET compliance_flag = ? WHERE id = ?', [flag, load.id]);
      if (flag === 0) {
        await logAuditEvent(load.id, req.user.org_id, 'SYSTEM', 'LOAD_COMPLIANCE_AUTO_RESOLVED', {
          reason: 'Carrier compliance records updated to a compliant state.'
        });
      }
    }

    await logAuditEvent(null, req.user.org_id, req.user.id, 'COMPLIANCE_UPDATED', {
      insurance_expiry,
      authority_status,
      dot_number,
      mc_number,
      approved_equipment,
      approved_commodities
    });

    res.json({ message: 'Compliance record updated successfully.' });
  } catch (err) {
    console.error('Compliance update error:', err);
    res.status(500).json({ error: 'Failed to update compliance records.' });
  }
});

app.post('/api/loads', authenticate, requirePermission('load.create'), async (req, res) => {
  const { shipper_id, origin, destination, pickup_date, delivery_date, equipment_type, commodity, weight } = req.body;

  if (!shipper_id || !origin || !destination || !pickup_date || !delivery_date || !equipment_type || !commodity || !weight) {
    return res.status(400).json({ error: 'Missing required load creation attributes.' });
  }

  try {
    const shipper = await get("SELECT id FROM users WHERE id = ? AND role_type = 'shipper'", [shipper_id]);
    if (!shipper) {
      return res.status(400).json({ error: 'Selected Shipper is invalid.' });
    }

    const loadId = crypto.randomUUID();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO loads (id, shipper_id, broker_id, carrier_id, status, origin, destination, pickup_date, delivery_date, equipment_type, commodity, weight, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'Posted', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [loadId, shipper_id, req.user.org_id, origin, destination, pickup_date, delivery_date, equipment_type, commodity, parseFloat(weight), now, now]
    );

    await logAuditEvent(loadId, req.user.org_id, req.user.id, 'LOAD_CREATED', {
      origin, destination, shipper_id, equipment_type, commodity, weight
    });

    const newLoad = await get('SELECT * FROM loads WHERE id = ?', [loadId]);
    res.status(201).json(newLoad);
  } catch (err) {
    console.error('Load creation error:', err);
    res.status(500).json({ error: 'Failed to create load.' });
  }
});

app.get('/api/loads', authenticate, async (req, res) => {
  try {
    let loads = [];
    if (req.user.org_type === 'broker') {
      loads = await all(
        `SELECT l.*, s.name as shipper_name, c.name as carrier_name
         FROM loads l
         LEFT JOIN users s ON l.shipper_id = s.id
         LEFT JOIN organizations c ON l.carrier_id = c.id
         WHERE l.broker_id = ?`,
        [req.user.org_id]
      );
    } else if (req.user.org_type === 'carrier') {
      loads = await all(
        `SELECT l.*, s.name as shipper_name, b.name as broker_name
         FROM loads l
         LEFT JOIN users s ON l.shipper_id = s.id
         LEFT JOIN organizations b ON l.broker_id = b.id
         WHERE l.carrier_id = ?`,
        [req.user.org_id]
      );
    } else if (req.user.role_type === 'shipper') {
      loads = await all(
        `SELECT l.*, b.name as broker_name, c.name as carrier_name
         FROM loads l
         LEFT JOIN organizations b ON l.broker_id = b.id
         LEFT JOIN organizations c ON l.carrier_id = c.id
         WHERE l.shipper_id = ?`,
        [req.user.id]
      );
    }
    res.json(loads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve loads.' });
  }
});

app.get('/api/loads/:id', authenticate, async (req, res) => {
  try {
    const load = await get(
      `SELECT l.*, s.name as shipper_name, s.email as shipper_email, b.name as broker_name, c.name as carrier_name
       FROM loads l
       LEFT JOIN users s ON l.shipper_id = s.id
       LEFT JOIN organizations b ON l.broker_id = b.id
       LEFT JOIN organizations c ON l.carrier_id = c.id
       WHERE l.id = ?`,
      [req.params.id]
    );

    if (!load) {
      return res.status(404).json({ error: 'Load not found.' });
    }

    let authorized = false;
    if (req.user.org_type === 'broker' && req.user.org_id === load.broker_id) authorized = true;
    else if (req.user.org_type === 'carrier' && req.user.org_id === load.carrier_id) authorized = true;
    else if (req.user.role_type === 'shipper' && req.user.id === load.shipper_id) authorized = true;

    if (!authorized) {
      await logPermissionDenied(req.user.id, req.user.org_id, 'LOAD_VIEW_OBJECT', {
        load_id: load.id,
        reason: 'Scope mismatch'
      });
      return res.status(403).json({ error: 'Access Denied.' });
    }

    res.json(load);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve load.' });
  }
});

app.post('/api/loads/:id/assign', authenticate, requirePermission('load.assign_carrier'), async (req, res) => {
  const { carrier_id } = req.body;

  if (!carrier_id) {
    return res.status(400).json({ error: 'Carrier ID is required.' });
  }

  try {
    const load = await get('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    if (load.broker_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (load.status !== 'Posted' && load.status !== 'Carrier Assigned') {
      return res.status(400).json({ error: 'Invalid state for assignment.' });
    }

    const compliance = await get('SELECT * FROM compliance_records WHERE org_id = ?', [carrier_id]);
    if (!compliance) {
      return res.status(400).json({ error: 'Selected carrier has no compliance records.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const isInsuranceActive = compliance.insurance_expiry >= today;
    const isAuthorityActive = compliance.authority_status === 'active';

    let approvedEquipmentList = [];
    let approvedCommodityList = [];
    try {
      approvedEquipmentList = JSON.parse(compliance.approved_equipment || '[]');
      approvedCommodityList = JSON.parse(compliance.approved_commodities || '[]');
    } catch (e) {}

    const isEquipmentApproved = approvedEquipmentList.includes(load.equipment_type);
    const isCommodityApproved = approvedCommodityList.includes(load.commodity);

    const isCompliant = isInsuranceActive && isAuthorityActive && isEquipmentApproved && isCommodityApproved;
    const flagValue = isCompliant ? 0 : 1;

    const now = new Date().toISOString();
    await run(
      `UPDATE loads
       SET carrier_id = ?, status = 'Carrier Assigned', compliance_flag = ?, compliance_override = 0, compliance_override_by = NULL, compliance_override_reason = NULL, updated_at = ?
       WHERE id = ?`,
      [carrier_id, flagValue, now, load.id]
    );

    const checkDetails = {
      carrier_id,
      insurance_valid: isInsuranceActive,
      insurance_expiry: compliance.insurance_expiry,
      authority_active: isAuthorityActive,
      equipment_approved: isEquipmentApproved,
      commodity_approved: isCommodityApproved,
      overall_compliant: isCompliant
    };

    await logAuditEvent(load.id, req.user.org_id, req.user.id, 'LOAD_CARRIER_ASSIGNED', checkDetails);

    res.json({
      message: 'Carrier assigned successfully.',
      compliance_flagged: !isCompliant,
      compliance_details: checkDetails
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign carrier.' });
  }
});

app.post('/api/loads/:id/override-compliance', authenticate, requirePermission('load.override_compliance_flag'), async (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'Reason required.' });
  }

  try {
    const load = await get('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    if (load.broker_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (load.compliance_flag === 0) {
      return res.status(400).json({ error: 'Not flagged.' });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE loads
       SET compliance_override = 1, compliance_override_by = ?, compliance_override_reason = ?, updated_at = ?
       WHERE id = ?`,
      [req.user.id, reason, now, load.id]
    );

    await logAuditEvent(load.id, req.user.org_id, req.user.id, 'COMPLIANCE_OVERRIDDEN', { reason });

    res.json({ message: 'Overridden successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

app.post('/api/loads/:id/status', authenticate, requirePermission('load.update_status'), async (req, res) => {
  const { status } = req.body;

  const validStates = [
    'Posted',
    'Carrier Assigned',
    'Rate Confirmed',
    'Dispatched',
    'In Transit',
    'Delivered',
    'POD Verified',
    'Invoiced/Closed'
  ];

  if (!status || !validStates.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const load = await get('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    let hasRoleScope = false;
    if (req.user.org_type === 'broker' && req.user.org_id === load.broker_id) hasRoleScope = true;
    else if (req.user.org_type === 'carrier' && req.user.org_id === load.carrier_id) hasRoleScope = true;

    if (!hasRoleScope) {
      return res.status(403).json({ error: 'Access Denied.' });
    }

    const currentState = load.status;
    const rules = {
      'Posted': ['Carrier Assigned'],
      'Carrier Assigned': ['Rate Confirmed', 'Posted'],
      'Rate Confirmed': ['Dispatched'],
      'Dispatched': ['In Transit'],
      'In Transit': ['Delivered'],
      'Delivered': ['POD Verified'],
      'POD Verified': ['Invoiced/Closed']
    };

    if (!rules[currentState] || !rules[currentState].includes(status)) {
      return res.status(400).json({ error: `Invalid transition from ${currentState} to ${status}` });
    }

    if (currentState === 'Carrier Assigned' && status === 'Rate Confirmed') {
      if (load.compliance_flag === 1 && load.compliance_override === 0) {
        return res.status(400).json({
          error: 'Compliance Violation: Blocked.',
          compliance_flagged: true
        });
      }
    }

    if (status === 'Rate Confirmed') {
      const activeConfirm = await get(
        'SELECT status FROM rate_confirmations WHERE load_id = ? AND version = ?',
        [load.id, load.current_rate_version]
      );
      if (!activeConfirm || activeConfirm.status !== 'confirmed') {
        return res.status(400).json({ error: 'Latest rate not confirmed by carrier.' });
      }
    }

    if (status === 'POD Verified' && req.user.org_type !== 'broker') {
      return res.status(403).json({ error: 'Only broker.' });
    }

    if (status === 'Invoiced/Closed' && req.user.org_type !== 'broker') {
      return res.status(403).json({ error: 'Only broker.' });
    }

    const now = new Date().toISOString();
    await run('UPDATE loads SET status = ?, updated_at = ? WHERE id = ?', [status, now, load.id]);
    await logAuditEvent(load.id, req.user.org_id, req.user.id, 'STATUS_UPDATED', {
      from: currentState,
      to: status
    });

    res.json({ message: `Load status successfully updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

app.post('/api/loads/:id/pod', authenticate, requirePermission('pod.upload'), async (req, res) => {
  const { pod_filename } = req.body;

  if (!pod_filename) {
    return res.status(400).json({ error: 'POD filename required.' });
  }

  try {
    const load = await get('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    if (load.carrier_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (load.status !== 'Delivered' && load.status !== 'In Transit') {
      return res.status(400).json({ error: 'Invalid state.' });
    }

    const now = new Date().toISOString();
    const nextStatus = load.status === 'In Transit' ? 'Delivered' : load.status;

    await run(
      `UPDATE loads SET pod_filename = ?, status = ?, updated_at = ? WHERE id = ?`,
      [pod_filename, nextStatus, now, load.id]
    );

    await logAuditEvent(load.id, req.user.org_id, req.user.id, 'POD_UPLOADED', { pod_filename, status_after: nextStatus });

    res.json({ message: 'POD uploaded successfully.', status: nextStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

app.post('/api/rates', authenticate, async (req, res) => {
  if (req.user.org_type !== 'broker') {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { load_id, base_rate, fuel_surcharge, accessorials } = req.body;

  if (!load_id || base_rate === undefined || fuel_surcharge === undefined) {
    return res.status(400).json({ error: 'Required fields missing.' });
  }

  try {
    const load = await get('SELECT * FROM loads WHERE id = ?', [load_id]);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    if (load.broker_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const nextVersion = load.current_rate_version + 1;
    const rateId = crypto.randomUUID();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO rate_confirmations (id, load_id, version, base_rate, fuel_surcharge, accessorials, status, confirmed_by_carrier_user_id, confirmed_at, created_by_broker_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
      [
        rateId,
        load_id,
        nextVersion,
        parseFloat(base_rate),
        parseFloat(fuel_surcharge),
        JSON.stringify(accessorials || {}),
        req.user.id,
        now
      ]
    );

    await run(
      'UPDATE loads SET current_rate_version = ?, updated_at = ? WHERE id = ?',
      [nextVersion, now, load_id]
    );

    await logAuditEvent(load_id, req.user.org_id, req.user.id, 'RATE_CONFIRMATION_CREATED', {
      version: nextVersion,
      base_rate,
      fuel_surcharge
    });

    res.status(201).json({ id: rateId, version: nextVersion, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

app.get('/api/rates/:loadId', authenticate, async (req, res) => {
  try {
    const load = await get('SELECT broker_id, carrier_id, shipper_id FROM loads WHERE id = ?', [req.params.loadId]);
    if (!load) return res.status(404).json({ error: 'Load not found.' });

    let hasAccess = false;
    if (req.user.org_type === 'broker' && req.user.org_id === load.broker_id) hasAccess = true;
    if (req.user.org_type === 'carrier' && req.user.org_id === load.carrier_id) hasAccess = true;
    if (req.user.role_type === 'shipper' && req.user.id === load.shipper_id) hasAccess = true;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const rates = await all(
      `SELECT r.*, u.name as created_by_name, uc.name as confirmed_by_name
       FROM rate_confirmations r
       LEFT JOIN users u ON r.created_by_broker_user_id = u.id
       LEFT JOIN users uc ON r.confirmed_by_carrier_user_id = uc.id
       WHERE r.load_id = ?
       ORDER BY r.version DESC`,
      [req.params.loadId]
    );

    res.json(rates.map(r => ({ ...r, accessorials: JSON.parse(r.accessorials || '{}') })));
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

app.post('/api/rates/:rateId/confirm', authenticate, requirePermission('rate.confirm'), async (req, res) => {
  if (req.user.org_type !== 'carrier') {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    const rate = await get('SELECT * FROM rate_confirmations WHERE id = ?', [req.params.rateId]);
    if (!rate) return res.status(404).json({ error: 'Not found.' });

    const load = await get('SELECT * FROM loads WHERE id = ?', [rate.load_id]);
    if (!load) return res.status(404).json({ error: 'Not found.' });

    if (load.carrier_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (rate.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid state.' });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE rate_confirmations SET status = 'confirmed', confirmed_by_carrier_user_id = ?, confirmed_at = ? WHERE id = ?`,
      [req.user.id, now, rate.id]
    );

    if (load.current_rate_version === rate.version) {
      if (load.compliance_flag === 1 && load.compliance_override === 0) {
        await logAuditEvent(load.id, req.user.org_id, req.user.id, 'RATE_CONFIRMED_COMPLIANCE_BLOCKED', {
          rateId: rate.id,
          version: rate.version
        });
        return res.json({
          message: 'Confirmed, but load transition is blocked by compliance.',
          compliance_flagged: true
        });
      }

      await run('UPDATE loads SET status = "Rate Confirmed", updated_at = ? WHERE id = ?', [now, load.id]);
      await logAuditEvent(load.id, req.user.org_id, req.user.id, 'STATUS_UPDATED', {
        from: load.status,
        to: 'Rate Confirmed'
      });
    }

    await logAuditEvent(load.id, req.user.org_id, req.user.id, 'RATE_CONFIRMED', {
      rateId: rate.id,
      version: rate.version,
      base_rate: rate.base_rate
    });

    res.json({ message: 'Rate confirmed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

app.get('/api/audit', authenticate, async (req, res) => {
  try {
    let logs = [];
    if (req.user.org_type === 'broker') {
      logs = await all(
        `SELECT a.*, u.name as user_name, u.email as user_email
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE a.org_id = ? OR a.load_id IN (SELECT id FROM loads WHERE broker_id = ?)
         ORDER BY a.timestamp DESC`,
        [req.user.org_id, req.user.org_id]
      );
    } else if (req.user.org_type === 'carrier') {
      logs = await all(
        `SELECT a.*, u.name as user_name
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE a.org_id = ? OR a.load_id IN (SELECT id FROM loads WHERE carrier_id = ?)
         ORDER BY a.timestamp DESC`,
        [req.user.org_id, req.user.org_id]
      );
    } else {
      return res.status(403).json({ error: 'Shippers do not have access to audit logs.' });
    }

    res.json(logs.map(l => ({ ...l, details: JSON.parse(l.details || '{}') })));
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

const PORT = process.env.PORT || 5000;
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`LoadFlow backend server is listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database migrations failed:', err);
  });
