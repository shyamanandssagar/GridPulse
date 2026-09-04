const asyncHandler = require('express-async-handler');
const Meter = require('../models/Meter');
const Reading = require('../models/Reading');
const { computeBill } = require('../services/tariffEngine');
const { generateBillPdf } = require('../services/billPdfGenerator');

// GET /api/meters
const listMeters = asyncHandler(async (req, res) => {
  const { feeder, status } = req.query;
  const q = {};
  if (feeder) q.feeder = feeder;
  if (status) q.status = status;
  // Regular users can only see their own assigned meters
  if (req.user?.role !== 'admin') {
    q._id = { $in: req.user.assignedMeters || [] };
  }
  const meters = await Meter.find(q).populate('feeder', 'name type status').lean();
  res.json(meters);
});

// GET /api/meters/:id
const getMeter = asyncHandler(async (req, res) => {
  const meter = await Meter.findById(req.params.id).populate('feeder').lean();
  if (!meter) {
    res.status(404);
    throw new Error('Meter not found');
  }
  // Enforce ownership for non-admins
  if (req.user?.role !== 'admin') {
    const owns = (req.user.assignedMeters || []).some(
      (id) => String(id) === String(meter._id)
    );
    if (!owns) {
      res.status(403);
      throw new Error('You do not have access to this meter');
    }
  }
  const lastReading = await Reading.findOne({ meter: meter._id }).sort({ timestamp: -1 }).lean();
  const bill = computeBill(meter);
  res.json({ ...meter, lastReading, bill });
});

// POST /api/meters
const createMeter = asyncHandler(async (req, res) => {
  const created = await Meter.create(req.body);
  res.status(201).json(created);
});

// PATCH /api/meters/:id
const updateMeter = asyncHandler(async (req, res) => {
  const updated = await Meter.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!updated) {
    res.status(404);
    throw new Error('Meter not found');
  }
  res.json(updated);
});

// DELETE /api/meters/:id
const deleteMeter = asyncHandler(async (req, res) => {
  const deleted = await Meter.findByIdAndDelete(req.params.id);
  if (!deleted) {
    res.status(404);
    throw new Error('Meter not found');
  }
  res.json({ deleted: true });
});

// GET /api/meters/:id/bill.pdf — streams a printable bill
const downloadBill = asyncHandler(async (req, res) => {
  const meter = await Meter.findById(req.params.id).populate('feeder').lean();
  if (!meter) {
    res.status(404);
    throw new Error('Meter not found');
  }
  if (req.user?.role !== 'admin') {
    const owns = (req.user.assignedMeters || []).some(
      (id) => String(id) === String(meter._id)
    );
    if (!owns) {
      res.status(403);
      throw new Error('You do not have access to this meter');
    }
  }
  const bill = computeBill(meter);
  const pdf = await generateBillPdf(meter, bill);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bill_${meter.serial}.pdf"`);
  res.send(pdf);
});

module.exports = { listMeters, getMeter, createMeter, updateMeter, deleteMeter, downloadBill };
