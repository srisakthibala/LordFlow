import React, { useState, useEffect } from 'react';

const EQUIPMENT_OPTIONS = ['Dry Van', 'Reefer', 'Flatbed', 'Power Only', 'Step Deck'];
const COMMODITY_OPTIONS = ['General Freight', 'Produce', 'Steel', 'Hazardous Materials', 'Electronics'];

export default function CarrierCompliance({ user, token, API_URL }) {
  const [formData, setFormData] = useState({
    insurance_expiry: '', authority_status: 'active', dot_number: '', mc_number: '',
    approved_equipment: [], approved_commodities: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchCompliance = async () => {
    try {
      const res = await fetch(`${API_URL}/api/compliance/${user.org_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormData({
          insurance_expiry: data.insurance_expiry || '',
          authority_status: data.authority_status || 'active',
          dot_number: data.dot_number || '',
          mc_number: data.mc_number || '',
          approved_equipment: data.approved_equipment || [],
          approved_commodities: data.approved_commodities || []
        });
      }
    } catch (e) {
      setError('Connection failure.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompliance();
  }, []);

  const handleCheckboxChange = (field, item) => {
    const list = formData[field];
    if (list.includes(item)) {
      setFormData({ ...formData, [field]: list.filter((x) => x !== item) });
    } else {
      setFormData({ ...formData, [field]: [...list, item] });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    try {
      const res = await fetch(`${API_URL}/api/compliance/${user.org_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSuccess('Compliance updated.');
        fetchCompliance();
      } else {
        setError('Failed.');
      }
    } catch (err) {
      setError('Error.');
    }
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center' }}>Loading compliance records...</div>;

  const isAdmin = user.role_type === 'admin' || user.permissions?.includes('staff.manage');

  return (
    <div className="main-content">
      <div className="board-header">
        <h2>Carrier Compliance Profile</h2>
      </div>

      {error && <div className="alert-banner danger">{error}</div>}
      {success && <div className="alert-banner">{success}</div>}

      <div className="panel-card">
        <h3 className="panel-title">Federal Authorities & Insurance Certificates</h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label>DOT Identification Number</label>
              <input type="text" className="form-control" value={formData.dot_number} disabled={!isAdmin} onChange={(e) => setFormData({ ...formData, dot_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>MC Authority Number</label>
              <input type="text" className="form-control" value={formData.mc_number} disabled={!isAdmin} onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cargo Insurance Expiry Date</label>
              <input type="date" className="form-control" value={formData.insurance_expiry} disabled={!isAdmin} onChange={(e) => setFormData({ ...formData, insurance_expiry: e.target.value })} />
            </div>
            <div className="form-group">
              <label>FMCSA Authority Status</label>
              <select className="form-control" value={formData.authority_status} disabled={!isAdmin} onChange={(e) => setFormData({ ...formData, authority_status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Approved Equipment</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                {EQUIPMENT_OPTIONS.map(item => {
                  const checked = formData.approved_equipment.includes(item);
                  return (
                    <button type="button" key={item} disabled={!isAdmin} className={`btn ${checked ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '50px' }} onClick={() => handleCheckboxChange('approved_equipment', item)}>{item}</button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Approved Commodities</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                {COMMODITY_OPTIONS.map(item => {
                  const checked = formData.approved_commodities.includes(item);
                  return (
                    <button type="button" key={item} disabled={!isAdmin} className={`btn ${checked ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '50px' }} onClick={() => handleCheckboxChange('approved_commodities', item)}>{item}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {isAdmin && (
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Save Compliance Details</button>
          )}
        </form>
      </div>
    </div>
  );
}
