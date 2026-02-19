import { Resend } from 'resend';
import PDFDocument from 'pdfkit';

const resend = new Resend(process.env.RESEND_API_KEY);

function fmt(n) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function generatePDF(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 72 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = 595 - 144; // A4 width minus margins

    // Date (right aligned)
    doc.font('Helvetica').fontSize(11)
      .text(d.date, { align: 'right' });

    doc.moveDown(2);

    // Salutation
    doc.text('Estimados Srs:', { align: 'left' });
    doc.moveDown();
    doc.text('Por medio de la presente les solicito que por favor gestionen una transferencia bancaria según los siguientes datos:', {
      align: 'left', lineGap: 2
    });

    doc.moveDown(1.5);

    // Table
    const colLeft = 72;
    const col1Width = 200;
    const col2Width = pageWidth - col1Width;
    const rowHeight = 28;
    const cellPad = 6;

    const rows = [
      ['Ordenante', 'Verdi Square Asset Management SL'],
      ['Cuenta del ordenante', 'ES63 0128 0892 5701 0005 3572'],
      ['Importe y divisa', fmt(d.amount) + ' ' + d.currency],
      ['Beneficiario', d.beneficiario],
      ['Cuenta del beneficiario',
        'Banco Intermediario: ' + d.bancoIntermediario + '\n' +
        'Ciudad: ' + d.ciudadIntermediario + '\n' +
        'Swift Code: ' + d.swiftIntermediario + '\n' +
        'ABA: ' + d.aba + '\n' +
        'Banco Beneficiario: ' + d.bancoBeneficiario + '\n' +
        'Swift code: ' + d.swiftBeneficiario + '\n' +
        'Beneficiario Final: ' + d.ibanBeneficiario
      ],
      ['Dirección completa del beneficiario', d.dirBeneficiario],
      ['Dirección completa del banco del beneficiario', d.dirBanco],
    ];

    let y = doc.y;

    rows.forEach(([label, value]) => {
      const valueLines = value.split('\n');
      const lineCount = valueLines.length;
      const rh = Math.max(rowHeight, cellPad * 2 + lineCount * 14);

      // Check page overflow
      if (y + rh > 750) {
        doc.addPage();
        y = 72;
      }

      // Draw cells
      doc.rect(colLeft, y, col1Width, rh).stroke();
      doc.rect(colLeft + col1Width, y, col2Width, rh).stroke();

      // Label
      doc.font('Helvetica').fontSize(10)
        .text(label, colLeft + cellPad, y + cellPad, {
          width: col1Width - cellPad * 2,
          lineGap: 2
        });

      // Value
      doc.font('Helvetica').fontSize(10)
        .text(value, colLeft + col1Width + cellPad, y + cellPad, {
          width: col2Width - cellPad * 2,
          lineGap: 2
        });

      y += rh;
    });

    doc.y = y + 24;

    // Closing
    doc.font('Helvetica').fontSize(11)
      .text('Agradecemos que esta transferencia se gestione lo más rápido posible.', { lineGap: 2 })
      .text('Cualquier cosa, por favor no duden en avisar.')
      .text('Muchas gracias,');

    doc.moveDown(3);

    doc.text('_________________________________')
      .moveDown(0.3)
      .text('Administrador Único')
      .text('Verdi Square Asset Management');

    doc.end();
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const d = req.body;

    // Validate required fields
    const required = ['amount', 'currency', 'beneficiario', 'dirBeneficiario',
                      'bancoBeneficiario', 'swiftBeneficiario', 'ibanBeneficiario',
                      'submitterName', 'submitterEmail'];
    for (const field of required) {
      if (!d[field]) return res.status(400).json({ error: `Missing field: ${field}` });
    }

    // Generate PDF
    const pdfBuffer = await generatePDF(d);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Send email with PDF attachment
    await resend.emails.send({
      from: 'Wire Requests <noreply@onix-cp.com>',
      to: 'mk@onix-cp.com',
      subject: `Wire Transfer Request ${d.ref} – ${d.beneficiario} – ${fmt(d.amount)} ${d.currency}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;">
          <h2 style="color:#1a1a2e;border-bottom:2px solid #c9a84c;padding-bottom:8px;">
            Wire Transfer Request
          </h2>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <tr><td style="padding:8px;color:#888;width:40%;">Reference</td><td style="padding:8px;font-weight:bold;">${d.ref}</td></tr>
            <tr style="background:#faf9f7;"><td style="padding:8px;color:#888;">Submitted by</td><td style="padding:8px;">${d.submitterName} (${d.submitterEmail})</td></tr>
            <tr><td style="padding:8px;color:#888;">Amount</td><td style="padding:8px;font-weight:bold;">${fmt(d.amount)} ${d.currency}</td></tr>
            <tr style="background:#faf9f7;"><td style="padding:8px;color:#888;">Beneficiario</td><td style="padding:8px;">${d.beneficiario}</td></tr>
            <tr><td style="padding:8px;color:#888;">Bank</td><td style="padding:8px;">${d.bancoBeneficiario}</td></tr>
            <tr style="background:#faf9f7;"><td style="padding:8px;color:#888;">Swift</td><td style="padding:8px;">${d.swiftBeneficiario}</td></tr>
            <tr><td style="padding:8px;color:#888;">IBAN / Account</td><td style="padding:8px;">${d.ibanBeneficiario}</td></tr>
            <tr style="background:#faf9f7;"><td style="padding:8px;color:#888;">Reference/Purpose</td><td style="padding:8px;">${d.referencia || '–'}</td></tr>
            <tr><td style="padding:8px;color:#888;">Date</td><td style="padding:8px;">${d.date}</td></tr>
          </table>
          <p style="font-size:12px;color:#aaa;">PDF attached — ready to sign and forward to BankInter.</p>
        </div>
      `,
      attachments: [{
        filename: `Wire_Transfer_${d.ref}.pdf`,
        content: pdfBase64,
      }]
    });

    return res.status(200).json({ success: true, ref: d.ref });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
