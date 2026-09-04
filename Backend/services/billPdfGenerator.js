// Generates a printable electricity bill PDF using PDFKit.
// Returns Promise<Buffer> — stream it as a download from the controller.

const PDFDocument = require('pdfkit');

// formatting helpers 

const INR = (n) =>
  `₹ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });


const C = {
  ink:       '#0a0f1e',   // near-black background
  inkMid:    '#111827',   // card backgrounds
  slate:     '#1e2d45',   // subtle bands
  accent:    '#00e5ff',   // cyan spark
  accentDim: '#0891b2',   // muted cyan
  white:     '#f0f6ff',
  muted:     '#94a3b8',
  rule:      '#1e3a5f',
  danger:    '#f97316',
  good:      '#34d399',
};

function generateBillPdf(meter, bill) {
  return new Promise((resolve, reject) => {
    try {
      const doc    = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W  = doc.page.width;   // 595.28
      const H  = doc.page.height;  // 841.89
      const M  = 36;               // left/right margin

      
      doc.rect(0, 0, W, H).fill(C.ink);

      
      doc.save();
      doc.opacity(0.04);
      for (let i = 0; i < 20; i++) {
        doc.moveTo(W - 200 + i * 12, 0).lineTo(W, 200 - i * 12)
           .lineWidth(6).strokeColor(C.accent).stroke();
      }
      doc.restore();

      
      //  HEADER
      
      doc.rect(0, 0, W, 90).fill(C.inkMid);

      // left accent bar
      doc.rect(0, 0, 4, 90).fill(C.accent);

      // logo 
      doc.fillColor(C.accent)
         .font('Helvetica-Bold').fontSize(26)
         .text('GRID', M + 4, 22, { continued: true })
         .fillColor(C.white)
         .text('PULSE');

      doc.fillColor(C.muted).font('Helvetica').fontSize(9)
         .text('SMART ELECTRICITY MANAGEMENT', M + 4, 54);

      // bill meta (right side)
      const billNo = `GP-${String(meter._id).slice(-8).toUpperCase()}`;
      doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(10)
         .text('TAX INVOICE', 0, 22, { align: 'right', width: W - M });
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
         .text(billNo, 0, 37, { align: 'right', width: W - M });
      doc.fillColor(C.muted).font('Helvetica').fontSize(9)
         .text(`Generated: ${fmtDate(new Date())}`, 0, 54, { align: 'right', width: W - M });


      //  TWO-COLUMN INFO CARDS  (customer  |  billing period)

      const cardY = 106;
      const cardH = 88;
      const cardW = (W - M * 2 - 10) / 2;

      // card backgrounds
      doc.roundedRect(M,             cardY, cardW, cardH, 6).fill(C.slate);
      doc.roundedRect(M + cardW + 10, cardY, cardW, cardH, 6).fill(C.slate);

      // left-edge accent line on each card
      doc.rect(M, cardY, 3, cardH).fill(C.accent);
      doc.rect(M + cardW + 10, cardY, 3, cardH).fill(C.accentDim);

      // customer card
      let y = cardY + 12;
      doc.fillColor(C.accentDim).font('Helvetica-Bold').fontSize(8)
         .text('BILL TO', M + 10, y);
      y += 14;
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(12)
         .text(meter.customerName || 'Customer', M + 10, y);
      y += 16;
      doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
         .text(`Meter: ${meter.serial}`, M + 10, y);
      y += 12;
      doc.text(`Type: ${meter.loadProfile} · ${meter.phases}-phase`, M + 10, y);
      y += 12;
      doc.text(`Feeder: ${meter.feeder?.name || '—'}`, M + 10, y);

      // period card
      const cx2 = M + cardW + 20;
      y = cardY + 12;
      doc.fillColor(C.accentDim).font('Helvetica-Bold').fontSize(8)
         .text('BILLING PERIOD', cx2, y);
      y += 14;
      const cycleEnd = new Date(
        new Date(bill.cycleStart).getFullYear(),
        new Date(bill.cycleStart).getMonth() + 1, 0
      );
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(10.5)
         .text(`${fmtDate(bill.cycleStart)}  →  ${fmtDate(cycleEnd)}`, cx2, y);
      y += 16;
      doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
         .text(`Days elapsed: ${bill.daysElapsed} of ${bill.daysInCycle}`, cx2, y);
      y += 12;
      doc.text(`Effective rate: ₹ ${bill.effectiveRate} / kWh`, cx2, y);
      y += 12;
      doc.text(`Billing cycle start: ${fmtDate(bill.cycleStart)}`, cx2, y);

      
      //  CONSUMPTION BAND  (TOU split)
      
      y = cardY + cardH + 18;
      doc.rect(M, y, W - M * 2, 72).fill(C.inkMid);
      doc.rect(M, y, W - M * 2, 3).fill(C.accent);  // top accent stripe

      // section label
      doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(8)
         .text('CONSUMPTION  ·  TIME-OF-USE BREAKDOWN', M + 12, y + 10);

      const touY   = y + 25;
      const colW   = (W - M * 2 - 24) / 3;

      const touItems = [
        { label: 'OFF-PEAK',  sub: '23:00 – 06:00', kWh: bill.consumed.offpeak, color: C.good },
        { label: 'NORMAL',    sub: '06:00 – 18:00', kWh: bill.consumed.normal,  color: C.muted },
        { label: 'PEAK',      sub: '18:00 – 22:00', kWh: bill.consumed.peak,    color: C.danger },
      ];

      touItems.forEach(({ label, sub, kWh, color }, i) => {
        const cx = M + 12 + i * (colW + 8);

        // small color dot
        doc.circle(cx, touY + 5, 4).fill(color);

        doc.fillColor(color).font('Helvetica-Bold').fontSize(8)
           .text(label, cx + 12, touY);
        doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
           .text(sub, cx + 12, touY + 11);
        doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16)
           .text(`${kWh} kWh`, cx, touY + 24);
      });

      // total (right side)
      doc.fillColor(C.muted).font('Helvetica').fontSize(8)
         .text('TOTAL', W - M - 90, touY);
      doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(22)
         .text(`${bill.consumed.total}`, W - M - 90, touY + 12);
      doc.fillColor(C.muted).font('Helvetica').fontSize(9)
         .text('kWh', W - M - 90, touY + 38);

      
      //  SLAB TABLE
      
      y = touY + 72;

      doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
         .text('SLAB-WISE ENERGY CHARGES', M, y);
      y += 14;

      // table header
      doc.rect(M, y, W - M * 2, 20).fill(C.slate);
      const T = { slab: M + 8, units: M + 175, rate: M + 285, amt: W - M - 8 };
      doc.fillColor(C.accentDim).font('Helvetica-Bold').fontSize(8);
      doc.text('SLAB',      T.slab,  y + 6);
      doc.text('UNITS',     T.units, y + 6);
      doc.text('RATE /kWh', T.rate,  y + 6);
      doc.text('AMOUNT',    0,       y + 6, { align: 'right', width: W - M });
      y += 20;

      doc.font('Helvetica').fontSize(9.5).fillColor(C.white);
      bill.slabBreakdown.forEach((s, idx) => {
        if (idx % 2 === 0) doc.rect(M, y, W - M * 2, 18).fill('#0d1a2e');
        doc.fillColor(C.white)
           .text(`${s.from} – ${s.to} kWh`, T.slab,  y + 4)
           .text(s.kWh.toFixed(2),           T.units, y + 4)
           .text(`₹ ${s.rate.toFixed(2)}`,    T.rate,  y + 4)
           .text(INR(s.amount),              0,       y + 4, { align: 'right', width: W - M });
        y += 18;
      });

      
      //  CHARGE SUMMARY
      
      y += 10;
      doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.rule).stroke();
      y += 10;

      const slabTotal = bill.slabBreakdown.reduce((s, x) => s + x.amount, 0);

      const lineItem = (label, value, color = C.muted, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
           .fillColor(bold ? C.white : C.muted)
           .text(label, M, y);
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
           .text(value, 0, y, { align: 'right', width: W - M });
        y += 16;
      };

      lineItem('Energy charges (slab total)',       INR(slabTotal));
      lineItem('Peak-hour surcharge (TOU)',    `+ ${INR(bill.peakSurcharge)}`,    C.danger);
      lineItem('Off-peak discount (TOU)',      `– ${INR(bill.offpeakDiscount)}`,  C.good);
      lineItem('Fixed monthly service charge',       INR(bill.fixedCharge));

      y += 2;
      doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.rule).stroke();
      y += 8;

      lineItem('Subtotal',                           INR(bill.subtotal),   C.white, true);
      lineItem(`Electricity duty (${bill.dutyPct}%)`, INR(bill.duty));

      
      //  AMOUNT DUE BLOCK
      
      y += 6;
      const dueH = 52;
      doc.roundedRect(M, y, W - M * 2, dueH, 8).fill(C.accentDim);
      doc.roundedRect(M, y, W - M * 2, dueH, 8).lineWidth(1.5).strokeColor(C.accent).stroke();

      doc.fillColor(C.white).font('Helvetica').fontSize(9)
         .text('TOTAL AMOUNT DUE', M + 16, y + 10);
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(26)
         .text(INR(bill.total), 0, y + 10, { align: 'right', width: W - M - 16 });

      
      //  PROJECTION NOTE
      
      y += dueH + 16;
      doc.roundedRect(M, y, W - M * 2, 38, 5).fill(C.slate);
      doc.fillColor(C.accentDim).font('Helvetica-Bold').fontSize(8)
         .text('PROJECTED END-OF-CYCLE', M + 10, y + 7);
      doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
         .text(
           `Based on consumption to date, your estimated bill at cycle end is ` +
           `${INR(bill.projectedTotal)} (${bill.projected.total} kWh). ` +
           `Actual charges may vary.`,
           M + 10, y + 18, { width: W - M * 2 - 20 }
         );

      
      //  FOOTER
                   uu
      doc.rect(0, H - 44, W, 44).fill(C.inkMid);
      doc.rect(0, H - 44, W, 1.5).fill(C.rule);

      doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(9)
         .text('GRIDPULSE', M, H - 30);
      doc.fillColor(C.muted).font('Helvetica').fontSize(7.5)
         .text(
           'Auto-generated by the GridPulse platform. For billing disputes, contact your area office within 7 days of receipt.',
           M + 68, H - 30, { width: W - M * 2 - 68 }
         );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateBillPdf };
