// tariffEngine.js
// Builds a bill from a meter's accumulated usage. Slab pricing + time-of-use
// + fixed charge + electricity duty, basically how a DISCOM bills.
// The simulator already splits usage into peak/normal/offpeak buckets, this
// just reads those and does the math.

// telescopic slabs: first 100 units cheap, gets dearer. last slab open-ended.
const SLABS = [
  { upTo: 100,      rate: 4.00 },   // Rs/kWh
  { upTo: 300,      rate: 6.50 },
  { upTo: 500,      rate: 8.50 },
  { upTo: Infinity, rate: 10.00 },
];

// time-of-use. evening peak +50%, late-night offpeak -30%. rest is normal @ 1x.
const TOU = {
  peak:    { hours: [18, 19, 20, 21],                   multiplier: 1.50 },
  offpeak: { hours: [23, 0, 1, 2, 3, 4, 5],             multiplier: 0.70 },
};

const FIXED_MONTHLY_CHARGE = 50;     // Rs, flat
const ELECTRICITY_DUTY_PCT = 0.05;   // 5% duty on subtotal

const round = (n, d = 2) => Number((Number(n) || 0).toFixed(d));

// hour -> bucket. used by the simulator when recording and here. keeping it in
// one place so they can't drift.
function classifyHour(hour) {
  if (TOU.peak.hours.includes(hour)) return 'peak';
  if (TOU.offpeak.hours.includes(hour)) return 'offpeak';
  return 'normal';
}

// split kWh across the slabs and price each chunk. 250 kWh -> 100@4 + 150@6.50.
function slabBreakdown(totalKWh) {
  const out = [];
  let remaining = totalKWh;
  let prev = 0; // top of the previous slab
  for (const slab of SLABS) {
    if (remaining <= 0) break;
    const slabKWh = Math.min(remaining, slab.upTo - prev); // how much fits here
    if (slabKWh > 0) {
      out.push({ from: prev, to: prev + slabKWh, kWh: round(slabKWh), rate: slab.rate, amount: round(slabKWh * slab.rate) });
    }
    remaining -= slabKWh;
    prev = slab.upTo;
  }
  return out;
}

// main entry. takes a meter doc, returns the full itemised bill off
// meter.tariffSlots (running per-bucket totals from the simulator).
function computeBill(meter) {
  const slots = meter.tariffSlots || { peak: 0, normal: 0, offpeak: 0 };
  const totalKWh = (slots.peak || 0) + (slots.normal || 0) + (slots.offpeak || 0);

  // base slab cost. effectiveRate is the blended Rs/kWh, used as the reference
  // for the TOU adjustments below.
  const slabs = slabBreakdown(totalKWh);
  const slabAmount = slabs.reduce((s, x) => s + x.amount, 0);
  const effectiveRate = totalKWh > 0 ? slabAmount / totalKWh : 0;

  // TOU on top: peak units pay extra 50% of blended rate, offpeak get 30% off.
  const peakSurcharge   = slots.peak    * effectiveRate * (TOU.peak.multiplier - 1);
  const offpeakDiscount = slots.offpeak * effectiveRate * (1 - TOU.offpeak.multiplier);

  const energyCharge = slabAmount + peakSurcharge - offpeakDiscount;
  const subtotal = energyCharge + FIXED_MONTHLY_CHARGE;
  const duty = subtotal * ELECTRICITY_DUTY_PCT;
  const total = subtotal + duty;

  // rough end-of-month estimate: scale spend-so-far by daysInMonth/daysElapsed.
  // straight line, good enough for the "on track to pay X" widget. floor elapsed
  // at 0.5 day so a bill pulled on day 1 doesn't blow up.
  const now = new Date();
  const cycleStart = meter.billingCycleStart
    ? new Date(meter.billingCycleStart)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInCycle = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(0.5, (now - cycleStart) / 86400000);
  const ratio = daysInCycle / daysElapsed;

  return {
    cycleStart,
    daysInCycle,
    daysElapsed: round(daysElapsed, 1),
    consumed: {
      peak: round(slots.peak),
      normal: round(slots.normal),
      offpeak: round(slots.offpeak),
      total: round(totalKWh),
    },
    projected: {
      peak: round(slots.peak * ratio),
      normal: round(slots.normal * ratio),
      offpeak: round(slots.offpeak * ratio),
      total: round(totalKWh * ratio),
    },
    slabBreakdown: slabs,
    energyCharge: round(energyCharge),
    peakSurcharge: round(peakSurcharge),
    offpeakDiscount: round(offpeakDiscount),
    fixedCharge: FIXED_MONTHLY_CHARGE,
    subtotal: round(subtotal),
    dutyPct: ELECTRICITY_DUTY_PCT * 100,
    duty: round(duty),
    total: round(total),
    projectedTotal: round(total * ratio),
    effectiveRate: round(effectiveRate, 3),
    // send config back so the UI shows the rate card without hardcoding it twice
    tariffMeta: { slabs: SLABS, tou: TOU, fixedMonthlyCharge: FIXED_MONTHLY_CHARGE, dutyPct: ELECTRICITY_DUTY_PCT },
  };
}

module.exports = { computeBill, classifyHour, TOU, SLABS };
