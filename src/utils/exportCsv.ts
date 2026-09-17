import { SirimApplication } from '../types';

export function exportApplicationsToCsv(applications: SirimApplication[], filename?: string): void {
  const headers = [
    'Application Reference',
    'Product Name',
    'Model Number',
    'Brand',
    'Applicant',
    'Certification Scheme',
    'Current Status',
    'SIRIM Officer Name',
    'SIRIM Officer Email',
    'Hardware Supplier Name',
    'Hardware Supplier Email',
    'Supplier Document Status',
    'Submission Date',
    'Last Activity Date',
    'Target SLA Deadline',
    'Pending Actions Count',
    'Certificate No',
    'Certificate Expiry Date',
    'Days Until Expiry',
    'Processing Fee (RM)',
    'Payment Status',
    'Detected Standards',
    'Email Subject',
    'Gmail Thread Link',
    'Notes',
  ];

  const now = new Date();

  const rows = applications.map((app) => {
    let daysUntilExpiry = '';
    if (app.certificateExpiryDate) {
      const exp = new Date(app.certificateExpiryDate);
      const diffMs = exp.getTime() - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      daysUntilExpiry = isNaN(days) ? '' : days < 0 ? `Expired (${Math.abs(days)}d ago)` : `${days} days`;
    }

    const pendingActions = (app.actionItems || [])
      .filter((a) => !a.isCompleted)
      .map((a) => `[${a.priority}] ${a.title} (${a.assignedTo})`)
      .join('; ');

    const standardsStr = (app.standards || []).join('; ');

    const fields = [
      app.applicationRef || '',
      app.productName || '',
      app.modelNumber || '',
      app.brand || '',
      app.applicant || 'Cytron Technologies Sdn Bhd',
      app.scheme || '',
      app.status || '',
      app.officerName || '',
      app.officerEmail || '',
      app.supplierName || '',
      app.supplierEmail || '',
      app.supplierStatus || 'NOT_INVOLVED',
      app.submissionDate || '',
      app.lastActivityDate || '',
      app.targetDeadline || '',
      (app.actionItems || []).filter((a) => !a.isCompleted).length.toString(),
      app.certificateNo || 'Pending',
      app.certificateExpiryDate || '',
      daysUntilExpiry,
      app.processingFeeRm ? app.processingFeeRm.toString() : '',
      app.paymentStatus || 'NOT_APPLICABLE',
      standardsStr,
      app.emailSubject || '',
      app.gmailThreadLink || '',
      app.notes || '',
    ];

    // Escape CSV quotes and wrap in quotes
    return fields
      .map((val) => {
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(',');
  });

  // UTF-8 BOM (\uFEFF) ensures Excel reads accented characters and UTF-8 symbols properly
  const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const defaultFilename = `SIRIM_CoC_Applications_Register_${new Date().toISOString().split('T')[0]}.csv`;
  link.setAttribute('download', filename || defaultFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
