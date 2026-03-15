import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiFetch, hasCredentials, testAndSaveCredentials } from "./auth.js";

const server = new McpServer(
  {
    name: "dinhyresvard",
    version: "1.0.0",
  },
  {
    instructions: `
You are connected to DinHyresvärd (also called "DH"), a Swedish property management platform used by landlords to manage their real-estate portfolio.

## Data model (top-down hierarchy)
Company → Property → Building → Dwelling / Parking / Premises / OtherRentalObject
A LeaseAgreement links a RentalObject to one or two Tenants (Contacts).
Invoices and DebtCollections belong to a LeaseAgreement.
FaultNotifications (felanmälningar) are maintenance requests linked to a LeaseAgreement or Contact.

## Key workflows

**Finding a tenant's contracts:**
1. Use find_contact_by_identity (with their Swedish SSN and idType "swedishSSN") to get their contactId.
2. Use list_lease_agreements with tenantIdentification (their SSN) to find their contracts.

**Creating a new lease:**
1. Use find_contact_by_identity first — if the tenant exists, use their contactId.
2. If not, provide tenantOneIdType + tenantOneIdString (SSN) so the system creates or links the contact.
3. Call create_lease_agreement.

**Finding unpaid invoices:**
Use list_invoices with paymentStatus "unpaid" or "overdue".

**Reporting a fault:**
1. Call list_fault_notification_categories to find the correct subCategoryId.
2. Call create_fault_notification with the leaseAgreementId and subCategoryId.

**Syncing data incrementally:**
Most list tools support changedAfter (UTC ISO 8601 datetime). Use this to fetch only records changed since your last sync.

## Pagination
All list tools return { pageNumber, pageSize, totalResults, items }.
If totalResults > pageSize, there are more pages — fetch them by incrementing pageNumber.
Default pageSize is 50; maximum is 200.

## Language
The system is Swedish. Property, contract, and tenant names will appear in Swedish.
Dates use ISO 8601. Currency is SEK.

## Credentials
If a tool returns NOT_CONFIGURED, ask the user for their username and password and call the configure tool.
`.trim(),
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pageParams = {
  pageSize: z.number().int().min(1).max(200).default(50).describe("Items per page (max 200)"),
  pageNumber: z.number().int().min(1).default(1).describe("Page number, 1-based. Check totalResults in response to determine if more pages exist."),
};

// Shared filter fields present on most rental object types
const rentalObjectFilterParams = {
  id: z.string().uuid().optional().describe("Filter by exact rental object UUID"),
  rentalIdStartsWith: z.string().optional().describe("Filter by rental ID prefix (e.g. '1001')"),
  companyId: z.string().uuid().optional().describe("Filter by company UUID"),
  propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
  changedAfter: z.string().datetime().optional().describe("Return only objects changed after this UTC datetime (ISO 8601), useful for syncing"),
  includeHistory: z.boolean().optional().describe("If true, include objects that are no longer active"),
};

const localDate = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
}).describe("Date as { year, month, day }");

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const NOT_CONFIGURED = {
  content: [{
    type: "text",
    text: "NOT_CONFIGURED: No credentials found. Please ask the user for their DinHyresvärd username and password, then call the `configure` tool.",
  }],
};

function guarded(fn) {
  return async (args) => {
    if (!hasCredentials()) return NOT_CONFIGURED;
    try {
      return await fn(args);
    } catch (err) {
      if (err.message === "NOT_CONFIGURED") return NOT_CONFIGURED;
      throw err;
    }
  };
}

// ─── Configure (unauthenticated) ─────────────────────────────────────────────

server.registerTool(
  "configure",
  {
    description: "Save DinHyresvärd login credentials. Call this when the user provides their username and password. Credentials are tested against the API before saving.",
    inputSchema: {
      username: z.string().describe("DinHyresvärd username"),
      password: z.string().describe("DinHyresvärd password"),
    },
  },
  async ({ username, password }) => {
    await testAndSaveCredentials(username, password);
    return ok({ success: true, message: `Credentials saved for "${username}". All DinHyresvärd tools are now available.` });
  }
);

// All tools registered below are automatically credential-guarded
const _registerTool = server.registerTool.bind(server);
server.registerTool = (name, config, cb) => _registerTool(name, config, guarded(cb));

// ─── Companies ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_companies",
  {
    description: "List all companies (fastighetsbolag) in the system. A company owns properties and buildings.",
    inputSchema: pageParams,
  },
  async ({ pageSize, pageNumber }) =>
    ok(await apiFetch(`/api/v1/company/${pageSize}/${pageNumber}`))
);

// ─── Properties ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_properties",
  {
    description: "List real-estate properties (fastigheter). Properties belong to a company and contain buildings.",
    inputSchema: pageParams,
  },
  async ({ pageSize, pageNumber }) =>
    ok(await apiFetch(`/api/v1/property/${pageSize}/${pageNumber}`))
);

// ─── Buildings ────────────────────────────────────────────────────────────────

server.registerTool(
  "list_buildings",
  {
    description: "List buildings (byggnader). Buildings belong to a property and contain dwelling units.",
    inputSchema: pageParams,
  },
  async ({ pageSize, pageNumber }) =>
    ok(await apiFetch(`/api/v1/building/${pageSize}/${pageNumber}`))
);

// ─── Building Spaces ──────────────────────────────────────────────────────────

server.registerTool(
  "list_building_spaces",
  {
    description: "List building spaces (byggnadsytor), optionally filtered by company, building, or property.",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId }) =>
    ok(await apiFetch(`/api/v1/buildingspace/${pageSize}/${pageNumber}`, {
      query: {
        "filter.companyId": companyId,
        "filter.buildingId": buildingId,
        "filter.propertyId": propertyId,
      },
    }))
);

// ─── Dwellings ────────────────────────────────────────────────────────────────

server.registerTool(
  "list_dwellings",
  {
    description: "List dwelling units (lägenheter/bostäder). Use changedAfter to sync incrementally. Use vacantOnOrAfter to find vacancies.",
    inputSchema: {
      ...pageParams,
      ...rentalObjectFilterParams,
      vacantOnOrAfter: localDate.optional().describe("Return dwellings that become vacant on or after this date, e.g. { year: 2024, month: 6, day: 1 }"),
    },
  },
  async ({ pageSize, pageNumber, id, rentalIdStartsWith, companyId, propertyId, changedAfter, includeHistory, vacantOnOrAfter }) =>
    ok(await apiFetch(`/api/v1/dwelling/${pageSize}/${pageNumber}`, {
      query: {
        "filter.id": id,
        "filter.rentalIdStartsWith": rentalIdStartsWith,
        "filter.companyId": companyId,
        "filter.propertyId": propertyId,
        "filter.changedAfter": changedAfter,
        "filter.includeHistory": includeHistory,
        "filter.vacantOnOrAfter.year": vacantOnOrAfter?.year,
        "filter.vacantOnOrAfter.month": vacantOnOrAfter?.month,
        "filter.vacantOnOrAfter.day": vacantOnOrAfter?.day,
      },
    }))
);

server.registerTool(
  "get_dwelling",
  {
    description: "Get full details for a single dwelling unit by its UUID.",
    inputSchema: { id: z.string().uuid().describe("Dwelling UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/dwelling/${id}`))
);

server.registerTool(
  "list_dwelling_rooms",
  {
    description: "List rooms within dwellings (rum). Can filter by company, building, property, or specific dwelling.",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
      dwellingId: z.string().uuid().optional().describe("Filter by dwelling UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId, dwellingId }) =>
    ok(await apiFetch(`/api/v1/dwellingroom/${pageSize}/${pageNumber}`, {
      query: {
        "filter.companyId": companyId,
        "filter.buildingId": buildingId,
        "filter.propertyId": propertyId,
        "filter.dwellingId": dwellingId,
      },
    }))
);

// ─── Parking ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_parking",
  {
    description: "List parking spaces (bilplatser/garage).",
    inputSchema: { ...pageParams, ...rentalObjectFilterParams },
  },
  async ({ pageSize, pageNumber, id, rentalIdStartsWith, companyId, propertyId, changedAfter, includeHistory }) =>
    ok(await apiFetch(`/api/v1/parking/${pageSize}/${pageNumber}`, {
      query: {
        "filter.id": id,
        "filter.rentalIdStartsWith": rentalIdStartsWith,
        "filter.companyId": companyId,
        "filter.propertyId": propertyId,
        "filter.changedAfter": changedAfter,
        "filter.includeHistory": includeHistory,
      },
    }))
);

server.registerTool(
  "get_parking",
  {
    description: "Get full details for a single parking space by its UUID.",
    inputSchema: { id: z.string().uuid().describe("Parking UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/parking/${id}`))
);

// ─── Premises ────────────────────────────────────────────────────────────────

server.registerTool(
  "list_premises",
  {
    description: "List commercial premises (lokaler).",
    inputSchema: { ...pageParams, ...rentalObjectFilterParams },
  },
  async ({ pageSize, pageNumber, id, rentalIdStartsWith, companyId, propertyId, changedAfter, includeHistory }) =>
    ok(await apiFetch(`/api/v1/premises/${pageSize}/${pageNumber}`, {
      query: {
        "filter.id": id,
        "filter.rentalIdStartsWith": rentalIdStartsWith,
        "filter.companyId": companyId,
        "filter.propertyId": propertyId,
        "filter.changedAfter": changedAfter,
        "filter.includeHistory": includeHistory,
      },
    }))
);

server.registerTool(
  "get_premises",
  {
    description: "Get full details for a single premises by its UUID.",
    inputSchema: { id: z.string().uuid().describe("Premises UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/premises/${id}`))
);

// ─── Other Rental Objects ─────────────────────────────────────────────────────

server.registerTool(
  "list_other_rental_objects",
  {
    description: "List other rental objects (övriga objekt) such as storage rooms.",
    inputSchema: { ...pageParams, ...rentalObjectFilterParams },
  },
  async ({ pageSize, pageNumber, id, rentalIdStartsWith, companyId, propertyId, changedAfter, includeHistory }) =>
    ok(await apiFetch(`/api/v1/otherRentalObject/${pageSize}/${pageNumber}`, {
      query: {
        "filter.id": id,
        "filter.rentalIdStartsWith": rentalIdStartsWith,
        "filter.companyId": companyId,
        "filter.propertyId": propertyId,
        "filter.changedAfter": changedAfter,
        "filter.includeHistory": includeHistory,
      },
    }))
);

server.registerTool(
  "get_other_rental_object",
  {
    description: "Get full details for a single other rental object by its UUID.",
    inputSchema: { id: z.string().uuid().describe("Rental object UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/otherRentalObject/${id}`))
);

// ─── Lease Agreements ─────────────────────────────────────────────────────────

server.registerTool(
  "list_lease_agreements",
  {
    description: "List lease agreements (hyreskontrakt). Filter by status to find active/terminated contracts, by category to find dwelling vs parking contracts, or by tenant SSN.",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      category: z
        .enum(["dwelling", "premises", "parking", "other", "block", "cooperativeHousing"])
        .optional()
        .describe("Filter by contract category"),
      status: z
        .enum(["draft", "coming", "valid", "terminated", "expired", "voided", "active"])
        .optional()
        .describe("Filter by contract status. Use 'active' for all currently active contracts, 'valid' for valid contracts."),
      tenantIdentification: z
        .string()
        .optional()
        .describe("Filter by tenant SSN or other identification number"),
      changedAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Return only contracts changed after this UTC datetime (ISO 8601), useful for syncing"),
    },
  },
  async ({ pageSize, pageNumber, companyId, category, status, tenantIdentification, changedAfter }) =>
    ok(await apiFetch(`/api/v1/leaseagreement/${pageSize}/${pageNumber}`, {
      query: {
        "filter.companyId": companyId,
        "filter.category": category,
        "filter.status": status,
        "filter.tenantIdentification": tenantIdentification,
        "filter.changedAfter": changedAfter,
      },
    }))
);

server.registerTool(
  "get_lease_agreement",
  {
    description: "Get full details for a single lease agreement by its UUID.",
    inputSchema: { id: z.string().uuid().describe("Lease agreement UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/leaseagreement/${id}`))
);

server.registerTool(
  "validate_tenant_email",
  {
    description: "Check whether an email address is associated with a current or upcoming valid lease agreement. Returns 200 if valid.",
    inputSchema: { contactEmail: z.string().email().describe("Tenant email address") },
  },
  async ({ contactEmail }) =>
    ok(await apiFetch("/api/v1/leaseagreement/email-has-valid-contract", { query: { contactEmail } }))
);

server.registerTool(
  "create_lease_agreement",
  {
    description: "Create a new lease agreement. Provide tenant details — if the tenant already exists in the system, supply their contactId to avoid creating duplicates.",
    inputSchema: {
      callerLeaseAgreementId: z.string().uuid().describe("Your system's UUID for this lease (used for idempotency and later lookup)"),
      callerSystem: z.enum([
        "homepal","homeQ","ropoCapital","avy","yourBlock","dinBox","dh","dhMarket",
        "truId","openBusiness","hek","hogiaDynamics","vismaControlEdge","ropoOne",
        "accountingFTP","preventia","profina","dhMigration","accountingEmail",
        "frejaEID","psFinanceGroup","fastighetsagarnaMittNord",
      ]).describe("Identifier for your external system"),
      rentalObjectId: z.string().uuid().describe("UUID of the rental object (dwelling, parking, etc.)"),
      fromDate: localDate.describe("Lease start date"),
      lastBillingDate: localDate.describe("Last billing date"),
      // Tenant 1 — supply contactId if the person already exists, otherwise provide identification
      tenantOneContactId: z.string().uuid().optional().describe("Existing contact UUID for tenant 1. Use find_contact_by_identity first to check."),
      tenantOneName: z.string().optional().describe("Tenant 1 full name"),
      tenantOneEmail: z.string().email().optional().describe("Tenant 1 email"),
      tenantOnePhone: z.string().optional().describe("Tenant 1 phone"),
      tenantOneIdType: z.enum([
        "none","swedishSSN","swedishOrganizationNumber","swedishCoordinationNumber",
        "danishSSN","danishOrganizationNumber","finnishSSN","finnishOrganizationNumber",
        "norwegianSSN","norwegianOrganizationNumber","birthdayIso8601","freeText","internationalPassportNumber",
      ]).optional().describe("Tenant 1 identity type (required when tenantOneContactId is not set)"),
      tenantOneIdString: z.string().optional().describe("Tenant 1 identity number, e.g. SSN '198001011234'"),
      tenantOneContactCategory: z.enum(["physicalPerson","company"]).optional().describe("Tenant 1 contact category (defaults to physicalPerson)"),
      // Tenant 2 (optional co-tenant)
      tenantTwoContactId: z.string().uuid().optional().describe("Existing contact UUID for tenant 2"),
      tenantTwoName: z.string().optional().describe("Tenant 2 full name"),
      tenantTwoEmail: z.string().email().optional().describe("Tenant 2 email"),
      tenantTwoPhone: z.string().optional().describe("Tenant 2 phone"),
      tenantTwoIdType: z.enum([
        "none","swedishSSN","swedishOrganizationNumber","swedishCoordinationNumber",
        "danishSSN","danishOrganizationNumber","finnishSSN","finnishOrganizationNumber",
        "norwegianSSN","norwegianOrganizationNumber","birthdayIso8601","freeText","internationalPassportNumber",
      ]).optional().describe("Tenant 2 identity type"),
      tenantTwoIdString: z.string().optional().describe("Tenant 2 identity number"),
      tenantTwoContactCategory: z.enum(["physicalPerson","company"]).optional().describe("Tenant 2 contact category"),
    },
  },
  async ({ callerLeaseAgreementId, callerSystem, rentalObjectId, fromDate, lastBillingDate,
           tenantOneContactId, tenantOneName, tenantOneEmail, tenantOnePhone,
           tenantOneIdType, tenantOneIdString, tenantOneContactCategory,
           tenantTwoContactId, tenantTwoName, tenantTwoEmail, tenantTwoPhone,
           tenantTwoIdType, tenantTwoIdString, tenantTwoContactCategory }) => {
    const makeTenant = (contactId, name, email, phone, idType, idString, contactCategory) => ({
      contactId,
      name,
      email,
      phone,
      contactCategory,
      identification: idType ? { idType, idString } : undefined,
    });
    const body = {
      callerLeaseAgreementId,
      callerSystem,
      rentalObjectId,
      fromDate,
      lastBillingDate,
      tenantOne: makeTenant(tenantOneContactId, tenantOneName, tenantOneEmail, tenantOnePhone,
                            tenantOneIdType, tenantOneIdString, tenantOneContactCategory),
    };
    if (tenantTwoContactId || tenantTwoName || tenantTwoEmail || tenantTwoIdString) {
      body.tenantTwo = makeTenant(tenantTwoContactId, tenantTwoName, tenantTwoEmail, tenantTwoPhone,
                                  tenantTwoIdType, tenantTwoIdString, tenantTwoContactCategory);
    }
    return ok(await apiFetch("/api/v1/leaseagreement", { method: "POST", body }));
  }
);

server.registerTool(
  "download_lease_agreement_document",
  {
    description: "Download a lease agreement document as a base64-encoded PDF.",
    inputSchema: { documentId: z.string().uuid().describe("Document UUID") },
  },
  async ({ documentId }) =>
    ok(await apiFetch(`/api/v1/leaseagreement/document/${documentId}/download`))
);

// ─── Lease Agreement Debit Rows ───────────────────────────────────────────────

server.registerTool(
  "list_lease_agreement_debit_rows",
  {
    description: "List individual charge rows on lease agreements (hyresrader). Filter by article to find all rows of a specific charge type.",
    inputSchema: {
      ...pageParams,
      articleId: z.string().uuid().optional().describe("Filter by article/charge-type UUID"),
    },
  },
  async ({ pageSize, pageNumber, articleId }) =>
    ok(await apiFetch(`/api/v1/leaseagreementdebitrow/${pageSize}/${pageNumber}`, {
      query: { "filter.articleId": articleId },
    }))
);

server.registerTool(
  "create_one_time_fee",
  {
    description: "Add a one-time fee (engångsavgift) to a lease agreement, e.g. a late fee or deposit.",
    inputSchema: {
      leaseAgreementId: z.string().uuid().describe("Lease agreement UUID"),
      articleCode: z.string().describe("Article code for the fee type"),
      amount: z.number().optional().describe("Fee amount"),
      quantity: z.number().optional().describe("Quantity (defaults to 1)"),
      invoiceRowDescription: z.string().optional().describe("Description that will appear on the invoice row"),
    },
  },
  async ({ leaseAgreementId, articleCode, amount, quantity, invoiceRowDescription }) =>
    ok(await apiFetch("/api/v1/leaseagreementdebitrow/onetimefee", {
      method: "POST",
      body: { leaseAgreementId, articleCode, amount, quantity, invoiceRowDescription },
    }))
);

// ─── Rental Object Debit Row Templates ───────────────────────────────────────

server.registerTool(
  "list_rental_object_debit_row_templates",
  {
    description: "List recurring charge templates on rental objects (hyresmallar). Filter by article to find objects with a specific charge type.",
    inputSchema: {
      ...pageParams,
      articleId: z.string().uuid().optional().describe("Filter by article/charge-type UUID"),
    },
  },
  async ({ pageSize, pageNumber, articleId }) =>
    ok(await apiFetch(`/api/v1/rentalobjectdebitrow/${pageSize}/${pageNumber}`, {
      query: { "filter.articleId": articleId },
    }))
);

// ─── Fault Notifications ──────────────────────────────────────────────────────

server.registerTool(
  "list_fault_notification_categories",
  {
    description: "Get all fault notification categories and sub-categories (felanmälningskategorier). Call this first to find the correct subCategoryId before creating a fault notification.",
  },
  async () => ok(await apiFetch("/api/v1/faultNotification/categories"))
);

server.registerTool(
  "list_fault_notifications",
  {
    description: "List fault notifications / maintenance requests (felanmälningar). Filter by lease agreement or contact.",
    inputSchema: {
      ...pageParams,
      leaseAgreementId: z.string().uuid().optional().describe("Filter by lease agreement UUID"),
      contactId: z.string().uuid().optional().describe("Filter by reporting contact UUID"),
    },
  },
  async ({ pageSize, pageNumber, leaseAgreementId, contactId }) =>
    ok(await apiFetch(`/api/v1/faultNotification/${pageSize}/${pageNumber}`, {
      query: {
        "filter.leaseAgreementId": leaseAgreementId,
        "filter.contactId": contactId,
      },
    }))
);

server.registerTool(
  "create_fault_notification",
  {
    description: "Create a new fault notification (felanmälan). Requires a subCategoryId from list_fault_notification_categories and either a leaseAgreementId or contactId.",
    inputSchema: {
      leaseAgreementId: z.string().uuid().optional().describe("UUID of the related lease agreement"),
      contactId: z.string().uuid().optional().describe("UUID of the contact reporting the fault"),
      subCategoryId: z.string().uuid().describe("Sub-category UUID (from list_fault_notification_categories)"),
      description: z.string().optional().describe("Description of the fault"),
      photoUrls: z.array(z.string().url()).optional().describe("List of photo URLs related to the fault"),
    },
  },
  async ({ leaseAgreementId, contactId, subCategoryId, description, photoUrls }) =>
    ok(await apiFetch("/api/v1/faultNotification", {
      method: "POST",
      body: { leaseAgreementId, contactId, subCategoryId, description, photoUrls },
    }))
);

server.registerTool(
  "list_fault_notification_action_measures",
  {
    description: "List action measures taken on fault notifications (åtgärder). Filter by date to get recent activity.",
    inputSchema: {
      ...pageParams,
      createdDateFrom: z.string().datetime().optional().describe("Return measures created on or after this UTC datetime"),
      createdDate: z.string().datetime().optional().describe("Return measures created on exactly this UTC datetime"),
    },
  },
  async ({ pageSize, pageNumber, createdDateFrom, createdDate }) =>
    ok(await apiFetch(`/api/v1/faultNotificationActionMeasure/${pageSize}/${pageNumber}`, {
      query: {
        "filter.createdDateFrom": createdDateFrom,
        "filter.createdDate": createdDate,
      },
    }))
);

// ─── Invoices ─────────────────────────────────────────────────────────────────

server.registerTool(
  "list_invoices",
  {
    description: "List invoices (fakturor). Use paymentStatus to filter by paid/unpaid/overdue. Use invoiceDateFrom or dueDateFrom to filter by date range.",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      recipientContactId: z.string().uuid().optional().describe("Filter by recipient tenant contact UUID"),
      paymentStatus: z
        .enum(["unpaid", "fullyPaid", "overdue", "partiallyPaid"])
        .optional()
        .describe("Filter by payment status"),
      invoiceDateFrom: z.string().datetime().optional().describe("Return invoices dated on or after this UTC datetime"),
      invoiceDate: z.string().datetime().optional().describe("Return invoices dated on exactly this UTC datetime"),
      dueDateFrom: z.string().datetime().optional().describe("Return invoices with due date on or after this UTC datetime"),
      dueDate: z.string().datetime().optional().describe("Return invoices with exactly this due date (UTC datetime)"),
    },
  },
  async ({ pageSize, pageNumber, companyId, recipientContactId, paymentStatus,
           invoiceDateFrom, invoiceDate, dueDateFrom, dueDate }) =>
    ok(await apiFetch(`/api/v1/invoice/${pageSize}/${pageNumber}`, {
      query: {
        "filter.companyId": companyId,
        "filter.recipientContactId": recipientContactId,
        "filter.paymentStatus": paymentStatus,
        "filter.invoiceDateFrom": invoiceDateFrom,
        "filter.invoiceDate": invoiceDate,
        "filter.dueDateFrom": dueDateFrom,
        "filter.dueDate": dueDate,
      },
    }))
);

server.registerTool(
  "get_invoice_pdf",
  {
    description: "Download an invoice as a base64-encoded PDF.",
    inputSchema: { invoiceId: z.string().uuid().describe("Invoice UUID") },
  },
  async ({ invoiceId }) => ok(await apiFetch(`/api/v1/invoice/${invoiceId}/pdf`))
);

// ─── Debt Collection ──────────────────────────────────────────────────────────

server.registerTool(
  "list_debt_collections",
  {
    description: "List debt collection cases (inkassoärenden).",
    inputSchema: {
      ...pageParams,
      createdAt: z.string().datetime().optional().describe("Filter by exact creation datetime (UTC)"),
      createdAtFrom: z.string().datetime().optional().describe("Filter cases created on or after this datetime (UTC)"),
    },
  },
  async ({ pageSize, pageNumber, createdAt, createdAtFrom }) =>
    ok(await apiFetch(`/api/v1/debtCollection/${pageSize}/${pageNumber}`, {
      query: {
        "filter.createdAt": createdAt,
        "filter.createdAtFrom": createdAtFrom,
      },
    }))
);

server.registerTool(
  "list_debt_collection_invoice_regulations",
  {
    description: "List debt collection payment updates and regulations (inkassobetalningar).",
    inputSchema: {
      ...pageParams,
      createdAt: z.string().datetime().optional().describe("Filter by exact creation datetime (UTC)"),
      createdAtFrom: z.string().datetime().optional().describe("Filter regulations created on or after this datetime (UTC)"),
    },
  },
  async ({ pageSize, pageNumber, createdAt, createdAtFrom }) =>
    ok(await apiFetch(`/api/v1/debtCollectionInvoiceRegulation/${pageSize}/${pageNumber}`, {
      query: {
        "filter.createdAt": createdAt,
        "filter.createdAtFrom": createdAtFrom,
      },
    }))
);

// ─── Contacts / Tenants ───────────────────────────────────────────────────────

server.registerTool(
  "find_contact_by_identity",
  {
    description: "Look up a contact/tenant by their identity number (personnummer, org.nr, etc.). Use this to check if a person already exists before creating a lease agreement.",
    inputSchema: {
      idType: z
        .enum([
          "none", "swedishSSN", "swedishOrganizationNumber", "swedishCoordinationNumber",
          "danishSSN", "danishOrganizationNumber", "finnishSSN", "finnishOrganizationNumber",
          "norwegianSSN", "norwegianOrganizationNumber", "birthdayIso8601",
          "freeText", "internationalPassportNumber",
        ])
        .describe("Type of identity number"),
      identity: z.string().describe("The identity value, e.g. '198001011234' for a Swedish SSN"),
    },
  },
  async ({ idType, identity }) =>
    ok(await apiFetch(`/api/v1/contact/find-id/${idType}/${identity}`))
);

// ─── BRF Members ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_brf_members",
  {
    description: "List all current members of a cooperative housing association (BRF). Requires the company UUID for the BRF.",
    inputSchema: { companyId: z.string().uuid().describe("BRF company UUID") },
  },
  async ({ companyId }) => ok(await apiFetch(`/api/v1/brf-members/current/${companyId}`))
);

// ─── Vacant Periods ───────────────────────────────────────────────────────────

server.registerTool(
  "list_vacant_periods",
  {
    description: "List vacant periods for dwellings (vakansperioder). Use vacantOnOrAfter to find upcoming or current vacancies.",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
      includeHistory: z.boolean().optional().describe("Include historical vacant periods"),
      vacantOnOrAfter: localDate.optional().describe("Return vacancies starting on or after this date, e.g. { year: 2024, month: 1, day: 1 }"),
    },
  },
  async ({ pageSize, pageNumber, companyId, propertyId, includeHistory, vacantOnOrAfter }) =>
    ok(await apiFetch(`/api/v1/vacantperioddwelling/${pageSize}/${pageNumber}`, {
      query: {
        "filter.companyId": companyId,
        "filter.propertyId": propertyId,
        "filter.includeHistory": includeHistory,
        "filter.vacantOnOrAfter.year": vacantOnOrAfter?.year,
        "filter.vacantOnOrAfter.month": vacantOnOrAfter?.month,
        "filter.vacantOnOrAfter.day": vacantOnOrAfter?.day,
      },
    }))
);

// ─── Articles ─────────────────────────────────────────────────────────────────

server.registerTool(
  "list_articles",
  {
    description: "List billing article types (artiklar) used on lease agreement charges. Use this to find the correct articleCode or articleId when creating fees.",
    inputSchema: pageParams,
  },
  async ({ pageSize, pageNumber }) =>
    ok(await apiFetch(`/api/v1/article/${pageSize}/${pageNumber}`))
);

// ─── Staircase / Entrance ─────────────────────────────────────────────────────

server.registerTool(
  "get_staircase_list",
  {
    description: "Get the staircase/door-code listing for a building entrance (trapphus).",
    inputSchema: { id: z.string().uuid().describe("Entrance UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/entrance/staircase-list/${id}`))
);

// ─── Company Mortgages ────────────────────────────────────────────────────────

server.registerTool(
  "list_company_mortgages",
  {
    description: "List company mortgages (företagsinteckningar).",
    inputSchema: pageParams,
  },
  async ({ pageSize, pageNumber }) =>
    ok(await apiFetch(`/api/v1/companymortgage/${pageSize}/${pageNumber}`))
);

// ─── E-Signature ──────────────────────────────────────────────────────────────

server.registerTool(
  "get_esignature_errand",
  {
    description: "Get the latest e-signature errand status for a lease agreement (e.g. BankID signing status).",
    inputSchema: {
      externalSystem: z.enum([
        "homepal","homeQ","ropoCapital","avy","yourBlock","dinBox","dh","dhMarket",
        "truId","openBusiness","hek","hogiaDynamics","vismaControlEdge","ropoOne",
        "accountingFTP","preventia","profina","dhMigration","accountingEmail",
        "frejaEID","psFinanceGroup","fastighetsagarnaMittNord",
      ]).describe("The external e-signature system"),
      leaseAgreementId: z.string().uuid().describe("Lease agreement UUID"),
    },
  },
  async ({ externalSystem, leaseAgreementId }) =>
    ok(await apiFetch(`/api/v1/esignature-errand/${externalSystem}/${leaseAgreementId}`))
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
