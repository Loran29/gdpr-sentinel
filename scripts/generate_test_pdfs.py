"""Generate 8 test PDFs in ./data/custom/ using ReportLab."""

import os
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib import colors

OUT = Path("data/custom")
OUT.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
normal  = styles["Normal"]
h1      = styles["Heading1"]
h2      = styles["Heading2"]
bold_c  = ParagraphStyle("bold_c", parent=normal, fontName="Helvetica-Bold")
small   = ParagraphStyle("small",  parent=normal, fontSize=9, textColor=colors.grey)
right   = ParagraphStyle("right",  parent=normal, alignment=TA_RIGHT)
center  = ParagraphStyle("center", parent=normal, alignment=TA_CENTER)
footer_s= ParagraphStyle("footer_s", parent=normal, fontSize=8, textColor=colors.grey)


def doc(filename):
    path = str(OUT / filename)
    return SimpleDocTemplate(path, pagesize=A4,
                             leftMargin=2.5*cm, rightMargin=2.5*cm,
                             topMargin=2.5*cm, bottomMargin=2.5*cm)


def sp(n=1):
    return [Spacer(1, 0.4*cm * n)]


# ── 1. Krankmeldung_Mustermann.pdf ───────────────────────────────────────────

d = doc("Krankmeldung_Mustermann.pdf")
story = [
    Paragraph("Ärztliche Krankmeldung", h1),
    *sp(),
    HRFlowable(width="100%", thickness=1, color=colors.black),
    *sp(),
    Paragraph("<b>Patient:</b> Thomas Mustermann", normal),
    Paragraph("<b>Geburtsdatum:</b> 15.03.1985", normal),
    Paragraph("<b>Krankenversicherung:</b> AOK Bayern", normal),
    *sp(),
    Paragraph(
        "Hiermit wird bescheinigt, dass oben genannte Person arbeitsunfähig erkrankt ist "
        "und voraussichtlich vom <b>22.05.2026</b> bis <b>29.05.2026</b> nicht arbeitsfähig sein wird.",
        normal),
    *sp(),
    Paragraph("Die Diagnose bleibt aus datenschutzrechtlichen Gründen ungenannt.", normal),
    *sp(2),
    Paragraph("Ausstellende Praxis:", bold_c),
    Paragraph("Dr. med. Ingrid Haller", normal),
    Paragraph("Praxis für Allgemeinmedizin", normal),
    Paragraph("Schillerstraße 22, 80336 München", normal),
    Paragraph("Tel: +49 89 12345678", normal),
    *sp(3),
    HRFlowable(width="50%", thickness=1, color=colors.black),
    Paragraph("Unterschrift und Stempel", small),
]
d.build(story)
print("1. Krankmeldung_Mustermann.pdf")


# ── 2. Bank_Authorization_Schmidt.pdf ────────────────────────────────────────

d = doc("Bank_Authorization_Schmidt.pdf")
story = [
    Paragraph("SEPA-Lastschriftmandat / Bank Authorization", h1),
    *sp(),
    Paragraph("Ich ermächtige hiermit mein Kreditinstitut, Zahlungen von meinem Konto "
              "mittels SEPA-Lastschrift einzuziehen.", normal),
    *sp(),
    Table([
        ["Kontoinhaber:", "Anna Schmidt"],
        ["Anschrift:", "Rosenthaler Str. 40, 10178 Berlin"],
        ["IBAN:", "DE89 3704 0044 0532 0130 00"],
        ["BIC:", "COBADEFFXXX"],
        ["Kreditinstitut:", "Commerzbank AG"],
    ],
    colWidths=[5*cm, 10*cm],
    style=TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.whitesmoke, colors.white]),
        ("GRID",      (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING",   (0,0), (-1,-1), 6),
    ])),
    *sp(2),
    Paragraph(
        "Datum: 15.05.2026 &nbsp;&nbsp;&nbsp; <b>Unterschrift:</b> ______________________",
        normal),
    *sp(),
    Paragraph(
        "Ich habe zur Kenntnis genommen, dass ich innerhalb von acht Wochen, beginnend "
        "mit dem Belastungsdatum, die Erstattung des belasteten Betrags verlangen kann.",
        small),
]
d.build(story)
print("2. Bank_Authorization_Schmidt.pdf")


# ── 3. Project_Charter_NoData.pdf ────────────────────────────────────────────

d = doc("Project_Charter_NoData.pdf")
story = [
    Paragraph("Project Charter — DataGuard Initiative", h1),
    *sp(),
    Paragraph("Version 1.2 | Status: Approved | Classification: Internal", small),
    *sp(),
    Paragraph("1. Objective", h2),
    Paragraph(
        "This project aims to establish a GDPR-compliant data governance framework "
        "across all business units. Compliance with the General Data Protection Regulation "
        "(GDPR) and BDSG is mandatory for all data processing activities.",
        normal),
    *sp(),
    Paragraph("2. Scope", h2),
    Paragraph(
        "The initiative covers structured and unstructured data repositories. "
        "A full data mapping exercise will identify all personal data processing "
        "activities per Article 30 GDPR. Data minimisation per Article 5(1)(c) "
        "and storage limitation per Article 5(1)(e) are guiding principles.",
        normal),
    *sp(),
    Paragraph("3. Timeline", h2),
    Table([
        ["Phase", "Start", "End", "Deliverable"],
        ["Discovery",  "Q3 2026", "Q4 2026", "Asset inventory"],
        ["Assessment", "Q4 2026", "Q1 2027", "Gap analysis report"],
        ["Remediation","Q1 2027", "Q3 2027", "Closed findings"],
    ],
    colWidths=[4*cm, 3*cm, 3*cm, 6*cm],
    style=TableStyle([
        ("BACKGROUND",  (0,0), (-1,0), colors.HexColor("#374151")),
        ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
        ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 10),
        ("GRID",        (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING",     (0,0), (-1,-1), 6),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.whitesmoke]),
    ])),
    *sp(),
    Paragraph("4. Risks", h2),
    Paragraph(
        "Key risks include incomplete data mapping, shadow IT repositories, and "
        "cross-border data transfers. All identified risks will be tracked in the "
        "enterprise risk register in accordance with ISO 27001.",
        normal),
]
d.build(story)
print("3. Project_Charter_NoData.pdf")


# ── 4. Mixed_Language_Memo.pdf ───────────────────────────────────────────────

d = doc("Mixed_Language_Memo.pdf")
story = [
    Paragraph("INTERNES MEMO / INTERNAL MEMORANDUM", h1),
    *sp(),
    Table([
        ["An / To:",     "Abteilungsleitung Personalwesen"],
        ["Von / From:",  "Sophie Müller (E-44291)"],
        ["Betreff/Re:",  "Access Rights Review — Q2 2026"],
        ["Datum/Date:",  "28.05.2026"],
    ],
    colWidths=[4.5*cm, 11*cm],
    style=TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("GRID",      (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING",   (0,0), (-1,-1), 6),
    ])),
    *sp(),
    Paragraph(
        "Sehr geehrte Damen und Herren, / Dear colleagues,",
        bold_c),
    *sp(),
    Paragraph(
        "ich möchte Sie über den aktuellen Stand der Zugriffsrechte-Überprüfung informieren. "
        "As of this writing, 42 out of 87 accounts have been reviewed and updated. "
        "Die verbleibenden Konten werden bis Ende Juni abgeschlossen.",
        normal),
    *sp(),
    Paragraph(
        "Please forward any questions to: sophie.mueller@bosch.example",
        normal),
    *sp(),
    Paragraph(
        "Bei Rückfragen stehe ich Ihnen jederzeit zur Verfügung. / "
        "Do not hesitate to reach out.",
        normal),
    *sp(2),
    Paragraph("Mit freundlichen Grüßen / Kind regards,", normal),
    *sp(),
    Paragraph("Sophie Müller", bold_c),
    Paragraph("Personalwesen | HR Department", small),
]
d.build(story)
print("4. Mixed_Language_Memo.pdf")


# ── 5. Hidden_Name_Report.pdf ─────────────────────────────────────────────────

d = doc("Hidden_Name_Report.pdf")
story = [
    Paragraph("Incident Report — Workplace Safety", h1),
    Paragraph("Report ID: IR-2026-0442 | Date: 19.05.2026 | Location: Bosch Campus Stuttgart", small),
    *sp(),
    Paragraph("1. Incident Description", h2),
    Paragraph(
        "Am Montag, den 19. Mai 2026, ereignete sich ein leichter Unfall im Gebäude B. "
        "Auf dem Weg zur Cafeteria stieß Markus Weber gegen eine Tür, die von innen geöffnet wurde. "
        "Er erlitt eine leichte Prellung am rechten Arm.",
        normal),
    *sp(),
    Paragraph("2. Immediate Actions Taken", h2),
    Paragraph(
        "The first-aid officer on duty examined the affected person and confirmed that "
        "no further medical treatment was required. The incident was logged immediately "
        "in the digital safety management system.",
        normal),
    *sp(),
    Paragraph("3. Root Cause", h2),
    Paragraph(
        "Die betroffene Tür ist nicht mit einem Sichtfenster ausgestattet. "
        "A retrofit with safety glass panels has been scheduled for Q3 2026.",
        normal),
    *sp(),
    Paragraph("4. Follow-up", h2),
    Paragraph(
        "All staff have been reminded via intranet notice to exercise caution "
        "at swing doors throughout the campus. No further action is required "
        "for the affected individual.",
        normal),
]
d.build(story)
print("5. Hidden_Name_Report.pdf")


# ── 6. Phone_In_Footer.pdf ────────────────────────────────────────────────────

W, H = A4

from reportlab.pdfgen import canvas as rl_canvas

path = str(OUT / "Phone_In_Footer.pdf")
c = rl_canvas.Canvas(path, pagesize=A4)

# Header
c.setFont("Helvetica-Bold", 16)
c.drawString(2.5*cm, H - 2.5*cm, "Supplier Contact Sheet")
c.setFont("Helvetica", 10)
c.drawString(2.5*cm, H - 3.2*cm, "Nordic Industrial Solutions GmbH")

# Body table — using manual text
rows = [
    ("Company",        "Nordic Industrial Solutions GmbH"),
    ("Address",        "Hannoversche Str. 15, 30163 Hannover"),
    ("Industry",       "Precision Manufacturing"),
    ("Certification",  "ISO 9001:2015, ISO 14001"),
    ("Account Mgr",    "Purchasing Department — Bosch GmbH"),
    ("Contract No.",   "SC-2026-00887"),
    ("Valid until",    "31.12.2027"),
]
y = H - 4.5*cm
c.setFont("Helvetica-Bold", 10)
c.drawString(2.5*cm, y, "Field"); c.drawString(9*cm, y, "Value")
y -= 0.3*cm
c.line(2.5*cm, y, 19*cm, y)
y -= 0.5*cm
for label, value in rows:
    c.setFont("Helvetica-Bold", 10)
    c.drawString(2.5*cm, y, label)
    c.setFont("Helvetica", 10)
    c.drawString(9*cm, y, value)
    y -= 0.65*cm

# Footer with phone numbers
c.line(2.5*cm, 3*cm, 19*cm, 3*cm)
c.setFont("Helvetica", 8)
c.setFillColorRGB(0.4, 0.4, 0.4)
c.drawString(2.5*cm, 2.5*cm, "Contact: +49 511 9876543 | Fax: +49 511 9876544 | Emergency: +49 172 3456789")
c.drawString(2.5*cm, 2.0*cm, "Nordic Industrial Solutions GmbH | HRB 12345 Hannover | Page 1 of 1")
c.save()
print("6. Phone_In_Footer.pdf")


# ── 7. Onboarding_Foreign_VAT.pdf ────────────────────────────────────────────

d = doc("Onboarding_Foreign_VAT.pdf")
story = [
    Paragraph("Supplier Onboarding Form", h1),
    *sp(),
    Paragraph("Please complete all fields. This form is required for supplier registration.", small),
    *sp(),
    Table([
        ["Company Name:",    "Maison Dupont SARL"],
        ["Country:",         "France"],
        ["Address:",         "12 Rue de la Paix, 75001 Paris, France"],
        ["Contact Email:",   "contact@maison-dupont.example"],
        ["VAT Number:",      "FR12345678901"],
        ["EORI Number:",     "FR123456789012345"],
        ["Payment Terms:",   "Net 30"],
        ["Bank (BIC):",      "BNPAFRPPXXX"],
    ],
    colWidths=[5*cm, 10*cm],
    style=TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("GRID",      (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.whitesmoke, colors.white]),
        ("PADDING",   (0,0), (-1,-1), 6),
    ])),
    *sp(),
    Paragraph(
        "Note: This supplier is registered in France. The VAT number (FR12345678901) follows "
        "the EU format and does not match the German DE+9-digit pattern.",
        small),
    *sp(),
    Paragraph("Approved by Procurement:", bold_c),
    Paragraph("Anna Schmidt, Finance Department", normal),
    Paragraph("Date: 20.05.2026", normal),
]
d.build(story)
print("7. Onboarding_Foreign_VAT.pdf")


# ── 8. Old_Expense_2018.pdf ───────────────────────────────────────────────────

d = doc("Old_Expense_2018.pdf")
story = [
    Paragraph("Expense Report — Reimbursement Request", h1),
    Paragraph("Bosch GmbH | Finance Department | Fiscal Year 2018", small),
    *sp(),
    Table([
        ["Employee:",       "Klaus Bergmann"],
        ["Employee ID:",    "E-10047"],
        ["Department:",     "Sales"],
        ["Report Period:",  "October 2018"],
        ["Submission Date:","05.11.2018"],
    ],
    colWidths=[5*cm, 10*cm],
    style=TableStyle([
        ("FONTNAME",  (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("GRID",      (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.whitesmoke, colors.white]),
        ("PADDING",   (0,0), (-1,-1), 6),
    ])),
    *sp(),
    Paragraph("Expense Items", h2),
    Table([
        ["Date",       "Category",    "Description",            "Amount"],
        ["08.10.2018", "Travel",      "Train Frankfurt–Berlin",  "112.50 EUR"],
        ["09.10.2018", "Hotel",       "Hotel Adlon, 1 night",   "189.00 EUR"],
        ["10.10.2018", "Meals",       "Client dinner",           "74.30 EUR"],
        ["12.10.2018", "Travel",      "Taxi airport return",     "38.40 EUR"],
        ["",           "",            "Total:",                  "414.20 EUR"],
    ],
    colWidths=[3*cm, 3.5*cm, 7*cm, 3*cm],
    style=TableStyle([
        ("BACKGROUND",  (0,0), (-1,0), colors.HexColor("#374151")),
        ("TEXTCOLOR",   (0,0), (-1,0), colors.white),
        ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME",    (0,-1), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 10),
        ("GRID",        (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING",     (0,0), (-1,-1), 6),
        ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.whitesmoke]),
    ])),
    *sp(),
    Paragraph(
        "⚠ Note: This expense report was submitted in 2018. Per §147 AO, the 10-year "
        "fiscal retention period expires in 2028. Archive accordingly.",
        small),
    *sp(2),
    Paragraph("Approved by:", bold_c),
    Paragraph("Manager: Petra Lang", normal),
    Paragraph("Date: 12.11.2018", normal),
]
d.build(story)
print("8. Old_Expense_2018.pdf")


print("\nAll 8 PDFs written to data/custom/")
