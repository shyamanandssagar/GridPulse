// Run with: npm run seed
// Builds a small but realistic radial distribution network:
//   1 Substation->3 Main Feeders->4 Lateral branches each->10 meters each lateral (mixed loadProfile)

// Total: ~120 meters, enough to exercise the simulator + indices meaningfully.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Feeder = require('../models/Feeder');
const Meter = require('../models/Meter');
const Reading = require('../models/Reading');
const Anomaly = require('../models/Anomaly');
const OutageEvent = require('../models/OutageEvent');

const SUBSTATION_NAME = 'Substation-A';
const NUM_MAIN_FEEDERS = 3;
const LATERALS_PER_FEEDER = 4;
const METERS_PER_LATERAL_MIN = 8;
const METERS_PER_LATERAL_MAX = 12;

const FIRST_NAMES = ['Aarav','Diya','Vihaan','Anaya','Arjun','Kavya','Rohan','Saanvi','Vivaan','Ishita','Aditya','Myra','Krishna','Riya','Reyansh'];
const LAST_NAMES = ['Sharma','Verma','Gupta','Iyer','Patel','Nair','Reddy','Khan','Singh','Joshi','Mehta','Rao'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function run() {
  await connectDB();

  console.log(' Clearing existing data...');
  await Promise.all([
    Feeder.deleteMany({}),
    Meter.deleteMany({}),
    Reading.deleteMany({}),
    Anomaly.deleteMany({}),
    OutageEvent.deleteMany({}),
  ]);

  console.log('  Building topology...');
  const substation = await Feeder.create({
    name: SUBSTATION_NAME,
    type: 'substation',
    parent: null,
    nominalVoltage: 11000,
    capacityKW: 5000,
  });

  const meterDocs = [];
  let meterCount = 0;

  for (let f = 1; f <= NUM_MAIN_FEEDERS; f++) {
    const feeder = await Feeder.create({
      name: `Feeder-${f}`,
      type: 'feeder',
      parent: substation._id,
      nominalVoltage: 11000,
      capacityKW: 1500,
    });

    for (let l = 1; l <= LATERALS_PER_FEEDER; l++) {
      const lateral = await Feeder.create({
        name: `F${f}-Lateral-${l}`,
        type: 'lateral',
        parent: feeder._id,
        nominalVoltage: 230,
        capacityKW: 200,
      });

      const meterCnt = rand(METERS_PER_LATERAL_MIN, METERS_PER_LATERAL_MAX);
      for (let m = 1; m <= meterCnt; m++) {
        meterCount++;
        const profile = Math.random() < 0.7 ? 'residential' : Math.random() < 0.5 ? 'commercial' : 'industrial';
        const phases = profile === 'industrial' ? 3 : 1;
        const baseLoadKW = profile === 'residential' ? 0.8 + Math.random() * 1.4
                         : profile === 'commercial' ? 2 + Math.random() * 4
                         : 5 + Math.random() * 15;
        const peakLoadKW = baseLoadKW * (2 + Math.random());
        meterDocs.push({
          serial: `MTR-${String(meterCount).padStart(5, '0')}`,
          customerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          feeder: lateral._id,
          loadProfile: profile,
          baseLoadKW: Number(baseLoadKW.toFixed(2)),
          peakLoadKW: Number(peakLoadKW.toFixed(2)),
          phases,
        });
      }
    }
  }

  await Meter.insertMany(meterDocs);
  console.log(` Seeded ${meterCount} meters across ${NUM_MAIN_FEEDERS} feeders  ${LATERALS_PER_FEEDER} laterals.`);

  await mongoose.disconnect();
  console.log(' Seed complete.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
