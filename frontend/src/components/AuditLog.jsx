import React, { useState, useEffect } from 'react';

export default function AuditLog({ user, token, API_URL }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      } else {
        setError('Failed to fetch audit trails.');
      }
    } catch (e) {
      setError('Connection failure.');
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadgeClass = (action) => {
    if (action.includes('DENIED') || action.includes('FAILED')) return 'btn-danger';
    if (action.includes('OVERRIDDEN') || action.includes('ALERT')) return 'badge-role staff';
    if (action.includes('CREATED') || action.includes('CONFIRMED')) return 'badge-role admin';
    return 'badge-role shipper';
  };

  return (
    <div className="main-content">
      <div className="board-header">
        <h2>Security & Operations Audit Trail</h2>
        <button className="btn btn-secondary" onClick={fetchLogs} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>Refresh</button>
      </div>

      {error && <div className="alert-banner danger">{error}</div>}

      <div className="panel-card">
        <h3 className="panel-title">System Event Log</h3>
        <div className="audit-table-wrapper">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operator</th>
                <th>Action</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No audit records.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{log.user_name || 'System / Guest'}</span>
                      <br />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.user_email || ''}</span>
                    </td>
                    <td>
                      <span className={`badge-role ${getActionBadgeClass(log.action)}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <pre className="audit-details-json">
                        {JSON.stringify(log.details)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
