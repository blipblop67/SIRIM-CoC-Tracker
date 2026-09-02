import { SirimApplication } from '../types';

export const INITIAL_SIRIM_APPLICATIONS: SirimApplication[] = [
  {
    id: 'sirim-app-001',
    threadId: 'th_sirim_esp32_iot_gw',
    applicationRef: 'SQAS/CMCS/2026/0418',
    productName: 'Maker Feather ESP32-S3 IoT Gateway',
    modelNumber: 'CYT-FEATHER-S3-V2',
    brand: 'Cytron',
    applicant: 'Cytron Technologies Sdn Bhd',
    scheme: 'Type Approval (MCMC/SIRIM)',
    status: 'RFI_ACTION_REQUIRED',
    officerName: 'Nurul Huda binti Ahmad',
    officerEmail: 'nurulhuda@sirim.my',
    submissionDate: '2026-08-10',
    lastActivityDate: '2026-08-26',
    targetDeadline: '2026-09-02',
    processingFeeRm: 1850,
    paymentStatus: 'PAID',
    syncedToSheet: true,
    lastSyncedAt: '2026-08-27T10:30:00Z',
    notes: 'Awaiting revised schematics and SAR test report summary as requested by SIRIM QAS evaluator.',
    actionItems: [
      {
        id: 'act-001-1',
        title: 'Submit Revised Antenna Gain Declaration & Schematics',
        description: 'SIRIM evaluator requested updated peak antenna gain measurement certificate (2.4GHz Wi-Fi / BLE 5.0) and modular layout schematics.',
        assignedTo: 'APPLICANT',
        dueDate: '2026-09-02',
        isCompleted: false,
        priority: 'CRITICAL',
        requiredActionType: 'SUBMIT_DOC',
        emailSourceSnippet: 'Please provide the clarified antenna peak gain test report (EN 300 328 v2.2.2) within 7 working days to proceed with technical evaluation.'
      },
      {
        id: 'act-001-2',
        title: 'Confirm e-ComM label mock-up artwork',
        description: 'Verify SIRIM-MCMC certification label placement on outer packaging and PCB silkscreen.',
        assignedTo: 'APPLICANT',
        dueDate: '2026-09-05',
        isCompleted: false,
        priority: 'HIGH',
        requiredActionType: 'PROVIDE_CLARIFICATION'
      }
    ],
    timeline: [
      {
        id: 'tl-001-1',
        date: '2026-08-10',
        title: 'Application Lodged via e-ComM Portal',
        description: 'Initial application submitted for Type Approval (Wi-Fi 802.11 b/g/n & Bluetooth Low Energy).',
        sender: 'rupa@cytron.io',
        emailSubject: 'e-ComM Application Submission: Ref SQAS/CMCS/2026/0418',
        type: 'document'
      },
      {
        id: 'tl-001-2',
        date: '2026-08-14',
        title: 'Processing Fee Invoiced & Settled',
        description: 'Official invoice RM 1,850 issued by SIRIM QAS International. Payment completed via online FPX.',
        sender: 'billing@sirim.my',
        emailSubject: 'SIRIM QAS Receipt & Confirmation of Payment - SQAS/CMCS/2026/0418',
        type: 'payment'
      },
      {
        id: 'tl-001-3',
        date: '2026-08-26',
        title: 'Request for Information (RFI) Received',
        description: 'Officer Nurul Huda issued query regarding Wi-Fi antenna radiation pattern and test lab ISO/IEC 17025 scope.',
        sender: 'nurulhuda@sirim.my',
        emailSubject: 'URGENT RFI: Technical Evaluation for SQAS/CMCS/2026/0418 (CYT-FEATHER-S3-V2)',
        emailSnippet: 'Dear Applicant, Kindly furnish the missing EN 300 328 test laboratory accreditation annex and revised antenna peak gain report. Response required before 02-Sep-2026.',
        type: 'rfi'
      }
    ],
    emailThreads: [
      {
        id: 'msg-001-1',
        messageId: 'msg_sirim_001_1@mail.gmail.com',
        from: 'no-reply@ecomm.sirim.my',
        to: 'rupa@cytron.io',
        date: '2026-08-10T09:15:00Z',
        subject: '[e-ComM Notification] New Application Registered: SQAS/CMCS/2026/0418',
        snippet: 'Your application for Type Approval of Maker Feather ESP32-S3 IoT Gateway has been successfully registered.',
        bodyText: 'Dear Cytron Technologies Sdn Bhd,\n\nWe acknowledge receipt of your application Ref: SQAS/CMCS/2026/0418 for Type Approval.\nProduct: Maker Feather ESP32-S3 IoT Gateway (Model: CYT-FEATHER-S3-V2)\nBrand: Cytron\n\nPlease track your application status via e-ComM portal.',
        hasAttachments: true,
        attachmentNames: ['Application_Summary_SQAS_0418.pdf']
      },
      {
        id: 'msg-001-2',
        messageId: 'msg_sirim_001_2@mail.gmail.com',
        from: 'nurulhuda@sirim.my',
        to: 'rupa@cytron.io',
        date: '2026-08-26T14:40:00Z',
        subject: 'URGENT RFI: Technical Evaluation for SQAS/CMCS/2026/0418 (CYT-FEATHER-S3-V2)',
        snippet: 'Dear Applicant, Kindly furnish the missing EN 300 328 test laboratory accreditation annex and revised antenna peak gain report.',
        bodyText: 'Dear Ms. Rupa,\n\nRef: SQAS/CMCS/2026/0418\nModel: CYT-FEATHER-S3-V2\n\nUpon technical evaluation of your test reports, the evaluator has noted the following queries:\n1. The RF test report provided lacks the appendix showing the ISO/IEC 17025 accreditation scope covering ETSI EN 300 328 v2.2.2.\n2. Please confirm the antenna type (PCB trace vs IPEX external) and provide the peak gain declaration.\n\nPlease upload the revised documents through e-ComM within 7 working days (Deadline: 02 September 2026). Failure to respond may result in application rejection.\n\nBest regards,\nNurul Huda binti Ahmad\nSenior Executive, Communication & Multimedia Certification Section (CMCS)\nSIRIM QAS International Sdn. Bhd.',
        hasAttachments: false
      }
    ]
  },
  {
    id: 'sirim-app-002',
    threadId: 'th_sirim_ble_sensor_node',
    applicationRef: 'SQAS/CMCS/2026/0392',
    productName: 'Cytron Industrial LoRaWAN / BLE Smart Agri Sensor',
    modelNumber: 'CYT-LORA-AGRI-01',
    brand: 'Cytron',
    applicant: 'Cytron Technologies Sdn Bhd',
    scheme: 'Type Approval (MCMC/SIRIM)',
    status: 'SAMPLE_REQUESTED',
    officerName: 'Mohd Farhan bin Zulkifli',
    officerEmail: 'farhanz@sirim.my',
    submissionDate: '2026-07-28',
    lastActivityDate: '2026-08-24',
    targetDeadline: '2026-09-07',
    processingFeeRm: 2400,
    paymentStatus: 'PAID',
    syncedToSheet: true,
    lastSyncedAt: '2026-08-27T10:30:00Z',
    notes: '1 unit of working sample with test firmware required for physical inspection & RF radiated spurious emissions spot test.',
    actionItems: [
      {
        id: 'act-002-1',
        title: 'Dispatch 1x Working Sample with Test Mode Firmware to SIRIM Complex Shah Alam',
        description: 'Prepare sample configured with continuous wave (CW) transmission mode on 919-923 MHz and BLE beaconing. Deliver to SIRIM QAS Building 25, Shah Alam.',
        assignedTo: 'APPLICANT',
        dueDate: '2026-09-07',
        isCompleted: false,
        priority: 'CRITICAL',
        requiredActionType: 'SEND_SAMPLE',
        emailSourceSnippet: 'Kindly arrange courier delivery of 1 (one) unit sample with test mode instructions to SIRIM QAS Building 25.'
      },
      {
        id: 'act-002-2',
        title: 'Provide Test Mode User Guide & Frequency Switching Guide',
        description: 'Provide quick instruction manual detailing how the SIRIM test engineer can lock transmit frequencies for LoRa (AS923) and BLE.',
        assignedTo: 'APPLICANT',
        dueDate: '2026-09-07',
        isCompleted: false,
        priority: 'HIGH',
        requiredActionType: 'SUBMIT_DOC'
      }
    ],
    timeline: [
      {
        id: 'tl-002-1',
        date: '2026-07-28',
        title: 'Application Submitted',
        description: 'Submitted for MCMC Class Assignment compliance (919-923 MHz LoRa and 2.4 GHz BLE).',
        sender: 'rupa@cytron.io',
        type: 'document'
      },
      {
        id: 'tl-002-2',
        date: '2026-08-05',
        title: 'Initial Document Review Passed',
        description: 'FCC ID and CE RED test reports verified by SIRIM engineering desk.',
        sender: 'farhanz@sirim.my',
        type: 'status_change'
      },
      {
        id: 'tl-002-3',
        date: '2026-08-24',
        title: 'Physical Sample Request Issued',
        description: 'SIRIM QAS requested 1x hardware sample for verification of operating frequencies and conducted spurious checks.',
        sender: 'farhanz@sirim.my',
        type: 'sample'
      }
    ],
    emailThreads: [
      {
        id: 'msg-002-1',
        messageId: 'msg_sirim_002_1@mail.gmail.com',
        from: 'farhanz@sirim.my',
        to: 'rupa@cytron.io',
        date: '2026-08-24T11:20:00Z',
        subject: 'Sample Call Notice: SQAS/CMCS/2026/0392 (Cytron LoRa Agri Sensor)',
        snippet: 'Please be informed that 1 unit of product sample is required for verification testing.',
        bodyText: 'Dear Cytron Team,\n\nReference: SQAS/CMCS/2026/0392\nProduct: Industrial LoRaWAN / BLE Smart Agri Sensor (CYT-LORA-AGRI-01)\n\nTo complete the Type Approval evaluation, please send 1 sample unit along with power adapter and test mode operation guide to:\n\nAttention: Mohd Farhan bin Zulkifli\nRadio Frequency & EMC Testing Section\nSIRIM QAS International Sdn. Bhd.\nBuilding 25, SIRIM Complex, 1, Persiaran Dato\' Menteri, 40700 Shah Alam, Selangor.\n\nPlease ensure sample reaches by 07-Sep-2026.\n\nThank you,\nMohd Farhan',
        hasAttachments: true,
        attachmentNames: ['Sample_Delivery_Form_0392.pdf']
      }
    ]
  },
  {
    id: 'sirim-app-003',
    threadId: 'th_sirim_smart_ac_adapter',
    applicationRef: 'SQAS/EECS/2026/1104',
    productName: '65W GaN USB-C PD Fast Power Adapter',
    modelNumber: 'CYT-GAN65-PD',
    brand: 'Cytron Power',
    applicant: 'Cytron Technologies Sdn Bhd',
    scheme: 'Safety & EMC (MS Standards)',
    status: 'APPROVED',
    officerName: 'Kavitha A/P Subramaniam',
    officerEmail: 'kavitha@sirim.my',
    submissionDate: '2026-06-15',
    lastActivityDate: '2026-08-18',
    certificateNo: 'COA/EECS/2026/MS-65W-8821',
    certificateExpiryDate: '2027-08-17',
    processingFeeRm: 3200,
    paymentStatus: 'PAID',
    syncedToSheet: true,
    lastSyncedAt: '2026-08-27T10:30:00Z',
    notes: 'Certificate of Approval (CoA) & Certificate of Conformity (CoC) issued. SIRIM label purchasing quota unlocked.',
    actionItems: [
      {
        id: 'act-003-1',
        title: 'Purchase SIRIM Safety Security Labels (SIRIM MS IEC 62368-1)',
        description: 'Order initial batch of 5,000 holographic security labels from SIRIM label unit.',
        assignedTo: 'APPLICANT',
        dueDate: '2026-09-15',
        isCompleted: true,
        completedAt: '2026-08-20',
        priority: 'MEDIUM',
        requiredActionType: 'SUBMIT_DOC'
      },
      {
        id: 'act-003-2',
        title: 'Calendar Renewal Reminder for 2027 Expiry',
        description: 'Certificate expires on 17-Aug-2027. Initiate renewal dossier 60 days before expiration.',
        assignedTo: 'APPLICANT',
        dueDate: '2027-06-17',
        isCompleted: false,
        priority: 'LOW',
        requiredActionType: 'RENEW_CERTIFICATE'
      }
    ],
    timeline: [
      {
        id: 'tl-003-1',
        date: '2026-06-15',
        title: 'Safety CoA Dossier Lodged',
        description: 'CB Scheme Test Certificate & Report (IEC 62368-1:2018) submitted.',
        sender: 'rupa@cytron.io',
        type: 'document'
      },
      {
        id: 'tl-003-2',
        date: '2026-07-10',
        title: 'Factory Inspection & Malaysian Plug Top Review Passed',
        description: 'MS 589-2 3-pin plug certification validated.',
        sender: 'kavitha@sirim.my',
        type: 'status_change'
      },
      {
        id: 'tl-003-3',
        date: '2026-08-18',
        title: 'Certificate of Conformity (CoC) Issued',
        description: 'Approval certificate COA/EECS/2026/MS-65W-8821 granted for 1 year validity.',
        sender: 'kavitha@sirim.my',
        emailSubject: 'ISSUANCE OF CERTIFICATE: SQAS/EECS/2026/1104 (CYT-GAN65-PD)',
        type: 'approval'
      }
    ],
    emailThreads: [
      {
        id: 'msg-003-1',
        messageId: 'msg_sirim_003_1@mail.gmail.com',
        from: 'kavitha@sirim.my',
        to: 'rupa@cytron.io',
        date: '2026-08-18T16:05:00Z',
        subject: 'ISSUANCE OF CERTIFICATE OF CONFORMITY: SQAS/EECS/2026/1104',
        snippet: 'We are pleased to inform you that your application for Certificate of Conformity has been APPROVED.',
        bodyText: 'Dear Cytron Technologies,\n\nWe are pleased to attach the official Certificate of Approval (CoA) & Certificate of Conformity for:\nProduct: 65W GaN USB-C PD Fast Power Adapter\nModel: CYT-GAN65-PD\nCertificate No: COA/EECS/2026/MS-65W-8821\nStandard: MS IEC 62368-1:2018\nValidity: 18 August 2026 until 17 August 2027\n\nYou may now proceed to purchase the SIRIM Safety Labels through the e-Permit portal.\n\nWarm regards,\nKavitha Subramaniam\nElectrical & Electronic Certification Section\nSIRIM QAS International',
        hasAttachments: true,
        attachmentNames: ['CoC_Certificate_CYT-GAN65-PD.pdf', 'Official_Product_Schedule.pdf']
      }
    ]
  },
  {
    id: 'sirim-app-004',
    threadId: 'th_sirim_robot_controller_special',
    applicationRef: 'SQAS/SPEC/2026/0155',
    productName: 'Cytron RoboMaster High-Power DC Driver & 5.8GHz Telemetry',
    modelNumber: 'CYT-MDDS60-5G8',
    brand: 'Cytron',
    applicant: 'Cytron Technologies Sdn Bhd',
    scheme: 'Special Approval',
    status: 'PAYMENT_PENDING',
    officerName: 'Zainab binti Othman',
    officerEmail: 'zainab@sirim.my',
    submissionDate: '2026-08-20',
    lastActivityDate: '2026-08-27',
    targetDeadline: '2026-09-03',
    processingFeeRm: 850,
    paymentStatus: 'UNPAID',
    syncedToSheet: true,
    lastSyncedAt: '2026-08-27T10:30:00Z',
    notes: 'Special Approval for R&D university robotics trial (batch limit 50 units). Payment voucher generated.',
    actionItems: [
      {
        id: 'act-004-1',
        title: 'Pay SIRIM Special Approval Evaluation Fee (RM 850.00)',
        description: 'Complete FPX online payment or bank transfer to SIRIM QAS International Account (Maybank 512334301982). Quote Ref SQAS/SPEC/2026/0155.',
        assignedTo: 'APPLICANT',
        dueDate: '2026-09-03',
        isCompleted: false,
        priority: 'HIGH',
        requiredActionType: 'PAY_FEE',
        emailSourceSnippet: 'Please settle invoice INV-2026-SP-0155 amounting to RM850 within 7 days to commence file assignment.'
      }
    ],
    timeline: [
      {
        id: 'tl-004-1',
        date: '2026-08-20',
        title: 'Special Approval Application Lodged',
        description: 'Trial exemption for academic robotics competition submitted.',
        sender: 'rupa@cytron.io',
        type: 'document'
      },
      {
        id: 'tl-004-2',
        date: '2026-08-27',
        title: 'Invoice Issued for Special Approval Processing',
        description: 'Payment invoice RM 850 generated by finance department.',
        sender: 'zainab@sirim.my',
        emailSubject: 'Payment Request: Special Approval SQAS/SPEC/2026/0155',
        type: 'payment'
      }
    ],
    emailThreads: [
      {
        id: 'msg-004-1',
        messageId: 'msg_sirim_004_1@mail.gmail.com',
        from: 'zainab@sirim.my',
        to: 'rupa@cytron.io',
        date: '2026-08-27T08:30:00Z',
        subject: 'Payment Request: Special Approval SQAS/SPEC/2026/0155 (CYT-MDDS60-5G8)',
        snippet: 'Please find attached invoice for Special Approval processing fee. Kindly make payment by 03-Sep-2026.',
        bodyText: 'Dear Cytron Technologies,\n\nYour application for Special Approval Ref: SQAS/SPEC/2026/0155 has passed initial administrative screening.\n\nPlease settle the processing fee of RM 850.00 before 03-September-2026.\nInvoice No: INV-2026-SP-0155\n\nUpon payment verification, the technical team will review the 5.8GHz power spectral density documentation.\n\nThank you,\nZainab Othman',
        hasAttachments: true,
        attachmentNames: ['Invoice_INV_2026_SP_0155.pdf']
      }
    ]
  },
  {
    id: 'sirim-app-005',
    threadId: 'th_sirim_modular_esp32_c6',
    applicationRef: 'SQAS/CMCS/2026/0501',
    productName: 'Cytron ESP32-C6 Zigbee/Thread/Wi-Fi 6 Module',
    modelNumber: 'CYT-ESP32-C6-MOD',
    brand: 'Cytron',
    applicant: 'Cytron Technologies Sdn Bhd',
    scheme: 'Modular Approval',
    status: 'FINAL_EVALUATION',
    officerName: 'Ahmad Faiz bin Ibrahim',
    officerEmail: 'faizibrahim@sirim.my',
    submissionDate: '2026-08-01',
    lastActivityDate: '2026-08-25',
    targetDeadline: '2026-08-31',
    processingFeeRm: 2100,
    paymentStatus: 'PAID',
    syncedToSheet: true,
    lastSyncedAt: '2026-08-27T10:30:00Z',
    notes: 'Technical evaluation and shield shielding integrity test complete. In final approval stage with SIRIM Certification Panel.',
    actionItems: [
      {
        id: 'act-005-1',
        title: 'Awaiting Certification Committee Final Sign-off',
        description: 'Committee review scheduled for Friday session. Officer indicated certificate issuance expected by early next week.',
        assignedTo: 'SIRIM',
        dueDate: '2026-08-31',
        isCompleted: false,
        priority: 'MEDIUM',
        requiredActionType: 'AWAIT_SIRIM'
      }
    ],
    timeline: [
      {
        id: 'tl-005-1',
        date: '2026-08-01',
        title: 'Modular Approval Application Lodged',
        description: 'Full modular approval for IEEE 802.15.4 (Zigbee 3.0 / Thread) and Wi-Fi 6.',
        sender: 'rupa@cytron.io',
        type: 'document'
      },
      {
        id: 'tl-005-2',
        date: '2026-08-12',
        title: 'Modular Shielding & Integration Guide Verified',
        description: 'Host integrator design manual approved by radio desk.',
        sender: 'faizibrahim@sirim.my',
        type: 'status_change'
      },
      {
        id: 'tl-005-3',
        date: '2026-08-25',
        title: 'Moved to Final Certification Panel',
        description: 'Officer confirmed technical dossier forwarded to SIRIM Certification Panel for seal approval.',
        sender: 'faizibrahim@sirim.my',
        type: 'status_change'
      }
    ],
    emailThreads: [
      {
        id: 'msg-005-1',
        messageId: 'msg_sirim_005_1@mail.gmail.com',
        from: 'faizibrahim@sirim.my',
        to: 'rupa@cytron.io',
        date: '2026-08-25T15:10:00Z',
        subject: 'Update: Modular Approval SQAS/CMCS/2026/0501 (CYT-ESP32-C6-MOD)',
        snippet: 'Technical review is completed. File has been submitted to the Certification Panel.',
        bodyText: 'Dear Ms. Rupa,\n\nWe are pleased to inform you that all technical queries for CYT-ESP32-C6-MOD have been satisfactorily addressed.\n\nThe file has been submitted to the Certification Panel for final endorsement. You will receive the electronic Certificate of Conformity (e-CoC) once endorsed.\n\nEstimated completion: 31-August-2026.\n\nRegards,\nAhmad Faiz Ibrahim',
        hasAttachments: false
      }
    ]
  }
];
