"""Generate 4 additional test PDFs: CV, German-only, multi-page, meeting minutes."""

import sys
sys.path.insert(0, ".")

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak

OUT = Path("data/custom")
OUT.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
normal  = styles["Normal"]
h1      = styles["Heading1"]
h2      = styles["Heading2"]
bold    = ParagraphStyle("bold", parent=normal, fontName="Helvetica-Bold")
small   = ParagraphStyle("small", parent=normal, fontSize=9, textColor=colors.grey)

def doc(filename):
    return SimpleDocTemplate(str(OUT / filename), pagesize=A4,
                             leftMargin=2.5*cm, rightMargin=2.5*cm,
                             topMargin=2.5*cm, bottomMargin=2.5*cm)

def sp(n=1):
    return [Spacer(1, 0.4*cm * n)]


# ── 1. CV_Lukas_Braun.pdf — CV/resume (high PII density) ─────────────────────

d = doc("CV_Lukas_Braun.pdf")
story = [
    Paragraph("Curriculum Vitae", h1),
    HRFlowable(width="100%", thickness=1, color=colors.black),
    *sp(),
    Table([
        ["Name:",          "Lukas Braun"],
        ["Date of Birth:", "03.07.1990"],
        ["Address:",       "Bergstraße 7, 60313 Frankfurt am Main"],
        ["Phone:",         "+49 69 98765432"],
        ["Email:",         "lukas.braun@email.example"],
        ["Nationality:",   "German"],
    ], colWidths=[5*cm, 10*cm],
    style=TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("GRID",      (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.whitesmoke, colors.white]),
        ("PADDING",   (0,0), (-1,-1), 5),
    ])),
    *sp(),
    Paragraph("Work Experience", h2),
    Paragraph("<b>Senior Software Engineer — Bosch GmbH, Stuttgart</b> (2018–present)", normal),
    Paragraph("Developed embedded control systems for automotive ECUs. Led a team of 5 engineers.", normal),
    *sp(0.5),
    Paragraph("<b>Software Engineer — Siemens AG, Munich</b> (2015–2018)", normal),
    Paragraph("Worked on industrial IoT gateway firmware and OTA update pipelines.", normal),
    *sp(),
    Paragraph("Education", h2),
    Paragraph("<b>M.Sc. Computer Science</b> — TU Darmstadt (2013–2015)", normal),
    Paragraph("<b>B.Sc. Computer Science</b> — TU Darmstadt (2010–2013)", normal),
    *sp(),
    Paragraph("Skills", h2),
    Paragraph("C/C++, Python, Rust, Docker, Kubernetes, Git, AUTOSAR, CAN bus", normal),
    *sp(),
    Paragraph("References available on request.", small),
]
d.build(story)
print("1. CV_Lukas_Braun.pdf")


# ── 2. Datenschutz_Schulung_DE.pdf — German-only document ───────────────────

d = doc("Datenschutz_Schulung_DE.pdf")
story = [
    Paragraph("Datenschutz-Grundschulung", h1),
    Paragraph("Teilnahmebestätigung", h2),
    *sp(),
    Paragraph(
        "Hiermit wird bestätigt, dass <b>Franziska Lehmann</b> (Personalnummer E-77412) "
        "am <b>22. Mai 2026</b> erfolgreich an der Pflichtschulung zum Thema "
        "Datenschutz-Grundverordnung (DSGVO) teilgenommen hat.",
        normal),
    *sp(),
    Table([
        ["Teilnehmerin:",       "Franziska Lehmann"],
        ["Personalnummer:",     "E-77412"],
        ["Abteilung:",          "Personalwesen"],
        ["Schulungsdatum:",     "22.05.2026"],
        ["Dauer:",              "4 Stunden"],
        ["Bewerter:",           "Dr. Klaus Richter"],
        ["Ergebnis:",           "Bestanden (92/100 Punkte)"],
    ], colWidths=[5*cm, 10*cm],
    style=TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("GRID",      (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.whitesmoke, colors.white]),
        ("PADDING",   (0,0), (-1,-1), 5),
    ])),
    *sp(),
    Paragraph(
        "Diese Schulung umfasste die wesentlichen Bestimmungen der DSGVO, insbesondere "
        "Art. 5 (Grundsätze der Verarbeitung), Art. 17 (Recht auf Löschung) und "
        "Art. 25 (Datenschutz durch Technikgestaltung). Die Teilnehmerin ist nun "
        "berechtigt, personenbezogene Daten im Rahmen ihrer Tätigkeit zu verarbeiten.",
        normal),
    *sp(2),
    Paragraph("Schulungsleiter:", bold),
    Paragraph("Dr. Klaus Richter, Datenschutzbeauftragter", normal),
    Paragraph("Bosch GmbH, Abteilung Compliance", normal),
    Paragraph("Tel: +49 711 8109001", normal),
]
d.build(story)
print("2. Datenschutz_Schulung_DE.pdf")


# ── 3. Project_Report_Multipage.pdf — multi-page document ───────────────────

d = doc("Project_Report_Multipage.pdf")
story = [
    Paragraph("Project Status Report — Q2 2026", h1),
    Paragraph("DataGuard Modernisation Programme", h2),
    *sp(),
    Paragraph("1. Executive Summary", h2),
    Paragraph(
        "The DataGuard Modernisation Programme is progressing on schedule. "
        "Project Lead: <b>Michael Hoffmann</b> (E-55123). The programme covers "
        "all GDPR compliance activities across 14 business units.",
        normal),
    *sp(),
    Paragraph("2. Team", h2),
    Table([
        ["Name", "Role", "Email", "Department"],
        ["Michael Hoffmann", "Project Lead", "m.hoffmann@bosch.example", "IT Governance"],
        ["Sabine Neumann",   "Data Architect", "s.neumann@bosch.example", "Digital Operations"],
        ["Peter Wolf",       "Legal Counsel",  "p.wolf@bosch.example",    "Legal"],
        ["Claudia Braun",    "DPO",            "c.braun@bosch.example",   "Compliance"],
    ], colWidths=[4*cm, 3.5*cm, 6*cm, 4*cm],
    style=TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#374151")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 9),
        ("GRID",       (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING",    (0,0), (-1,-1), 5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.whitesmoke]),
    ])),
    *sp(),
    Paragraph("3. Progress", h2),
    Paragraph("Phase 1 (Discovery) completed. 47,832 files scanned across 12 departments.", normal),
    PageBreak(),
    Paragraph("4. Risk Register (Page 2)", h2),
    Paragraph(
        "Risk R-001: Incomplete data mapping in legacy ERP system. Owner: Sabine Neumann. "
        "Mitigation: manual audit scheduled for June 2026.",
        normal),
    *sp(),
    Paragraph("5. Budget", h2),
    Paragraph("Total budget: 240,000.00 EUR. Spent to date: 87,450.00 EUR.", normal),
    *sp(),
    Paragraph("6. Next Steps", h2),
    Paragraph(
        "Phase 2 (Remediation) begins 01.07.2026. Contact Michael Hoffmann at "
        "m.hoffmann@bosch.example for onboarding.",
        normal),
    *sp(3),
    Paragraph("Approved by: Claudia Braun, DPO — 28.05.2026", small),
]
d.build(story)
print("3. Project_Report_Multipage.pdf")


# ── 4. Meeting_Minutes_2026.pdf — meeting minutes ────────────────────────────

d = doc("Meeting_Minutes_2026.pdf")
story = [
    Paragraph("Meeting Minutes — GDPR Steering Committee", h1),
    Paragraph("Date: 20 May 2026 | Location: Conference Room B4, Stuttgart HQ", small),
    *sp(),
    Paragraph("Attendees", h2),
    Paragraph(
        "Jonas Keller (Chair, IT Governance), Anna Schmidt (Finance), "
        "Markus Weber (HR), Elena Fischer (Digital Operations), "
        "Dr. Tobias Lange (external legal counsel, lang@datenschutz-kanzlei.example)",
        normal),
    *sp(),
    Paragraph("1. Agenda Item: Data Retention Review", h2),
    Paragraph(
        "Anna Schmidt presented the Finance department retention schedule. "
        "16 expense reports from 2013 were identified as past the 10-year §147 AO deadline. "
        "Action: Anna Schmidt to coordinate deletion by 30.06.2026.",
        normal),
    *sp(),
    Paragraph("2. Agenda Item: Incident Report Q1 2026", h2),
    Paragraph(
        "Markus Weber reported two data incidents in HR. Incident IR-2026-0112 involved "
        "accidental disclosure of salary data. Corrective action completed.",
        normal),
    *sp(),
    Paragraph("3. Agenda Item: OneDrive Scanning Progress", h2),
    Paragraph(
        "Jonas Keller confirmed the automated scan covered 12,480 OneDrive accounts. "
        "3,241 files flagged for review. Elena Fischer to follow up with Digital Operations team.",
        normal),
    *sp(),
    Paragraph("Action Items", h2),
    Table([
        ["#", "Action", "Owner", "Due"],
        ["1", "Delete 16 overdue expense reports", "Anna Schmidt", "30.06.2026"],
        ["2", "Close IR-2026-0112 corrective action", "Markus Weber", "15.06.2026"],
        ["3", "Review 3,241 flagged OneDrive files", "Elena Fischer", "31.07.2026"],
        ["4", "Update ROPA entries", "Jonas Keller", "30.06.2026"],
    ], colWidths=[1*cm, 7*cm, 4*cm, 3*cm],
    style=TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#374151")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 9),
        ("GRID",       (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING",    (0,0), (-1,-1), 5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.whitesmoke]),
    ])),
    *sp(2),
    Paragraph("Minutes recorded by: Jonas Keller | Approved by: Anna Schmidt", small),
]
d.build(story)
print("4. Meeting_Minutes_2026.pdf")

print("\nAll 4 PDFs written to data/custom/")
