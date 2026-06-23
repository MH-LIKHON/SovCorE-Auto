// ============================================================
// frontend/web/src/lib/constants/legal.ts
// ============================================================
//
// Purpose:
//   Single source of truth for the company-information strings
//   that appear on the public legal pages and the marketing
//   footer. Changing the registered office or ICO number here
//   updates every customer-visible surface in one edit.
//
// Origin:
//   Values copied verbatim from SovCorE QR src/lib/constants/
//   legal.ts on the day SovCorE Auto was scaffolded. VelVadY
//   LTD is the registered trading entity; SovCorE is the brand;
//   Auto is an application of SovCorE.
//
// Why centralise:
//   The Companies (Trading Disclosures) Regulations 2008
//   require a UK company to disclose its registered name,
//   number, country of registration, and registered office
//   on its website. Centralising prevents stale values.
//
// Consumed by:
//   - src/components/layout/footer.tsx
//   - Legal pages (Phase 1)
// ============================================================

// ==================================================
// COMPANY INFORMATION
// ==================================================

export const companyInfo = {
  legalName: "VelVadY LTD",
  tradingName: "SovCorE",
  legalNameAndTradingName: "VelVadY LTD trading as SovCorE",
  copyrightHolder: "SovCorE",
  companiesHouseNumber: "15656680",
  jurisdiction: "England and Wales",
  registeredOffice:
    "Office 9774, 321-323 High Road, Chadwell Heath, Essex, RM6 6AX, United Kingdom",
  icoRegistrationNumber: "ZC137347",
  vatRegistered: false as boolean,
  vatNumber: null as string | null,
  vatRegistrationDate: null as string | null,
  vatRatePercent: 20,
} as const;

// ==================================================
// DISCLOSURE LINES
// ==================================================

export const companyDisclosureLine = `${companyInfo.legalNameAndTradingName}. Company No. ${companyInfo.companiesHouseNumber}. Registered in ${companyInfo.jurisdiction}.`;

export const companyDisclosureLineBrandLed = `${companyInfo.tradingName} is operated by ${companyInfo.legalName}. Company No. ${companyInfo.companiesHouseNumber}. Registered in ${companyInfo.jurisdiction}.`;

// ==================================================
// EMAIL ADDRESSES
// ==================================================

export const legalEmails = {
  privacy: "privacy@sovcore.com",
  legal: "legal@sovcore.com",
  dpa: "dpa@sovcore.com",
  dpo: "dpo@sovcore.com",
  security: "security@sovcore.com",
  abuse: "abuse@sovcore.com",
  support: "support@sovcore.com",
  billing: "billing@sovcore.com",
  hello: "hello@sovcore.com",
} as const;
