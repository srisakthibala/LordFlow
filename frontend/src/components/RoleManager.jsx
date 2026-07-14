import React, { useState, useEffect } from 'react';

const PERMISSION_CATALOG = {
  broker: [
    { key: 'load.create', label: 'Create Loads', desc: 'Create new loads' },
    { key: 'load.assign_carrier', label: 'Assign Carrier', desc: 'Assign carrier orgs' },
    { key: 'load.override_compliance_flag', label: 'Override Compliance', desc: 'Override compliance locks' },
    { key: 'rate.confirm', label: 'Manage Rates', desc: 'Manage rate confirmations' },
    { key: 'load.update_status', label: 'Update Status', desc: 'Progress loads status' },
    { key: 'staff.manage', label: 'Manage Staff', desc: 'Manage staff and roles' }
  ],
  carrier: [
    { key: 'rate.confirm', label: 'Confirm Rates', desc: 'Accept rates' },
    { key: 'load.update_status', label: 'Update Status', desc: 'Progress status' },
    { key: 'pod.upload', label: 'Upload POD', desc: 'Upload proof files' },
    { key: 'staff.manage', label: 'Manage Staff', desc: 'Manage staff' }
  ]
};

export default function RoleManager({ user, token, API_URL }) {
  const [roles, setRoles] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [roleName, setRoleName] = useState('');
  const [selectedPerms, setSelectedPerms] = useState([]);

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRoleId, setStaffRoleId] = useState('');

  const orgType = user.org_type;

  const fetchRolesAndStaff = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const rolesRes = await fetch(`${API_URL}/api/auth/roles`, { headers });
      const staffRes = await fetch(`${API_URL}/api/auth/staff`, { headers });

      if (rolesRes.ok && staffRes.ok) {
        setRoles(await rolesRes.json());
        setStaff(await staffRes.json());
      }
    } catch (e) {
      setError('Connection failure.');
    }
  };

  useEffect(() => {
    fetchRolesAndStaff();
  }, []);

  const handlePermCheck = (permKey) => {
    if (selectedPerms.includes(permKey)) {
      setSelectedPerms(selectedPerms.filter(p => p !== permKey));
    } else {
      setSelectedPerms([...selectedPerms, permKey]);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!roleName || selectedPerms.length === 0) {
      setError('Role name and at least one permission are required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: roleName, permissions: selectedPerms })
      });

      if (res.ok) {
        setSuccess('Role created.');
        setRoleName('');
        setSelectedPerms([]);
        fetchRolesAndStaff();
      } else {
        setError('Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!staffName || !staffEmail || !staffPassword || !staffRoleId) {
      setError('All fields are required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: staffName, email: staffEmail, password: staffPassword, role_id: staffRoleId
        })
      });

      if (res.ok) {
        setSuccess('Staff created.');
        setStaffName(''); setStaffEmail(''); setStaffPassword(''); setStaffRoleId('');
        fetchRolesAndStaff();
      } else {
        const d = await res.json();
        setError(d.error || 'Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!window.confirm('Delete staff member?')) return;
    setError(''); setSuccess('');

    try {
      const res = await fetch(`${API_URL}/api/auth/staff/${staffId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccess('Deleted.');
        fetchRolesAndStaff();
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const catalog = PERMISSION_CATALOG[orgType] || [];

  return (
    <div className="main-content">
      <div className="board-header">
        <h2>Organization Staff & Custom Roles</h2>
      </div>

      {error && <div className="alert-banner danger">{error}</div>}
      {success && <div className="alert-banner">{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="panel-card">
          <h3 className="panel-title">Create Custom Role</h3>
          <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Role Designation</label>
              <input type="text" className="form-control" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Permissions Bundle</label>
              <div className="perms-grid" style={{ gridTemplateColumns: '1fr' }}>
                {catalog.map(perm => (
                  <label key={perm.key} className="perm-checkbox-label">
                    <input type="checkbox" checked={selectedPerms.includes(perm.key)} onChange={() => handlePermCheck(perm.key)} />
                    <div>
                      <span className="perm-title">{perm.label}</span>
                      <span className="perm-desc">{perm.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Save Role</button>
          </form>
        </div>

        <div className="panel-card">
          <h3 className="panel-title">Add Staff Member</h3>
          <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" className="form-control" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" className="form-control" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" className="form-control" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Assigned Role</label>
              <select className="form-control" value={staffRoleId} onChange={(e) => setStaffRoleId(e.target.value)}>
                <option value="">-- Choose --</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Save Staff Member</button>
          </form>
        </div>
      </div>

      <div className="panel-card">
        <h3 className="panel-title">Crew Directory</h3>
        <table className="audit-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th style={{ textAlign: 'right' }}>Action</th></tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td>{s.email}</td>
                <td><span className="badge-role staff">{s.role_name}</span></td>
                <td style={{ textAlign: 'right' }}><button onClick={() => handleDeleteStaff(s.id)} className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
