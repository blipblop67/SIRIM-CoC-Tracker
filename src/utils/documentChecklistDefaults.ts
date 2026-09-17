import { CertificationScheme, DocumentChecklistItem } from '../types';

export const SCHEME_DOCUMENT_TEMPLATES: Array<Omit<DocumentChecklistItem, 'id' | 'status'>> = [
  {
    name: 'Circuit Schematic & Block Diagram',
    category: 'TECHNICAL',
    description: 'Detailed electronic schematic showing RF transceiver, oscillators, and power supply circuitry.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Special Approval', 'Safety & EMC (MS Standards)'],
  },
  {
    name: 'PCB Layout & Component Placement',
    category: 'TECHNICAL',
    description: 'Top/bottom PCB silk & copper trace layout with RF section callouts.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Special Approval'],
  },
  {
    name: 'RF Test Report (ILAC-MRA Accredited)',
    category: 'TEST_REPORT',
    description: 'Full unredacted RF test report (e.g. ETSI EN 300 328 / EN 301 893 / FCC Part 15C) from ISO/IEC 17025 lab.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Special Approval'],
  },
  {
    name: 'Electrical Safety Test Report (MS IEC 62368-1 / IEC 62368-1)',
    category: 'TEST_REPORT',
    description: 'Safety evaluation under CB Scheme or accredited lab covering thermal, electric shock, and energy hazards.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Safety & EMC (MS Standards)', 'CIDB Certification'],
  },
  {
    name: 'EMC Test Report (MS CISPR 32 / EN 301 489)',
    category: 'TEST_REPORT',
    description: 'Electromagnetic compatibility emissions & immunity test report.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Safety & EMC (MS Standards)'],
  },
  {
    name: 'Manufacturer Declaration of Conformity (DoC)',
    category: 'LEGAL_ADMIN',
    description: 'Signed manufacturer declaration attesting conformity to relevant Malaysian/international standards.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Special Approval', 'Safety & EMC (MS Standards)', 'CIDB Certification'],
  },
  {
    name: 'Brand / Trademark Authorization Letter',
    category: 'LEGAL_ADMIN',
    description: 'Letter from brand owner appointing Cytron Technologies Sdn Bhd as authorized Malaysian applicant.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Special Approval', 'CIDB Certification'],
  },
  {
    name: 'User Manual & Technical Datasheet',
    category: 'TECHNICAL',
    description: 'End-user manual containing operating instructions, safety precautions, and technical specifications.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'Special Approval', 'Safety & EMC (MS Standards)'],
  },
  {
    name: 'Antenna Peak Gain & Spec Sheet',
    category: 'TECHNICAL',
    description: 'Antenna type (PCB trace/chip/external dipole), radiation efficiency, and peak gain declaration (dBi).',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval'],
  },
  {
    name: 'MCMC Marking Artwork & Rating Plate',
    category: 'LABELING',
    description: 'Drawing of product rating plate showing proposed SIRIM/MCMC e-label or physical label dimensions.',
    requiredForSchemes: ['Type Approval (MCMC/SIRIM)', 'Modular Approval', 'CIDB Certification'],
  },
];

export function getDefaultChecklistForScheme(scheme: CertificationScheme): DocumentChecklistItem[] {
  const filtered = SCHEME_DOCUMENT_TEMPLATES.filter((t) => t.requiredForSchemes.includes(scheme));
  const now = new Date().toISOString();
  return filtered.map((item, idx) => ({
    ...item,
    id: `doc-chk-${Date.now()}-${idx}`,
    status: 'NOT_STARTED',
    updatedAt: now,
  }));
}
