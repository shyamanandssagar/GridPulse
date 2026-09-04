// Reliability index calculations following the textbook definitions used in
// IEEE Std 1366. All indices are computed over a configurable time window
// (default = the most recent 30 days).
//
//  SAIFI = Σ(λᵢ Nᵢ) / Nₜ           (interruptions per customer)
//  SAIDI = Σ(Uᵢ Nᵢ) / Nₜ           (hours per customer per year, scaled to window)
//  CAIDI = SAIDI / SAIFI            (avg duration per interruption)
//  ASAI  = (Nₜ·H − Σ(Uᵢ Nᵢ)) / (Nₜ·H)   (service availability index)
//  ENS   = Σ(Lᵢ · Uᵢ)               (energy not supplied, kWh)
//
// where:
//   λᵢ = number of interruptions on event i (always 1 — each row is one event)
//   Nᵢ = customers affected on event i
//   Uᵢ = duration of event i (hours)
//   Nₜ = total customers in the system
//   Lᵢ = average load on the affected section (kW)
//   H  = hours in the analysis window

const OutageEvent = require('../models/OutageEvent');
const Meter = require('../models/Meter');

async function computeReliabilityIndices({ from, to } = {}) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const windowHours = (end.getTime() - start.getTime()) / 3_600_000;

  const totalCustomers = await Meter.countDocuments({});
  if (!totalCustomers) {
    return {
      window: { from: start, to: end, hours: windowHours },
      totalCustomers: 0,
      saifi: 0, saidi: 0, caidi: 0, asai: 1, ens: 0,
      eventsConsidered: 0,
    };
  }

  // Only count events that started within the window. For events still ongoing,
  // duration is computed up to `end`.
  const events = await OutageEvent.find({
    startedAt: { $gte: start, $lte: end },
  }).lean();

  let sumNiUi = 0;       // Σ Nᵢ · Uᵢ  (customer-hours of interruption)
  let sumNi = 0;         // Σ Nᵢ       (customer-interruptions)
  let ens = 0;           // Σ Lᵢ · Uᵢ  (kWh not supplied)

  for (const ev of events) {
    const restored = ev.restoredAt ? new Date(ev.restoredAt) : end;
    const durationH = Math.max(0, (restored.getTime() - new Date(ev.startedAt).getTime()) / 3_600_000);
    const Ni = ev.affectedMeters || 0;
    const Li = ev.affectedLoadKW || 0;
    sumNi += Ni;
    sumNiUi += Ni * durationH;
    ens += Li * durationH;
  }

  const saifi = sumNi / totalCustomers;
  const saidi = sumNiUi / totalCustomers;
  const caidi = saifi > 0 ? saidi / saifi : 0;
  const asai = (totalCustomers * windowHours - sumNiUi) / (totalCustomers * windowHours);

  return {
    window: { from: start, to: end, hours: round(windowHours, 2) },
    totalCustomers,
    eventsConsidered: events.length,
    saifi: round(saifi, 4),     // interruptions / customer
    saidi: round(saidi, 4),     // customer-hours / customer
    caidi: round(caidi, 4),     // hours / interruption
    asai: round(asai, 6),       // 0..1, often shown as %
    asaiPercent: round(asai * 100, 4),
    ens: round(ens, 2),   // kWh
  };
}

const round = (n, d) => Number(n.toFixed(d));

module.exports = { computeReliabilityIndices };
