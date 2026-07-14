import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import RoleManager from './components/RoleManager';
import CarrierCompliance from './components/CarrierCompliance';
import AuditLog from './components/AuditLog';

const API_URL = 'http://localhost:5000';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [authMode, setAuthMode] = useState('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('broker');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  useEffect(() => {
    if (token && user) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }, [token, user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!email || !password) {
      setAuthError('Email and password are required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCurrentTab('dashboard');
      } else {
        setAuthError(data.error || 'Authentication failed.');
      }
    } catch (err) {
      setAuthError('Failed to connect to backend server.');
    }
  };

  const handleRegisterAdmin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!email || !password || !name || !orgName) {
      setAuthError('All fields are required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/register-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, orgName, orgType })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCurrentTab('dashboard');
      } else {
        setAuthError(data.error || 'Registration failed.');
      }
    } catch (err) {
      setAuthError('Failed to connect to backend server.');
    }
  };

  const handleRegisterShipper = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!email || !password || !name) {
      setAuthError('All fields are required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/register-shipper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCurrentTab('dashboard');
      } else {
        setAuthError(data.error || 'Shipper registration failed.');
      }
    } catch (err) {
      setAuthError('Failed to connect to backend server.');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setCurrentTab('dashboard');
    setEmail('');
    setPassword('');
    setName('');
    setOrgName('');
  };

  const hasPerm = (p) => {
    if (!user) return false;
    if (user.role_type === 'admin') return true;
    if (user.role_type === 'shipper') return p === 'shipper.view';
    return user.permissions?.includes(p);
  };

  if (!token || !user) {
    return (
      <div className="auth-page">
        <div className="glass-card">
          <div className="auth-header">
            <div className="logo-section" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
              <span className="logo-text" style={{ fontSize: '2.25rem' }}>LoadFlow</span>
            </div>
            <p>Logistics RBAC Management Portal</p>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Log In</button>
            <button className={`auth-tab ${authMode === 'register-admin' ? 'active' : ''}`} onClick={() => { setAuthMode('register-admin'); setAuthError(''); }}>Org Admin</button>
            <button className={`auth-tab ${authMode === 'register-shipper' ? 'active' : ''}`} onClick={() => { setAuthMode('register-shipper'); setAuthError(''); }}>Shipper</button>
          </div>

          {authError && <div className="alert-banner danger">{authError}</div>}
          {authSuccess && <div className="alert-banner">{authSuccess}</div>}

          {authMode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" className="form-control" placeholder="name@organization.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" className="form-control" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '1.5rem' }}>Sign In to Platform</button>
            </form>
          )}

          {authMode === 'register-admin' && (
            <form onSubmit={handleRegisterAdmin}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" className="form-control" placeholder="Admin Name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" className="form-control" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" className="form-control" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Organization Name</label>
                <input type="text" className="form-control" placeholder="Acme Logistics" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Organization Type</label>
                <select className="form-control" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                  <option value="broker">Broker (Freight Agency)</option>
                  <option value="carrier">Carrier (Trucking fleet)</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '1.5rem' }}>Register Organization</button>
            </form>
          )}

          {authMode === 'register-shipper' && (
            <form onSubmit={handleRegisterShipper}>
              <div className="form-group">
                <label>Business / Name</label>
                <input type="text" className="form-control" placeholder="Shipper Name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" className="form-control" placeholder="shipping@shipper.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" className="form-control" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '1.5rem' }}>Register Shipper</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="logo-section"><span className="logo-text">LoadFlow</span></div>
        <div className="nav-user">
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontWeight: 600, display: 'block' }}>{user.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user.org_id ? user.org_name : 'Shipper'}</span>
          </div>
          <span className={`badge-role ${user.role_type}`}>{user.role_type === 'admin' ? 'Admin' : user.role_type === 'shipper' ? 'Shipper' : user.role_name}</span>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>Sign Out</button>
        </div>
      </header>

      <div className="dashboard-container">
        <aside className="sidebar">
          <button className={`sidebar-btn ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>📋 Shipments Board</button>
          {user.org_type !== 'shipper' && hasPerm('staff.manage') && (
            <button className={`sidebar-btn ${currentTab === 'staff' ? 'active' : ''}`} onClick={() => setCurrentTab('staff')}>👥 Staff & Roles</button>
          )}
          {user.org_type === 'carrier' && (
            <button className={`sidebar-btn ${currentTab === 'compliance' ? 'active' : ''}`} onClick={() => setCurrentTab('compliance')}>🛡️ Compliance</button>
          )}
          {user.org_type !== 'shipper' && (
            <button className={`sidebar-btn ${currentTab === 'audit' ? 'active' : ''}`} onClick={() => setCurrentTab('audit')}>🔎 Audit Logs</button>
          )}
        </aside>

        <main>
          {currentTab === 'dashboard' && <Dashboard user={user} token={token} API_URL={API_URL} />}
          {currentTab === 'staff' && <RoleManager user={user} token={token} API_URL={API_URL} />}
          {currentTab === 'compliance' && <CarrierCompliance user={user} token={token} API_URL={API_URL} />}
          {currentTab === 'audit' && <AuditLog user={user} token={token} API_URL={API_URL} />}
        </main>
      </div>
    </div>
  );
}
