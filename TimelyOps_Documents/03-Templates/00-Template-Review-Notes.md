# TimelyOps — Template Review Notes
*Reviewed: April 2026*

---

## 🔴 Critical Issue — Old Brand Name in Two Templates

Both the **Client Import** and **Worker Import** templates have instructions tabs that still say **"AllBookd"** — the old product name. These need to be updated to **"TimelyOps"** before sending these files to any new customer.

| Template | Issue | Location |
|---|---|---|
| TO-Client-Import-Template.xlsx | Instructions tab header says "AllBookd Client Import Template" | Row 1, Instructions sheet |
| TO-Worker-Import-Template.xlsx | Instructions tab header says "AllBookd Worker Import Template" | Row 1, Instructions sheet |

---

## Client Import Template (TO-Client-Import-Template.xlsx)

**Overall: Well-built and comprehensive.** Covers everything a cleaning business would need for a client record.

**Columns included:** Name, Phone, Email, Address, Tags, Notes, Property Type, Bedrooms, Bathrooms, Square Footage, Pet Details, Parking Instructions, Alarm Code, Key Info, Supply Location, Special Notes

**What's good:**
- 16 fields covers the full property profile — this is more detailed than Jobber or Housecall Pro's import templates
- The Instructions tab explains every field clearly
- Example rows are realistic and representative

**Suggestions:**
- Add a "Frequency" column (weekly, biweekly, monthly) — this is one of the most common client attributes and having it in the import saves a setup step
- Add a "Language Preference" column (English/Spanish) — useful for bilingual SMS notifications
- The alarm code and key info fields store sensitive data in plain text. Consider adding a note in the instructions reminding users that this spreadsheet should not be emailed unencrypted.

---

## Worker Import Template (TO-Worker-Import-Template.xlsx)

**Overall: Functional but minimal.** Only 5 columns, which is enough to get workers loaded — but leaves some useful data for a second step.

**Columns included:** Name, Phone, Email, Role, Availability

**Suggestions:**
- Add "Preferred Language" (English/Spanish) — important for notifications
- Add "Emergency Contact Name" and "Emergency Contact Phone" — operationally useful for a cleaning business
- Consider "Pay Type" (hourly/flat) as a future-proofing field even if billing isn't live yet

---

## Pricing Matrix Template (TO-Pricing_Matrix_Template.xlsx)

**Overall: Excellent.** This is the most polished of the three templates.

**Structure:** 4 sheets — Instructions, Standard Clean, Deep Clean, Move In/Out. Each sheet has a Bedrooms × Bathrooms grid with One-Time and frequency sections.

**What's good:**
- Instructions tab is clear and well-written
- The grid structure (bedrooms × bathrooms × frequency) mirrors exactly how cleaning businesses think about pricing
- Example prices are reasonable and serve as a useful starting point
- The note "Replace blue prices with YOUR actual prices" is clear

**Suggestions:**
- Add a "Commercial" sheet for businesses that do office cleaning
- Consider adding a "Notes" row at the bottom of each sheet for add-on pricing (e.g., "Inside fridge: +$25, Inside oven: +$25") — customers often ask about add-ons and having a standard place for this would be useful

---

## FSM Software Analysis Spreadsheet (FSM_Software_Analysis.xlsx)

This is a reference/research file, not a customer-facing template. It's well-organized with 4 sheets: Overview, Pricing Detail, Feature Matrix, and Analysis & Rankings. Appropriate to keep in 01-Strategy where it now lives — no changes needed.
