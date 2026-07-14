import React, { useState, useEffect } from 'react';

export default function Dashboard({ user, token, API_URL }) {
  const [loads, setLoads] = useState([]);
  const [shippers, setShippers] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [ratesHistory, setRatesHistory] = useState([]);
  const [carrierCompliance, setCarrierCompliance] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLoadForm, setNewLoadForm] = useState({
    shipper_id: '', origin: '', destination: '', pickup_date: '', delivery_date: '',
    equipment_type: 'Dry Van', commodity: '', weight: ''
  });

  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [newRateForm, setNewRateForm] = useState({ base_rate: '', fuel_surcharge: '', accessorials: { detention: 0, layover: 0 } });
  const [podFileName, setPodFileName] = useState('');

  const hasPerm = (p) => {
    if (user.role_type === 'admin') return true;
    if (user.role_type === 'shipper') return p === 'shipper.view';
    return user.permissions?.includes(p);
  };

  const fetchLoads = async () => {
    try {
      const res = await fetch(`${API_URL}/api/loads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setLoads(await res.json());
    } catch (e) {
      setError('Connection failed.');
    }
  };

  const fetchSupportingData = async () => {
    if (user.org_type === 'broker') {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const shippersRes = await fetch(`${API_URL}/api/shippers`, { headers });
        const carriersRes = await fetch(`${API_URL}/api/carriers`, { headers });
        if (shippersRes.ok && carriersRes.ok) {
          setShippers(await shippersRes.json());
          setCarriers(await carriersRes.json());
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    fetchLoads();
    fetchSupportingData();
  }, []);

  const handleSelectLoad = async (load) => {
    setSelectedLoad(load);
    setRatesHistory([]);
    setCarrierCompliance(null);
    setOverrideReason('');
    setPodFileName('');
    setNewRateForm({ base_rate: '', fuel_surcharge: '', accessorials: { detention: 0, layover: 0 } });
    setError('');
    setSuccess('');

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const ratesRes = await fetch(`${API_URL}/api/rates/${load.id}`, { headers });
      if (ratesRes.ok) setRatesHistory(await ratesRes.json());

      if (load.carrier_id) {
        const compRes = await fetch(`${API_URL}/api/compliance/${load.carrier_id}`, { headers });
        if (compRes.ok) setCarrierCompliance(await compRes.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const refreshSelectedLoadDetails = async (loadId) => {
    try {
      const res = await fetch(`${API_URL}/api/loads/${loadId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const updatedLoad = await res.json();
        setSelectedLoad(updatedLoad);
        fetchLoads();

        if (updatedLoad.carrier_id) {
          const compRes = await fetch(`${API_URL}/api/compliance/${updatedLoad.carrier_id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (compRes.ok) setCarrierCompliance(await compRes.json());
        }

        const ratesRes = await fetch(`${API_URL}/api/rates/${loadId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (ratesRes.ok) setRatesHistory(await ratesRes.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateLoad = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newLoadForm.shipper_id || !newLoadForm.origin || !newLoadForm.destination || !newLoadForm.pickup_date || !newLoadForm.delivery_date || !newLoadForm.commodity || !newLoadForm.weight) {
      setError('Please fill in all attributes.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/loads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newLoadForm)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Load posted.');
        setShowCreateModal(false);
        setNewLoadForm({
          shipper_id: '', origin: '', destination: '', pickup_date: '', delivery_date: '',
          equipment_type: 'Dry Van', commodity: '', weight: ''
        });
        fetchLoads();
      } else {
        setError(data.error || 'Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleAssignCarrier = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedCarrierId) {
      setError('Please select a carrier.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/loads/${selectedLoad.id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ carrier_id: selectedCarrierId })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Carrier assigned.' + (data.compliance_flagged ? ' WARNING: Carrier out of compliance!' : ''));
        setSelectedCarrierId('');
        refreshSelectedLoadDetails(selectedLoad.id);
      } else {
        setError(data.error || 'Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleOverrideCompliance = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!overrideReason.trim()) {
      setError('Reason required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/loads/${selectedLoad.id}/override-compliance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: overrideReason })
      });
      if (res.ok) {
        setSuccess('Overridden.');
        setOverrideReason('');
        refreshSelectedLoadDetails(selectedLoad.id);
      } else {
        setError('Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleCreateRate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newRateForm.base_rate || !newRateForm.fuel_surcharge) {
      setError('Rates required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          load_id: selectedLoad.id,
          base_rate: newRateForm.base_rate,
          fuel_surcharge: newRateForm.fuel_surcharge,
          accessorials: newRateForm.accessorials
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Rate Confirmation v${data.version} issued.`);
        refreshSelectedLoadDetails(selectedLoad.id);
      } else {
        setError(data.error || 'Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleConfirmRate = async (rateId) => {
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/api/rates/${rateId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || 'Accepted.');
        refreshSelectedLoadDetails(selectedLoad.id);
      } else {
        setError(data.error || 'Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleUpdateStatus = async (nextStatus) => {
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/api/loads/${selectedLoad.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Advanced to ${nextStatus}.`);
        refreshSelectedLoadDetails(selectedLoad.id);
      } else {
        setError(data.error || 'Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const handleUploadPOD = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!podFileName.trim()) {
      setError('POD filename required.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/loads/${selectedLoad.id}/pod`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pod_filename: podFileName })
      });
      if (res.ok) {
        setSuccess('POD uploaded.');
        setPodFileName('');
        refreshSelectedLoadDetails(selectedLoad.id);
      } else {
        setError('Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  const filteredLoads = loads.filter((load) => {
    const originMatch = load.origin.toLowerCase().includes(searchTerm.toLowerCase());
    const destMatch = load.destination.toLowerCase().includes(searchTerm.toLowerCase());
    const commodityMatch = load.commodity.toLowerCase().includes(searchTerm.toLowerCase());
    const searchMatch = originMatch || destMatch || commodityMatch;

    if (statusFilter === 'All') return searchMatch;
    if (statusFilter === 'Alerts') return searchMatch && load.compliance_flag === 1 && load.compliance_override === 0;
    return searchMatch && load.status.toLowerCase() === statusFilter.toLowerCase();
  });

  const activeLoadsCount = loads.filter(l => l.status !== 'Invoiced/Closed').length;
  const alertLoadsCount = loads.filter(l => l.compliance_flag === 1 && l.compliance_override === 0).length;
  const pendingRatesCount = loads.filter(l => l.status === 'Carrier Assigned').length;

  const getStatusClass = (status) => {
    return status.toLowerCase().replace('/', '-').replace(' ', '-');
  };

  return (
    <div className="main-content">
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Shipments</span>
          <span className="metric-value">{activeLoadsCount}</span>
        </div>
        <div className="metric-card alert">
          <span className="metric-title">Compliance Alerts</span>
          <span className="metric-value">{alertLoadsCount}</span>
        </div>
        <div className="metric-card success">
          <span className="metric-title">Rate Pending</span>
          <span className="metric-value">{pendingRatesCount}</span>
        </div>
      </div>

      <div className="board-header">
        <div className="search-bar">
          <input
            type="text"
            className="form-control"
            placeholder="Search loads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {hasPerm('load.create') && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>Post Load</button>
          )}
        </div>

        <div className="auth-tabs" style={{ marginBottom: 0 }}>
          {['All', 'Posted', 'Carrier Assigned', 'Rate Confirmed', 'In Transit', 'Delivered', 'Alerts'].map((tab) => (
            <button
              key={tab}
              className={`auth-tab ${statusFilter === tab ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab)}
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.8rem' }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <h3 className="panel-title">Loads Board</h3>
        <div className="load-list">
          {filteredLoads.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No shipments.</div>
          ) : (
            filteredLoads.map((load) => (
              <div key={load.id} className="load-item" onClick={() => handleSelectLoad(load)}>
                <div className="load-route">
                  <span className="route-text">{load.origin} → {load.destination}</span>
                  <span className="route-sub">{load.equipment_type} | {load.commodity}</span>
                </div>
                <div className="load-detail">
                  <span className="detail-label">Shipper / Carrier</span>
                  <span className="detail-value" style={{ fontSize: '0.85rem' }}>
                    {load.shipper_name} <br />
                    <span style={{ color: 'var(--text-muted)' }}>{load.carrier_name || 'Unassigned'}</span>
                  </span>
                </div>
                <div className="load-detail">
                  <span className="detail-label">Status</span>
                  <span className={`badge-status ${getStatusClass(load.status)}`}>{load.status}</span>
                </div>
                <div className="load-detail" style={{ alignItems: 'flex-end' }}>
                  {load.compliance_flag === 1 && (
                    <span className={`badge-compliance ${load.compliance_override === 1 ? 'override' : ''}`}>
                      {load.compliance_override === 1 ? 'Overridden' : 'Alert'}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedLoad && (
        <div className="modal-overlay" onClick={() => setSelectedLoad(null)}>
          <div className="modal-content" style={{ maxWidth: '850px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedLoad.origin} → {selectedLoad.destination}</h3>
              <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setSelectedLoad(null)}>✕</button>
            </div>
            
            <div className="modal-body">
              {error && <div className="alert-banner danger">{error}</div>}
              {success && <div className="alert-banner">{success}</div>}

              <div className="load-details-grid">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="panel-card" style={{ padding: '1.25rem', background: 'var(--bg-input)' }}>
                    <h4 className="detail-label">Details</h4>
                    <div className="info-grid" style={{ marginTop: '0.5rem' }}>
                      <div>
                        <span className="detail-label">Equipment</span>
                        <p>{selectedLoad.equipment_type}</p>
                      </div>
                      <div>
                        <span className="detail-label">Weight</span>
                        <p>{selectedLoad.commodity} ({selectedLoad.weight} lbs)</p>
                      </div>
                      <div>
                        <span className="detail-label">Pickup / Delivery</span>
                        <p>{selectedLoad.pickup_date} / {selectedLoad.delivery_date}</p>
                      </div>
                    </div>
                  </div>

                  {selectedLoad.carrier_id && (
                    <div className="panel-card" style={{ padding: '1.25rem' }}>
                      <h4 className="detail-label">Carrier Compliance</h4>
                      {carrierCompliance ? (
                        <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                          <p><strong>Carrier:</strong> {selectedLoad.carrier_name}</p>
                          <p><strong>DOT:</strong> {carrierCompliance.dot_number} | MC: {carrierCompliance.mc_number}</p>
                          <p><strong>Insurance Expiry:</strong> {carrierCompliance.insurance_expiry}</p>
                          <p><strong>Authority Status:</strong> {carrierCompliance.authority_status.toUpperCase()}</p>
                          
                          {selectedLoad.compliance_flag === 1 && selectedLoad.compliance_override === 0 && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,0,0,0.05)' }}>
                              <p style={{ color: 'var(--danger)' }}>Compliance Issue Flagged.</p>
                              {hasPerm('load.override_compliance_flag') ? (
                                <form onSubmit={handleOverrideCompliance} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                  <input type="text" className="form-control" placeholder="Justification..." value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                                  <button type="submit" className="btn btn-danger">Override</button>
                                </form>
                              ) : (
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requires override permission.</p>
                              )}
                            </div>
                          )}

                          {selectedLoad.compliance_override === 1 && (
                            <p style={{ color: 'var(--warning)', marginTop: '0.5rem' }}><strong>Overridden:</strong> {selectedLoad.compliance_override_reason}</p>
                          )}
                        </div>
                      ) : (
                        <p>Loading compliance...</p>
                      )}
                    </div>
                  )}

                  {!selectedLoad.carrier_id && hasPerm('load.assign_carrier') && (
                    <div className="panel-card" style={{ padding: '1.25rem' }}>
                      <h4 className="detail-label">Assign Carrier</h4>
                      <form onSubmit={handleAssignCarrier} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <select className="form-control" value={selectedCarrierId} onChange={(e) => setSelectedCarrierId(e.target.value)}>
                          <option value="">-- Select --</option>
                          {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button type="submit" className="btn btn-primary">Assign</button>
                      </form>
                    </div>
                  )}

                  {selectedLoad.carrier_id && (
                    <div className="panel-card" style={{ padding: '1.25rem' }}>
                      <h4 className="detail-label">Rates</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {ratesHistory.map(rate => (
                          <div key={rate.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--bg-input)', fontSize: '0.85rem' }}>
                            <span><strong>v{rate.version}:</strong> ${rate.base_rate} base + ${rate.fuel_surcharge} fuel</span>
                            <div>
                              <span className={`badge-role ${rate.status === 'confirmed' ? 'shipper' : 'staff'}`}>{rate.status.toUpperCase()}</span>
                              {user.org_type === 'carrier' && rate.status === 'pending' && hasPerm('rate.confirm') && (
                                <button className="btn btn-primary" style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', marginLeft: '0.5rem' }} onClick={() => handleConfirmRate(rate.id)}>Accept</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {user.org_type === 'broker' && hasPerm('rate.confirm') && (
                        <form onSubmit={handleCreateRate} style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                          <span className="detail-label" style={{ display: 'block', marginBottom: '0.25rem' }}>New Rate Agreement</span>
                          <div className="form-row">
                            <input type="number" className="form-control" placeholder="Base Rate" value={newRateForm.base_rate} onChange={(e) => setNewRateForm({ ...newRateForm, base_rate: e.target.value })} />
                            <input type="number" className="form-control" placeholder="Fuel" value={newRateForm.fuel_surcharge} onChange={(e) => setNewRateForm({ ...newRateForm, fuel_surcharge: e.target.value })} />
                          </div>
                          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '0.5rem', padding: '0.4rem' }}>Issue</button>
                        </form>
                      )}
                    </div>
                  )}

                  {selectedLoad.carrier_id && (
                    <div className="panel-card" style={{ padding: '1.25rem' }}>
                      <h4 className="detail-label">Proof of Delivery (POD)</h4>
                      {selectedLoad.pod_filename ? (
                        <p style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ {selectedLoad.pod_filename}</p>
                      ) : (
                        <div>
                          {user.org_type === 'carrier' && hasPerm('pod.upload') && (
                            <form onSubmit={handleUploadPOD} style={{ display: 'flex', gap: '0.5rem' }}>
                              <input type="text" className="form-control" placeholder="POD filename..." value={podFileName} onChange={(e) => setPodFileName(e.target.value)} />
                              <button type="submit" className="btn btn-primary">Upload</button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="panel-card" style={{ padding: '1.25rem' }}>
                    <h4 className="detail-label">Transition State</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {selectedLoad.status === 'Carrier Assigned' && hasPerm('load.update_status') && (
                        <button className="btn btn-primary btn-block" onClick={() => handleUpdateStatus('Rate Confirmed')}>Advance Rate Confirmation</button>
                      )}
                      {selectedLoad.status === 'Rate Confirmed' && hasPerm('load.update_status') && (
                        <button className="btn btn-primary btn-block" onClick={() => handleUpdateStatus('Dispatched')}>Dispatch</button>
                      )}
                      {selectedLoad.status === 'Dispatched' && hasPerm('load.update_status') && (
                        <button className="btn btn-primary btn-block" onClick={() => handleUpdateStatus('In Transit')}>In Transit</button>
                      )}
                      {selectedLoad.status === 'In Transit' && hasPerm('load.update_status') && (
                        <button className="btn btn-primary btn-block" onClick={() => handleUpdateStatus('Delivered')}>Delivered</button>
                      )}
                      {selectedLoad.status === 'Delivered' && user.org_type === 'broker' && hasPerm('load.update_status') && (
                        <button className="btn btn-primary btn-block" onClick={() => handleUpdateStatus('POD Verified')}>Verify POD</button>
                      )}
                      {selectedLoad.status === 'POD Verified' && user.org_type === 'broker' && hasPerm('load.update_status') && (
                        <button className="btn btn-primary btn-block" onClick={() => handleUpdateStatus('Invoiced/Closed')}>Invoice/Close</button>
                      )}
                    </div>
                  </div>

                  <div className="panel-card" style={{ padding: '1.25rem' }}>
                    <h4 className="detail-label">Status Roadmap</h4>
                    <div className="timeline" style={{ marginTop: '0.5rem' }}>
                      {['Posted', 'Carrier Assigned', 'Rate Confirmed', 'Dispatched', 'In Transit', 'Delivered', 'POD Verified', 'Invoiced/Closed'].map((step, idx) => {
                        const states = ['Posted', 'Carrier Assigned', 'Rate Confirmed', 'Dispatched', 'In Transit', 'Delivered', 'POD Verified', 'Invoiced/Closed'];
                        const currentIdx = states.indexOf(selectedLoad.status);
                        const isCompleted = idx < currentIdx;
                        const isActive = idx === currentIdx;
                        return (
                          <div key={step} className={`timeline-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                            <span className="timeline-node"></span>
                            <span className="timeline-title" style={{ fontSize: '0.8rem', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Post Load</h3>
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateLoad}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label>Shipper</label>
                  <select className="form-control" value={newLoadForm.shipper_id} onChange={(e) => setNewLoadForm({ ...newLoadForm, shipper_id: e.target.value })}>
                    <option value="">-- Choose --</option>
                    {shippers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <input type="text" className="form-control" placeholder="Origin" value={newLoadForm.origin} onChange={(e) => setNewLoadForm({ ...newLoadForm, origin: e.target.value })} />
                  <input type="text" className="form-control" placeholder="Destination" value={newLoadForm.destination} onChange={(e) => setNewLoadForm({ ...newLoadForm, destination: e.target.value })} />
                </div>
                <div className="form-row">
                  <input type="date" className="form-control" value={newLoadForm.pickup_date} onChange={(e) => setNewLoadForm({ ...newLoadForm, pickup_date: e.target.value })} />
                  <input type="date" className="form-control" value={newLoadForm.delivery_date} onChange={(e) => setNewLoadForm({ ...newLoadForm, delivery_date: e.target.value })} />
                </div>
                <div className="form-row">
                  <select className="form-control" value={newLoadForm.equipment_type} onChange={(e) => setNewLoadForm({ ...newLoadForm, equipment_type: e.target.value })}>
                    <option value="Dry Van">Dry Van</option>
                    <option value="Reefer">Reefer</option>
                    <option value="Flatbed">Flatbed</option>
                  </select>
                  <input type="number" className="form-control" placeholder="Weight" value={newLoadForm.weight} onChange={(e) => setNewLoadForm({ ...newLoadForm, weight: e.target.value })} />
                </div>
                <input type="text" className="form-control" placeholder="Commodity" value={newLoadForm.commodity} onChange={(e) => setNewLoadForm({ ...newLoadForm, commodity: e.target.value })} />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary">Post</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
