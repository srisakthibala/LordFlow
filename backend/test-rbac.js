import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5555;
const BASE_URL = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('--- Starting LoadFlow API RBAC & Compliance Integration Tests ---');
  
  const serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: PORT.toString() }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server stderr] ${data}`);
  });

  await sleep(1500);

  let passed = true;

  const testAssert = (condition, message) => {
    if (condition) {
      console.log(`[PASS] ${message}`);
    } else {
      console.error(`[FAIL] ${message}`);
      passed = false;
    }
  };

  try {
    console.log('\n--- 1. Registering Users ---');
    
    const regBrokerRes = await fetch(`${BASE_URL}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@broker-a.com',
        password: 'Password123',
        name: 'Broker Admin',
        orgName: 'Broker Logistics A',
        orgType: 'broker'
      })
    });
    const brokerAdminData = await regBrokerRes.json();
    testAssert(regBrokerRes.status === 201 && brokerAdminData.token, 'Registered Broker Admin successfully');
    const brokerToken = brokerAdminData.token;

    const regCarrierBRes = await fetch(`${BASE_URL}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@carrier-b.com',
        password: 'Password123',
        name: 'Carrier B Admin',
        orgName: 'Carrier Fast B',
        orgType: 'carrier'
      })
    });
    const carrierBData = await regCarrierBRes.json();
    testAssert(regCarrierBRes.status === 201, 'Registered Carrier B Admin successfully');
    const carrierBToken = carrierBData.token;
    const carrierBOrgId = carrierBData.user.org_id;

    const regCarrierCRes = await fetch(`${BASE_URL}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@carrier-c.com',
        password: 'Password123',
        name: 'Carrier C Admin',
        orgName: 'Carrier Old C',
        orgType: 'carrier'
      })
    });
    const carrierCData = await regCarrierCRes.json();
    testAssert(regCarrierCRes.status === 201, 'Registered Carrier C Admin successfully');
    const carrierCToken = carrierCData.token;
    const carrierCOrgId = carrierCData.user.org_id;

    const regShipperRes = await fetch(`${BASE_URL}/api/auth/register-shipper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'shipper@shipper-x.com',
        password: 'Password123',
        name: 'Shipper Business X'
      })
    });
    const shipperData = await regShipperRes.json();
    testAssert(regShipperRes.status === 201, 'Registered Shipper X successfully');
    const shipperId = shipperData.user.id;
    const shipperToken = shipperData.token;

    console.log('\n--- 2. Role Manager & Staff RBAC ---');
    
    const createRoleRes = await fetch(`${BASE_URL}/api/auth/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({
        name: 'Dispatcher',
        permissions: ['load.assign_carrier', 'load.update_status']
      })
    });
    const roleData = await createRoleRes.json();
    testAssert(createRoleRes.status === 201 && roleData.name === 'Dispatcher', 'Broker Admin created custom "Dispatcher" role');
    const dispatcherRoleId = roleData.id;

    const createStaffRes = await fetch(`${BASE_URL}/api/auth/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({
        email: 'dispatcher-john@broker-a.com',
        password: 'StaffPassword123',
        name: 'John Dispatcher',
        role_id: dispatcherRoleId
      })
    });
    testAssert(createStaffRes.status === 201, 'Created staff member with Dispatcher role');

    const staffLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dispatcher-john@broker-a.com',
        password: 'StaffPassword123'
      })
    });
    const staffLoginData = await staffLoginRes.json();
    testAssert(staffLoginRes.status === 200 && staffLoginData.token, 'Staff member logged in successfully');
    const staffToken = staffLoginData.token;

    console.log('\n--- 3. API-Layer Permission Checking ---');
    
    const createLoadFailRes = await fetch(`${BASE_URL}/api/loads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        shipper_id: shipperId,
        origin: 'Chicago, IL',
        destination: 'Dallas, TX',
        pickup_date: '2026-08-01',
        delivery_date: '2026-08-04',
        equipment_type: 'Dry Van',
        commodity: 'General Freight',
        weight: 42000
      })
    });
    testAssert(createLoadFailRes.status === 403, 'Denied load creation for staff lacking "load.create" permission');

    const createLoadSuccessRes = await fetch(`${BASE_URL}/api/loads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({
        shipper_id: shipperId,
        origin: 'Chicago, IL',
        destination: 'Dallas, TX',
        pickup_date: '2026-08-01',
        delivery_date: '2026-08-04',
        equipment_type: 'Dry Van',
        commodity: 'General Freight',
        weight: 42000
      })
    });
    const loadData = await createLoadSuccessRes.json();
    testAssert(createLoadSuccessRes.status === 201 && loadData.id, 'Broker Admin successfully created load');
    const loadId = loadData.id;

    console.log('\n--- 4. Multi-Tenant Scoping (Org & Object Level) ---');

    const carrierGetLoadRes = await fetch(`${BASE_URL}/api/loads/${loadId}`, {
      headers: { 'Authorization': `Bearer ${carrierBToken}` }
    });
    testAssert(carrierGetLoadRes.status === 403, 'Object-level scope blocked Carrier B from reading load before assignment');

    const shipperGetLoadRes = await fetch(`${BASE_URL}/api/loads/${loadId}`, {
      headers: { 'Authorization': `Bearer ${shipperToken}` }
    });
    testAssert(shipperGetLoadRes.status === 200, 'Shipper X is allowed to read their own load');

    console.log('\n--- 5. Compliance Verification ---');

    const updateComplianceCRes = await fetch(`${BASE_URL}/api/compliance/${carrierCOrgId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${carrierCToken}`
      },
      body: JSON.stringify({
        insurance_expiry: '2026-01-01',
        authority_status: 'inactive',
        dot_number: 'DOT888888',
        mc_number: 'MC999999',
        approved_equipment: ['Reefer'],
        approved_commodities: ['Produce']
      })
    });
    testAssert(updateComplianceCRes.status === 200, 'Configured Carrier C compliance parameters to invalid values');

    const assignCarrierCRes = await fetch(`${BASE_URL}/api/loads/${loadId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({ carrier_id: carrierCOrgId })
    });
    const assignCarrierCData = await assignCarrierCRes.json();
    testAssert(
      assignCarrierCRes.status === 200 && assignCarrierCData.compliance_flagged === true,
      'Assigning non-compliant Carrier C auto-flags the load with compliance issues'
    );

    console.log('\n--- 6. State Machine Compliance Locking ---');

    const createRateRes = await fetch(`${BASE_URL}/api/rates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({
        load_id: loadId,
        base_rate: 1500,
        fuel_surcharge: 300,
        accessorials: { detention: 50 }
      })
    });
    const rateData = await createRateRes.json();
    testAssert(createRateRes.status === 201, 'Broker created rate confirmation version 1');
    const rateId = rateData.id;

    const confirmRateRes = await fetch(`${BASE_URL}/api/rates/${rateId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${carrierCToken}`
      }
    });
    const confirmRateData = await confirmRateRes.json();
    testAssert(
      confirmRateRes.status === 200 && confirmRateData.compliance_flagged === true,
      'Rate confirmed by carrier, but auto-transition to Rate Confirmed is BLOCKED due to compliance flag'
    );

    const advanceStatusRes = await fetch(`${BASE_URL}/api/loads/${loadId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({ status: 'Rate Confirmed' })
    });
    const advanceStatusData = await advanceStatusRes.json();
    testAssert(
      advanceStatusRes.status === 400 && advanceStatusData.compliance_flagged === true,
      'State transition past Carrier Assigned BLOCKED by compliance engine'
    );

    console.log('\n--- 7. Compliance Overrides ---');

    const overrideFailRes = await fetch(`${BASE_URL}/api/loads/${loadId}/override-compliance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({ reason: 'Need to move this load urgently' })
    });
    testAssert(overrideFailRes.status === 403, 'Denied compliance override for user without permission');

    const overrideSuccessRes = await fetch(`${BASE_URL}/api/loads/${loadId}/override-compliance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({ reason: 'Broker Ops Lead override - verified carrier paper documents manually.' })
    });
    testAssert(overrideSuccessRes.status === 200, 'Authorized Broker Admin successfully overrode compliance block');

    const advanceStatusAfterRes = await fetch(`${BASE_URL}/api/loads/${loadId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${brokerToken}`
      },
      body: JSON.stringify({ status: 'Rate Confirmed' })
    });
    testAssert(advanceStatusAfterRes.status === 200, 'State transition succeeded after compliance override is in place');

    console.log('\n--- 8. Audit Trail Verification ---');

    const auditRes = await fetch(`${BASE_URL}/api/audit`, {
      headers: { 'Authorization': `Bearer ${brokerToken}` }
    });
    const logs = await auditRes.json();
    
    const deniedLogs = logs.filter(l => l.action === 'PERMISSION_DENIED');
    testAssert(deniedLogs.length >= 2, `Audit trail recorded permission denied attempts (found ${deniedLogs.length})`);
    
    const overrideLog = logs.find(l => l.action === 'COMPLIANCE_OVERRIDDEN');
    testAssert(overrideLog, 'Audit trail recorded the compliance override event');

  } catch (err) {
    console.error('Error during test execution:', err);
    passed = false;
  } finally {
    serverProcess.kill();
    console.log('\n--- Integration Tests Finished ---');
    if (passed) {
      console.log('ALL TESTS PASSED SUCCESSFULLY! ✅');
      process.exit(0);
    } else {
      console.error('SOME TESTS FAILED. ❌');
      process.exit(1);
    }
  }
}

runTests();
