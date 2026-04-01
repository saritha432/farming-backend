const express = require('express');
const { getTable, setTable } = require('../db');

const router = express.Router();

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    // Lazy-initialize Twilio client if credentials are present
    // eslint-disable-next-line global-require
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    // If Twilio is not installed, just log; API will still work without SMS
    console.error('Twilio not configured or not installed:', err.message);
  }
}

function nextId(rows) {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

router.get('/', async (req, res) => {
  try {
    const rows = await getTable('equipment');
    const items = rows.map((r) => ({
      id: r.id,
      ownerUserId: r.ownerUserId != null ? Number(r.ownerUserId) : null,
      providerName: r.providerName || r.ownerName || r.farmerName || '',
      phone: r.phone || r.mobile || '',
      name: r.name,
      mode: r.mode,
      modeKey: r.mode,
      price: r.price,
      location: r.location || '',
      includesOperator: Boolean(r.includesOperator),
      operations: Array.isArray(r.operations)
        ? r.operations
        : typeof r.operations === 'string'
          ? r.operations.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      imageUrl: r.imageUrl || r.photoUrl || '',
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      name,
      mode,
      price,
      location,
      includesOperator,
      providerName,
      phone,
      operations,
      imageUrl,
      ownerUserId,
    } = req.body;
    if (!name || !mode || !price) {
      return res.status(400).json({ error: 'name, mode, and price are required' });
    }
    const rows = await getTable('equipment');
    const newRow = {
      id: nextId(rows),
      ownerUserId: ownerUserId != null && Number.isFinite(Number(ownerUserId)) ? Number(ownerUserId) : null,
      providerName: (providerName || '').toString().trim(),
      phone: (phone || '').toString().trim(),
      name,
      mode,
      price: price || '',
      location: location || '',
      includesOperator: Boolean(includesOperator),
      operations: Array.isArray(operations)
        ? operations.map((s) => (s || '').toString().trim()).filter(Boolean)
        : typeof operations === 'string'
          ? operations.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      imageUrl: (imageUrl || '').toString().trim(),
    };
    await setTable('equipment', [...rows, newRow]);
    res.status(201).json({
      ...newRow,
      modeKey: newRow.mode,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/equipment/requests
// Optional query params:
// - phone: filter requests for a specific phone number
// - equipmentId: filter for a specific equipment item
router.get('/requests', async (req, res) => {
  try {
    const phone = (req.query.phone || '').toString().trim();
    const equipmentId = req.query.equipmentId != null ? Number(req.query.equipmentId) : null;

    const requests = await getTable('equipment_requests');
    const list = Array.isArray(requests) ? requests : [];

    const filtered = list
      .filter((r) => {
        if (phone && (r.phone || '').toString().trim() !== phone) return false;
        if (Number.isFinite(equipmentId) && r.equipmentId !== equipmentId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load equipment requests' });
  }
});

// POST /api/equipment/:id/requests - create a booking/request for an equipment item
router.post('/:id/requests', async (req, res) => {
  try {
    const equipmentId = Number(req.params.id);
    if (!Number.isFinite(equipmentId)) {
      return res.status(400).json({ error: 'invalid equipment id' });
    }

    const { startDate, endDate, fullName, phone, notes } = req.body || {};
    if (!startDate || !endDate || !fullName || !phone) {
      return res.status(400).json({ error: 'startDate, endDate, fullName and phone are required' });
    }

    const equipment = await getTable('equipment');
    const equipmentItem = equipment.find((e) => e.id === equipmentId);
    if (!equipmentItem) {
      return res.status(404).json({ error: 'equipment not found' });
    }

    const requests = await getTable('equipment_requests');
    const newRequest = {
      id: nextId(requests),
      equipmentId,
      startDate,
      endDate,
      fullName: fullName.trim(),
      phone: phone.trim(),
      notes: (notes || '').trim(),
      createdAt: new Date().toISOString(),
    };

    await setTable('equipment_requests', [...requests, newRequest]);

    // Optionally send SMS notification to the requester, if Twilio is configured
    if (twilioClient && process.env.TWILIO_FROM_NUMBER) {
      try {
        await twilioClient.messages.create({
          body: `Hi ${newRequest.fullName}, your request for "${equipmentItem.name}" from ${newRequest.startDate} to ${newRequest.endDate} has been received. We'll contact you soon.`,
          from: process.env.TWILIO_FROM_NUMBER,
          to: newRequest.phone,
        });
      } catch (smsErr) {
        console.error('Failed to send SMS notification:', smsErr.message);
      }
    }

    res.status(201).json(newRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
