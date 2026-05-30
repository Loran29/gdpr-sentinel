import {
  AuditEntry,
  DashboardStats,
  Finding,
  OwnerSummary,
  ReproducibilitySnapshot,
  ResourceIntensity,
  Scan,
  SourceOption,
  User
} from "@/types/models";

export const app_nav_items = [
  { href: "/run-scan", label: "Run scan" },
  { href: "/my-findings", label: "My findings" },
  { href: "/admin-dashboard", label: "Admin dashboard" },
  { href: "/data-owners", label: "Data owners" },
  { href: "/audit-log", label: "Audit log" }
] as const;

export const users: User[] = [
  {
    id: "u_001",
    name: "Sara Hoffmann",
    email: "sara.hoffmann@bosch-internal.example",
    department: "Project Management",
    role: "employee",
    is_master_of_data: false
  },
  {
    id: "u_002",
    name: "David Schmid",
    email: "david.schmid@bosch-internal.example",
    department: "Engineering",
    role: "employee",
    is_master_of_data: false
  },
  {
    id: "u_003",
    name: "Elena Fischer",
    email: "elena.fischer@bosch-internal.example",
    department: "Digital Operations",
    role: "employee",
    is_master_of_data: false
  },
  {
    id: "u_004",
    name: "Nina Beck",
    email: "nina.beck@bosch-internal.example",
    department: "People & Culture",
    role: "employee",
    is_master_of_data: false
  },
  {
    id: "u_005",
    name: "Jonas Keller",
    email: "jonas.keller@bosch-internal.example",
    department: "IT Governance",
    role: "admin",
    is_master_of_data: false
  },
  {
    id: "u_006",
    name: "Markus Weber",
    email: "markus.weber@bosch-internal.example",
    department: "HR",
    role: "admin",
    is_master_of_data: true
  },
  {
    id: "u_007",
    name: "Anna Schmidt",
    email: "anna.schmidt@bosch-internal.example",
    department: "Finance",
    role: "admin",
    is_master_of_data: true
  },
  {
    id: "u_008",
    name: "Tobias Becker",
    email: "tobias.becker@bosch-internal.example",
    department: "IT",
    role: "admin",
    is_master_of_data: true
  }
];

export const source_options: SourceOption[] = [
  { id: "source_local", label: "Local folder", path: "/data/local/demo/" },
  { id: "source_onedrive", label: "OneDrive stub", path: "/data/onedrive/all/" },
  { id: "source_sharepoint_hr", label: "SharePoint HR", path: "/data/shared/HR/" },
  { id: "source_finance", label: "Finance shared drive", path: "/data/shared/Finance/" },
  { id: "source_it", label: "IT shared drive", path: "/data/shared/IT/" }
];

export const base_scans: Scan[] = [
  {
    id: "scan_2026053014",
    source_id: "source_onedrive",
    scan_type: "full",
    started_at: "2026-05-30T14:22:48Z",
    completed_at: "2026-05-30T14:23:11Z",
    duration_sec: 23.4,
    files_processed: 15,
    files_skipped: 0,
    files_with_findings: 12,
    total_findings: 47,
    result_hash: "b91e4c...",
    status: "completed"
  },
  {
    id: "scan_2026053013",
    source_id: "source_onedrive",
    scan_type: "full",
    started_at: "2026-05-30T13:54:45Z",
    completed_at: "2026-05-30T13:55:09Z",
    duration_sec: 24.1,
    files_processed: 15,
    files_skipped: 0,
    files_with_findings: 12,
    total_findings: 47,
    result_hash: "b91e4c...",
    status: "completed"
  },
  {
    id: "scan_2026053012",
    source_id: "source_onedrive",
    scan_type: "delta",
    started_at: "2026-05-30T13:20:38Z",
    completed_at: "2026-05-30T13:20:44Z",
    duration_sec: 6.2,
    files_processed: 3,
    files_skipped: 12,
    files_with_findings: 3,
    total_findings: 9,
    result_hash: "15ac6b...",
    status: "completed"
  }
];

// TODO backend integration: replace with GET /findings/by-user/{user_id} and GET /findings/{finding_id}
export const initial_findings: Finding[] = [
  {
    id: "f_001",
    scan_id: "scan_2026053014",
    file_id: "file_001",
    file_name: "Expense_Report_Example_A.pdf",
    file_path: "/data/onedrive/sara.hoffmann/Expense_Report_Example_A.pdf",
    file_size_bytes: 2470,
    file_sha256: "a3f5e8...",
    document_type: "expense_report",
    sensitivity_level: "high",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Sara Hoffmann",
        context: "Employee",
        detector: "presidio",
        confidence: 0.92
      },
      {
        type: "EMPLOYEE_ID",
        value: "E-20491",
        context: "Employee ID",
        detector: "regex",
        confidence: 1
      },
      {
        type: "PERSON_NAME",
        value: "Philipp Neumann",
        context: "Manager",
        detector: "presidio",
        confidence: 0.89
      },
      {
        type: "FINANCIAL_AMOUNT",
        value: "128.40 EUR",
        context: "Amount",
        detector: "regex",
        confidence: 1
      }
    ],
    reasoning:
      "Expense reimbursement containing your full name, employee ID, and manager information. Personal data processed under GDPR Art. 6(1)(b). Fiscal retention obligation (Section 147 AO) of 10 years applies.",
    retention_recommendation: "Retain 10 years from end of fiscal year, then delete.",
    owner_user_id: "u_001",
    owner_name: "Sara Hoffmann",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_002",
    scan_id: "scan_2026053014",
    file_id: "file_002",
    file_name: "Travel_Itinerary_Q2.pdf",
    file_path: "/data/onedrive/sara.hoffmann/Travel_Itinerary_Q2.pdf",
    file_size_bytes: 3210,
    file_sha256: "c91b7d...",
    document_type: "expense_report",
    sensitivity_level: "medium",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Sara Hoffmann",
        context: "Traveler",
        detector: "presidio",
        confidence: 0.91
      },
      {
        type: "POSTAL_ADDRESS",
        value: "Hauptstr. 12, 70173 Stuttgart",
        context: "Hotel address",
        detector: "llm",
        confidence: 0.85
      },
      {
        type: "DATE",
        value: "10 May 2026",
        context: "Travel date",
        detector: "presidio",
        confidence: 0.99
      }
    ],
    reasoning:
      "Travel record containing your name and accommodation details. Travel history can reveal movement patterns. Review whether the record is still operationally needed.",
    retention_recommendation:
      "Retain 3 years for tax substantiation, then delete unless still operationally needed.",
    owner_user_id: "u_001",
    owner_name: "Sara Hoffmann",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_003",
    scan_id: "scan_2026053014",
    file_id: "file_003",
    file_name: "Training_Evaluation_DataProtection.pdf",
    file_path: "/data/onedrive/sara.hoffmann/Training_Evaluation_DataProtection.pdf",
    file_size_bytes: 1980,
    file_sha256: "d44e1b...",
    document_type: "training_evaluation",
    sensitivity_level: "low",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Sara Hoffmann",
        context: "Participant",
        detector: "presidio",
        confidence: 0.93
      },
      {
        type: "DATE",
        value: "14 May 2026",
        context: "Course date",
        detector: "presidio",
        confidence: 0.99
      }
    ],
    reasoning:
      "Training feedback record with your name and course attendance. Personal data is processed under legitimate interest for training records. Retention beyond 2 years is generally not justified.",
    retention_recommendation: "Retain 2 years for HR records, then delete.",
    owner_user_id: "u_001",
    owner_name: "Sara Hoffmann",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_004",
    scan_id: "scan_2026053014",
    file_id: "file_004",
    file_name: "IT_Access_Request_DevOps.pdf",
    file_path: "/data/onedrive/david.schmid/IT_Access_Request_DevOps.pdf",
    file_size_bytes: 2876,
    file_sha256: "2b11c0...",
    document_type: "it_access_request",
    sensitivity_level: "medium",
    entities: [
      {
        type: "PERSON_NAME",
        value: "David Schmid",
        context: "Requester",
        detector: "presidio",
        confidence: 0.9
      },
      {
        type: "SYSTEM_IDENTIFIER",
        value: "SAP-QA-ACC-42",
        context: "Target system",
        detector: "regex",
        confidence: 0.97
      }
    ],
    reasoning: "Access request includes personal account details and role mapping.",
    retention_recommendation: "Retain while access remains active, then review annually.",
    owner_user_id: "u_002",
    owner_name: "David Schmid",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_005",
    scan_id: "scan_2026053014",
    file_id: "file_005",
    file_name: "Incident_Report_Travel_Card.pdf",
    file_path: "/data/onedrive/david.schmid/Incident_Report_Travel_Card.pdf",
    file_size_bytes: 3550,
    file_sha256: "52cd8f...",
    document_type: "incident_report",
    sensitivity_level: "high",
    entities: [
      {
        type: "PERSON_NAME",
        value: "David Schmid",
        context: "Reporter",
        detector: "presidio",
        confidence: 0.91
      },
      {
        type: "FINANCIAL_AMOUNT",
        value: "640.00 EUR",
        context: "Loss amount",
        detector: "regex",
        confidence: 1
      }
    ],
    reasoning: "Incident report contains personally linked card event and finance details.",
    retention_recommendation: "Retain 6 years for incident traceability, then delete.",
    owner_user_id: "u_002",
    owner_name: "David Schmid",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "acknowledged_cleanup",
    reviewed_by_user_id: "u_002",
    reviewed_at: "2026-05-30T14:36:31Z",
    review_note: "Duplicate with archived case record. Cleanup acknowledged."
  },
  {
    id: "f_006",
    scan_id: "scan_2026053014",
    file_id: "file_006",
    file_name: "Supplier_Onboarding_RheinTech.docx",
    file_path: "/data/onedrive/elena.fischer/Supplier_Onboarding_RheinTech.docx",
    file_size_bytes: 4410,
    file_sha256: "b48d3a...",
    document_type: "supplier_onboarding",
    sensitivity_level: "high",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Martin Vogel",
        context: "Supplier contact",
        detector: "presidio",
        confidence: 0.88
      },
      {
        type: "EMAIL_ADDRESS",
        value: "martin.vogel@rheintech.de",
        context: "Supplier contact email",
        detector: "regex",
        confidence: 1
      }
    ],
    reasoning:
      "Supplier onboarding is mostly B2B, but named contact fields contain personal data and increase sensitivity.",
    retention_recommendation: "Retain while contract is active, then delete after legal retention window.",
    owner_user_id: "u_003",
    owner_name: "Elena Fischer",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_007",
    scan_id: "scan_2026053014",
    file_id: "file_007",
    file_name: "Training_Feedback_Q1.pdf",
    file_path: "/data/onedrive/elena.fischer/Training_Feedback_Q1.pdf",
    file_size_bytes: 1622,
    file_sha256: "95ad66...",
    document_type: "training_evaluation",
    sensitivity_level: "low",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Elena Fischer",
        context: "Participant",
        detector: "presidio",
        confidence: 0.9
      }
    ],
    reasoning: "Training feedback includes participant identity and qualitative comments.",
    retention_recommendation: "Retain 2 years for HR records, then delete.",
    owner_user_id: "u_003",
    owner_name: "Elena Fischer",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_008",
    scan_id: "scan_2026053014",
    file_id: "file_008",
    file_name: "Incident_Log_HR_Request.pdf",
    file_path: "/data/onedrive/nina.beck/Incident_Log_HR_Request.pdf",
    file_size_bytes: 2231,
    file_sha256: "b3420f...",
    document_type: "incident_report",
    sensitivity_level: "medium",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Nina Beck",
        context: "Reporter",
        detector: "presidio",
        confidence: 0.88
      }
    ],
    reasoning: "Operational incident note with personal assignment data.",
    retention_recommendation: "Retain 3 years for process history, then delete.",
    owner_user_id: "u_004",
    owner_name: "Nina Beck",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "acknowledged_cleanup",
    reviewed_by_user_id: "u_004",
    reviewed_at: "2026-05-30T14:18:40Z",
    review_note: "Information moved into ticketing system and local copy cleaned up."
  },
  {
    id: "f_009",
    scan_id: "scan_2026053014",
    file_id: "file_009",
    file_name: "IT_Access_Request_Privileged.docx",
    file_path: "/data/onedrive/jonas.keller/IT_Access_Request_Privileged.docx",
    file_size_bytes: 2985,
    file_sha256: "c2af31...",
    document_type: "it_access_request",
    sensitivity_level: "medium",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Jonas Keller",
        context: "Requester",
        detector: "presidio",
        confidence: 0.89
      }
    ],
    reasoning: "Access request includes approver chain with personal names.",
    retention_recommendation: "Retain while entitlement is active, then archive per IT policy.",
    owner_user_id: "u_005",
    owner_name: "Jonas Keller",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_010",
    scan_id: "scan_2026053014",
    file_id: "file_010",
    file_name: "Expense_Claim_SupportingDocs.pdf",
    file_path: "/data/onedrive/jonas.keller/Expense_Claim_SupportingDocs.pdf",
    file_size_bytes: 3004,
    file_sha256: "8df93a...",
    document_type: "expense_report",
    sensitivity_level: "high",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Jonas Keller",
        context: "Employee",
        detector: "presidio",
        confidence: 0.91
      }
    ],
    reasoning: "Expense records contain identity and financial transaction details.",
    retention_recommendation: "Retain 10 years from fiscal year end, then delete.",
    owner_user_id: "u_005",
    owner_name: "Jonas Keller",
    owner_type: "direct",
    master_of_data_id: null,
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "confirmed_business_need",
    reviewed_by_user_id: "u_005",
    reviewed_at: "2026-05-30T14:20:05Z",
    review_note: "Required for open reimbursement workflow."
  },
  {
    id: "f_011",
    scan_id: "scan_2026053014",
    file_id: "file_011",
    file_name: "HR_Onboarding_Packet_ExternalHire.pdf",
    file_path: "/data/shared/HR/onboarding/HR_Onboarding_Packet_ExternalHire.pdf",
    file_size_bytes: 5772,
    file_sha256: "ec1b73...",
    document_type: "supplier_onboarding",
    sensitivity_level: "high",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Klara Meier",
        context: "External contact",
        detector: "presidio",
        confidence: 0.9
      },
      {
        type: "EMAIL_ADDRESS",
        value: "klara.meier@staffing-partner.example",
        context: "Contact email",
        detector: "regex",
        confidence: 1
      }
    ],
    reasoning:
      "Shared HR onboarding records include named external contacts and personal identifiers requiring routed review.",
    retention_recommendation: "Retain while contractual and legal basis applies, then delete.",
    owner_user_id: null,
    owner_name: "Markus Weber",
    owner_type: "master_of_data",
    master_of_data_id: "u_006",
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_012",
    scan_id: "scan_2026053014",
    file_id: "file_012",
    file_name: "HR_Training_Attendance_2025.xlsx",
    file_path: "/data/shared/HR/HR_Training_Attendance_2025.xlsx",
    file_size_bytes: 4630,
    file_sha256: "044fb1...",
    document_type: "training_evaluation",
    sensitivity_level: "medium",
    entities: [
      {
        type: "DEPARTMENT",
        value: "People & Culture",
        context: "Department",
        detector: "llm",
        confidence: 0.78
      }
    ],
    reasoning: "Shared attendance matrix includes employee-linked training metadata.",
    retention_recommendation: "Retain 2 years, then remove local extract.",
    owner_user_id: null,
    owner_name: "Markus Weber",
    owner_type: "master_of_data",
    master_of_data_id: "u_006",
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_013",
    scan_id: "scan_2026053014",
    file_id: "file_013",
    file_name: "Supplier_Onboarding_Finance_B2B.csv",
    file_path: "/data/shared/Finance/Supplier_Onboarding_Finance_B2B.csv",
    file_size_bytes: 3821,
    file_sha256: "c4f7e6...",
    document_type: "supplier_onboarding",
    sensitivity_level: "medium",
    entities: [
      {
        type: "EMAIL_ADDRESS",
        value: "procurement.contact@vendor.example",
        context: "General contact",
        detector: "regex",
        confidence: 1
      },
      {
        type: "POSTAL_ADDRESS",
        value: "Industriestr. 9, 40210 Duesseldorf",
        context: "Vendor office",
        detector: "llm",
        confidence: 0.84
      }
    ],
    reasoning:
      "Supplier onboarding dataset is mostly B2B, but includes contact channels and address fields that can still be personal data in edge cases.",
    retention_recommendation: "Retain while active vendor relationship exists, then delete per retention policy.",
    owner_user_id: null,
    owner_name: "Anna Schmidt",
    owner_type: "master_of_data",
    master_of_data_id: "u_007",
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "confirmed_business_need",
    reviewed_by_user_id: "u_007",
    reviewed_at: "2026-05-30T14:28:10Z",
    review_note: "Active supplier with ongoing invoicing obligations."
  },
  {
    id: "f_014",
    scan_id: "scan_2026053014",
    file_id: "file_014",
    file_name: "Finance_Incident_Reimbursement.pdf",
    file_path: "/data/shared/Finance/Finance_Incident_Reimbursement.pdf",
    file_size_bytes: 3900,
    file_sha256: "87ab09...",
    document_type: "incident_report",
    sensitivity_level: "high",
    entities: [
      {
        type: "PERSON_NAME",
        value: "Anna Schmidt",
        context: "Reviewer",
        detector: "presidio",
        confidence: 0.87
      },
      {
        type: "FINANCIAL_AMOUNT",
        value: "2400.00 EUR",
        context: "Refund amount",
        detector: "regex",
        confidence: 1
      }
    ],
    reasoning: "Finance incident records include named reviewers and high-value transaction context.",
    retention_recommendation: "Retain 6 years for traceability, then delete.",
    owner_user_id: null,
    owner_name: "Anna Schmidt",
    owner_type: "master_of_data",
    master_of_data_id: "u_007",
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  },
  {
    id: "f_015",
    scan_id: "scan_2026053014",
    file_id: "file_015",
    file_name: "IT_Incident_Privileged_Access.pdf",
    file_path: "/data/shared/IT/IT_Incident_Privileged_Access.pdf",
    file_size_bytes: 4790,
    file_sha256: "ab2e31...",
    document_type: "incident_report",
    sensitivity_level: "high",
    entities: [
      {
        type: "SYSTEM_IDENTIFIER",
        value: "PROD-DB-ROOT",
        context: "Affected system",
        detector: "regex",
        confidence: 0.99
      },
      {
        type: "PERSON_NAME",
        value: "Tobias Becker",
        context: "Incident owner",
        detector: "presidio",
        confidence: 0.86
      }
    ],
    reasoning: "IT incident file includes personal ownership and sensitive system linkage.",
    retention_recommendation: "Retain while security case is open, then archive per policy.",
    owner_user_id: null,
    owner_name: "Tobias Becker",
    owner_type: "master_of_data",
    master_of_data_id: "u_008",
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "confirmed_business_need",
    reviewed_by_user_id: "u_008",
    reviewed_at: "2026-05-30T14:17:19Z",
    review_note: "Required for ongoing security remediation audit."
  },
  {
    id: "f_016",
    scan_id: "scan_2026053014",
    file_id: "file_016",
    file_name: "IT_Access_Matrix_Share.xlsx",
    file_path: "/data/shared/IT/IT_Access_Matrix_Share.xlsx",
    file_size_bytes: 4120,
    file_sha256: "56fbe4...",
    document_type: "it_access_request",
    sensitivity_level: "medium",
    entities: [
      {
        type: "EMAIL_ADDRESS",
        value: "ops.user@bosch-internal.example",
        context: "User account",
        detector: "regex",
        confidence: 1
      }
    ],
    reasoning: "Shared access matrix links identities to privilege tiers.",
    retention_recommendation: "Retain while access mapping is active, then rotate and delete stale exports.",
    owner_user_id: null,
    owner_name: "Tobias Becker",
    owner_type: "master_of_data",
    master_of_data_id: "u_008",
    scan_timestamp: "2026-05-30T14:23:11Z",
    review_status: "pending",
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_note: null
  }
];

// TODO backend integration: replace with GET /admin/dashboard
export const dashboard_stats: DashboardStats = {
  total_files_scanned: 1247,
  total_size_bytes: 2576980378,
  files_with_findings: 89,
  total_findings: 47,
  scan_speed_files_per_sec: 47,
  avg_file_scan_ms: 1560,
  precision_pct: 94.2,
  recall_pct: 87.0,
  f1_score: 0.91,
  last_scan_at: "2026-05-30T14:23:11Z",
  last_scan_duration_sec: 23.4,
  findings_by_document_type: {
    expense_report: 12,
    it_access_request: 9,
    incident_report: 7,
    supplier_onboarding: 11,
    training_evaluation: 8,
    unknown: 0
  },
  findings_by_sensitivity: {
    high: 28,
    medium: 15,
    low: 4
  },
  recent_scans: [
    {
      id: "scan_2026053014",
      completed_at: "2026-05-30T14:23:11Z",
      duration_sec: 23.4,
      files_processed: 15,
      files_skipped: 0,
      findings_count: 47,
      scan_type: "full"
    },
    {
      id: "scan_2026053013",
      completed_at: "2026-05-30T13:55:09Z",
      duration_sec: 24.1,
      files_processed: 15,
      files_skipped: 0,
      findings_count: 47,
      scan_type: "full"
    },
    {
      id: "scan_2026053012",
      completed_at: "2026-05-30T13:20:44Z",
      duration_sec: 6.2,
      files_processed: 3,
      files_skipped: 12,
      findings_count: 9,
      scan_type: "delta"
    }
  ]
};

// TODO backend integration: replace with GET /admin/owners
export const owner_summaries: OwnerSummary[] = [
  {
    user_id: "u_001",
    name: "Sara Hoffmann",
    type: "direct",
    assigned_sources: ["/data/onedrive/sara.hoffmann/"],
    files_assigned: 3,
    pending_reviews: 2,
    completed_reviews: 1
  },
  {
    user_id: "u_002",
    name: "David Schmid",
    type: "direct",
    assigned_sources: ["/data/onedrive/david.schmid/"],
    files_assigned: 2,
    pending_reviews: 1,
    completed_reviews: 1
  },
  {
    user_id: "u_003",
    name: "Elena Fischer",
    type: "direct",
    assigned_sources: ["/data/onedrive/elena.fischer/"],
    files_assigned: 2,
    pending_reviews: 2,
    completed_reviews: 0
  },
  {
    user_id: "u_004",
    name: "Nina Beck",
    type: "direct",
    assigned_sources: ["/data/onedrive/nina.beck/"],
    files_assigned: 1,
    pending_reviews: 0,
    completed_reviews: 1
  },
  {
    user_id: "u_005",
    name: "Jonas Keller",
    type: "direct",
    assigned_sources: ["/data/onedrive/jonas.keller/"],
    files_assigned: 2,
    pending_reviews: 1,
    completed_reviews: 1
  },
  {
    user_id: "u_006",
    name: "Markus Weber",
    type: "master_of_data",
    assigned_sources: ["/data/shared/HR/", "/data/shared/HR/onboarding/"],
    files_assigned: 4,
    pending_reviews: 3,
    completed_reviews: 1
  },
  {
    user_id: "u_007",
    name: "Anna Schmidt",
    type: "master_of_data",
    assigned_sources: ["/data/shared/Finance/"],
    files_assigned: 3,
    pending_reviews: 2,
    completed_reviews: 1
  },
  {
    user_id: "u_008",
    name: "Tobias Becker",
    type: "master_of_data",
    assigned_sources: ["/data/shared/IT/"],
    files_assigned: 3,
    pending_reviews: 1,
    completed_reviews: 2
  }
];

export const audit_log_entries: AuditEntry[] = [
  {
    id: "audit_001",
    timestamp: "2026-05-30T14:35:12Z",
    finding_id: "f_001",
    file_name: "Expense_Report_Example_A.pdf",
    user: "Sara Hoffmann",
    action: "Confirmed business need",
    review_note: "Needed for active reimbursement record.",
    resulting_status: "confirmed_business_need"
  },
  {
    id: "audit_002",
    timestamp: "2026-05-30T14:36:07Z",
    finding_id: "f_003",
    file_name: "Training_Evaluation_DataProtection.pdf",
    user: "Sara Hoffmann",
    action: "Acknowledged cleanup",
    review_note: "Retention limit reached in local folder.",
    resulting_status: "acknowledged_cleanup"
  },
  {
    id: "audit_003",
    timestamp: "2026-05-30T14:37:19Z",
    finding_id: "f_011",
    file_name: "HR_Onboarding_Packet_ExternalHire.pdf",
    user: "Markus Weber",
    action: "Acknowledged cleanup",
    review_note: "Redundant copy removed from HR shared onboarding area.",
    resulting_status: "acknowledged_cleanup"
  },
  {
    id: "audit_004",
    timestamp: "2026-05-30T14:38:41Z",
    finding_id: "f_013",
    file_name: "Supplier_Onboarding_Finance_B2B.csv",
    user: "Anna Schmidt",
    action: "Confirmed business need",
    review_note: "Required for active supplier payment controls.",
    resulting_status: "confirmed_business_need"
  }
];

export const reproducibility_snapshot: ReproducibilitySnapshot = {
  last_full_scan_hash: "b91e4c...",
  previous_full_scan_hash: "b91e4c...",
  matching_status: "Match",
  explanation: "Repeated full scans over unchanged input produced the same canonical result hash."
};

export const resource_intensity: ResourceIntensity = {
  cpu_load_pct: 21,
  memory_peak_mb: 412,
  llm_calls_skipped_in_delta_scan: 12,
  files_skipped: 12,
  text_extraction_avoided: 12
};

export const architecture_strip_steps = [
  "Source folder",
  "Scan engine",
  "Entity detection",
  "Context classification",
  "Owner routing",
  "Human review",
  "Admin reporting"
];

export const what_demo_proves = [
  "Accuracy",
  "Reproducibility",
  "Scan speed",
  "Resource intensity",
  "User transparency",
  "Admin reporting",
  "Human review"
];

export const overview_summary_items = [
  {
    title: "Distributed sources",
    text: "OneDrive, SharePoint, file shares, local folders."
  },
  {
    title: "Context classification",
    text: "Document type, sensitivity, entities, retention."
  },
  {
    title: "Owner routing",
    text: "Direct owner or Master of Data queue."
  },
  {
    title: "Human decision",
    text: "Business need or cleanup confirmed by reviewer."
  }
];

export const api_endpoints = [
  "GET /health",
  "GET /users",
  "POST /scan/run",
  "POST /scan/delta",
  "GET /scan/{scan_id}",
  "GET /scans",
  "GET /findings/by-user/{user_id}",
  "GET /findings/{finding_id}",
  "POST /findings/{finding_id}/action",
  "GET /admin/dashboard",
  "GET /admin/owners",
  "GET /files/{file_id}/preview"
];

export const out_of_scope_items = [
  "Real Microsoft Graph authentication",
  "Real SharePoint/OneDrive connector",
  "Multi-tenant support",
  "Real deletion",
  "Production encryption",
  "Localization",
  "Full PDF annotation viewer"
];
