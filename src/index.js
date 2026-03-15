import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiFetch } from "./auth.js";

const server = new McpServer({
  name: "dinhyresvard",
  version: "1.0.0",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pageParams = {
  pageSize: z.number().int().min(1).max(200).default(50).describe("Items per page"),
  pageNumber: z.number().int().min(1).default(1).describe("Page number (1-based)"),
};

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ─── Companies ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_companies",
  { description: "List companies with pagination", inputSchema: pageParams },
  async ({ pageSize, pageNumber }) => ok(await apiFetch(`/api/v1/company/${pageSize}/${pageNumber}`))
);

// ─── Properties ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_properties",
  { description: "List real-estate properties with pagination", inputSchema: pageParams },
  async ({ pageSize, pageNumber }) => ok(await apiFetch(`/api/v1/property/${pageSize}/${pageNumber}`))
);

// ─── Buildings ────────────────────────────────────────────────────────────────

server.registerTool(
  "list_buildings",
  { description: "List buildings with pagination", inputSchema: pageParams },
  async ({ pageSize, pageNumber }) => ok(await apiFetch(`/api/v1/building/${pageSize}/${pageNumber}`))
);

// ─── Building Spaces ──────────────────────────────────────────────────────────

server.registerTool(
  "list_building_spaces",
  {
    description: "List building spaces, optionally filtered by company, building, or property",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId }) =>
    ok(
      await apiFetch(`/api/v1/buildingspace/${pageSize}/${pageNumber}`, {
        query: {
          "filter.companyId": companyId,
          "filter.buildingId": buildingId,
          "filter.propertyId": propertyId,
        },
      })
    )
);

// ─── Dwellings (Units) ────────────────────────────────────────────────────────

server.registerTool(
  "list_dwellings",
  {
    description: "List dwelling units (apartments) with optional filters",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId }) =>
    ok(
      await apiFetch(`/api/v1/dwelling/${pageSize}/${pageNumber}`, {
        query: {
          "filter.companyId": companyId,
          "filter.buildingId": buildingId,
          "filter.propertyId": propertyId,
        },
      })
    )
);

server.registerTool(
  "get_dwelling",
  {
    description: "Get detailed information about a specific dwelling by ID",
    inputSchema: { id: z.string().uuid().describe("Dwelling UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/dwelling/${id}`))
);

// ─── Parking ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_parking",
  {
    description: "List parking spaces with pagination",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId }) =>
    ok(
      await apiFetch(`/api/v1/parking/${pageSize}/${pageNumber}`, {
        query: {
          "filter.companyId": companyId,
          "filter.buildingId": buildingId,
          "filter.propertyId": propertyId,
        },
      })
    )
);

server.registerTool(
  "get_parking",
  {
    description: "Get detailed information about a specific parking space by ID",
    inputSchema: { id: z.string().uuid().describe("Parking UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/parking/${id}`))
);

// ─── Premises ────────────────────────────────────────────────────────────────

server.registerTool(
  "list_premises",
  {
    description: "List commercial premises with pagination",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId }) =>
    ok(
      await apiFetch(`/api/v1/premises/${pageSize}/${pageNumber}`, {
        query: {
          "filter.companyId": companyId,
          "filter.buildingId": buildingId,
          "filter.propertyId": propertyId,
        },
      })
    )
);

server.registerTool(
  "get_premises",
  {
    description: "Get detailed information about specific premises by ID",
    inputSchema: { id: z.string().uuid().describe("Premises UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/premises/${id}`))
);

// ─── Other Rental Objects ─────────────────────────────────────────────────────

server.registerTool(
  "list_other_rental_objects",
  {
    description: "List other rental objects (storage, etc.) with pagination",
    inputSchema: {
      ...pageParams,
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
    },
  },
  async ({ pageSize, pageNumber, companyId, buildingId, propertyId }) =>
    ok(
      await apiFetch(`/api/v1/otherRentalObject/${pageSize}/${pageNumber}`, {
        query: {
          "filter.companyId": companyId,
          "filter.buildingId": buildingId,
          "filter.propertyId": propertyId,
        },
      })
    )
);

server.registerTool(
  "get_other_rental_object",
  {
    description: "Get detailed information about a specific other rental object by ID",
    inputSchema: { id: z.string().uuid().describe("Rental object UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/otherRentalObject/${id}`))
);

// ─── Lease Agreements ─────────────────────────────────────────────────────────

server.registerTool(
  "list_lease_agreements",
  {
    description: "List lease agreements with optional filters",
    inputSchema: {
      ...pageParams,
      rentalObjectId: z.string().uuid().optional().describe("Filter by rental object UUID"),
      tenantContactId: z.string().uuid().optional().describe("Filter by tenant contact UUID"),
      isActive: z.boolean().optional().describe("Filter active/inactive agreements"),
      fromDate: z.string().optional().describe("Filter from date (ISO 8601)"),
      toDate: z.string().optional().describe("Filter to date (ISO 8601)"),
    },
  },
  async ({ pageSize, pageNumber, rentalObjectId, tenantContactId, isActive, fromDate, toDate }) =>
    ok(
      await apiFetch(`/api/v1/leaseagreement/${pageSize}/${pageNumber}`, {
        query: {
          "filter.rentalObjectId": rentalObjectId,
          "filter.tenantContactId": tenantContactId,
          "filter.isActive": isActive,
          "filter.fromDate": fromDate,
          "filter.toDate": toDate,
        },
      })
    )
);

server.registerTool(
  "get_lease_agreement",
  {
    description: "Get detailed information about a specific lease agreement by ID",
    inputSchema: { id: z.string().uuid().describe("Lease agreement UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/leaseagreement/${id}`))
);

server.registerTool(
  "validate_tenant_email",
  {
    description: "Check if an email address has a current or upcoming valid lease agreement",
    inputSchema: { contactEmail: z.string().email().describe("Tenant email address to validate") },
  },
  async ({ contactEmail }) =>
    ok(await apiFetch("/api/v1/leaseagreement/email-has-valid-contract", { query: { contactEmail } }))
);

server.registerTool(
  "create_lease_agreement",
  {
    description: "Create a new lease agreement",
    inputSchema: {
      callerLeaseAgreementId: z.string().uuid().describe("External system's ID for this lease"),
      callerSystem: z.string().describe("External system identifier"),
      rentalObjectId: z.string().uuid().describe("Rental object UUID"),
      fromDate: z.object({ year: z.number(), month: z.number(), day: z.number() }).describe("Start date"),
      lastBillingDate: z.object({ year: z.number(), month: z.number(), day: z.number() }).describe("Last billing date"),
      tenantOneSocialSecurityNumber: z.string().describe("Tenant 1 SSN"),
      tenantOneEmail: z.string().email().describe("Tenant 1 email"),
      tenantOneMobilePhone: z.string().optional().describe("Tenant 1 mobile phone"),
      tenantTwoSocialSecurityNumber: z.string().optional().describe("Tenant 2 SSN (optional)"),
      tenantTwoEmail: z.string().email().optional().describe("Tenant 2 email (optional)"),
    },
  },
  async ({ callerLeaseAgreementId, callerSystem, rentalObjectId, fromDate, lastBillingDate,
           tenantOneSocialSecurityNumber, tenantOneEmail, tenantOneMobilePhone,
           tenantTwoSocialSecurityNumber, tenantTwoEmail }) => {
    const body = {
      callerLeaseAgreementId,
      callerSystem,
      rentalObjectId,
      fromDate,
      lastBillingDate,
      tenantOne: {
        socialSecurityNumber: tenantOneSocialSecurityNumber,
        email: tenantOneEmail,
        mobilePhone: tenantOneMobilePhone,
      },
    };
    if (tenantTwoSocialSecurityNumber) {
      body.tenantTwo = {
        socialSecurityNumber: tenantTwoSocialSecurityNumber,
        email: tenantTwoEmail,
      };
    }
    return ok(await apiFetch("/api/v1/leaseagreement", { method: "POST", body }));
  }
);

server.registerTool(
  "download_lease_agreement_document",
  {
    description: "Download a lease agreement document as base64-encoded PDF",
    inputSchema: { documentId: z.string().uuid().describe("Document UUID") },
  },
  async ({ documentId }) => ok(await apiFetch(`/api/v1/leaseagreement/document/${documentId}/download`))
);

// ─── Lease Agreement Debit Rows ───────────────────────────────────────────────

server.registerTool(
  "list_lease_agreement_debit_rows",
  {
    description: "List lease agreement debit rows (charges)",
    inputSchema: {
      ...pageParams,
      leaseAgreementId: z.string().uuid().optional().describe("Filter by lease agreement UUID"),
    },
  },
  async ({ pageSize, pageNumber, leaseAgreementId }) =>
    ok(
      await apiFetch(`/api/v1/leaseagreementdebitrow/${pageSize}/${pageNumber}`, {
        query: { "filter.leaseAgreementId": leaseAgreementId },
      })
    )
);

server.registerTool(
  "create_one_time_fee",
  {
    description: "Add a one-time fee debit row to a lease agreement",
    inputSchema: {
      leaseAgreementId: z.string().uuid().describe("Lease agreement UUID"),
      articleCode: z.string().describe("Article code for the fee"),
      amount: z.number().optional().describe("Amount"),
      quantity: z.number().optional().describe("Quantity"),
      invoiceRowDescription: z.string().optional().describe("Description on invoice"),
    },
  },
  async ({ leaseAgreementId, articleCode, amount, quantity, invoiceRowDescription }) =>
    ok(
      await apiFetch("/api/v1/leaseagreementdebitrow/onetimefee", {
        method: "POST",
        body: { leaseAgreementId, articleCode, amount, quantity, invoiceRowDescription },
      })
    )
);

// ─── Fault Notifications ──────────────────────────────────────────────────────

server.registerTool(
  "list_fault_notification_categories",
  { description: "Get all available fault notification categories and sub-categories" },
  async () => ok(await apiFetch("/api/v1/faultNotification/categories"))
);

server.registerTool(
  "list_fault_notifications",
  {
    description: "List fault notifications (maintenance requests) with optional filters",
    inputSchema: {
      ...pageParams,
      rentalObjectId: z.string().uuid().optional().describe("Filter by rental object UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
      propertyId: z.string().uuid().optional().describe("Filter by property UUID"),
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
    },
  },
  async ({ pageSize, pageNumber, rentalObjectId, buildingId, propertyId, companyId }) =>
    ok(
      await apiFetch(`/api/v1/faultNotification/${pageSize}/${pageNumber}`, {
        query: {
          "filter.rentalObjectId": rentalObjectId,
          "filter.buildingId": buildingId,
          "filter.propertyId": propertyId,
          "filter.companyId": companyId,
        },
      })
    )
);

server.registerTool(
  "create_fault_notification",
  {
    description: "Create a new fault notification / maintenance request",
    inputSchema: {
      rentalObjectId: z.string().uuid().optional().describe("Rental object UUID (if applicable)"),
      buildingId: z.string().uuid().optional().describe("Building UUID (if applicable)"),
      categoryId: z.string().uuid().describe("Fault category UUID (from list_fault_notification_categories)"),
      subCategoryId: z.string().uuid().optional().describe("Sub-category UUID"),
      description: z.string().describe("Description of the fault"),
      reporterName: z.string().optional().describe("Name of the reporter"),
      reporterEmail: z.string().email().optional().describe("Email of the reporter"),
      reporterPhone: z.string().optional().describe("Phone of the reporter"),
    },
  },
  async ({ rentalObjectId, buildingId, categoryId, subCategoryId, description,
           reporterName, reporterEmail, reporterPhone }) =>
    ok(
      await apiFetch("/api/v1/faultNotification", {
        method: "POST",
        body: {
          rentalObjectId,
          buildingId,
          categoryId,
          subCategoryId,
          description,
          reporterName,
          reporterEmail,
          reporterPhone,
        },
      })
    )
);

server.registerTool(
  "list_fault_notification_action_measures",
  {
    description: "List action measures taken for fault notifications",
    inputSchema: {
      ...pageParams,
      faultNotificationId: z.string().uuid().optional().describe("Filter by fault notification UUID"),
    },
  },
  async ({ pageSize, pageNumber, faultNotificationId }) =>
    ok(
      await apiFetch(`/api/v1/faultNotificationActionMeasure/${pageSize}/${pageNumber}`, {
        query: { "filter.faultNotificationId": faultNotificationId },
      })
    )
);

// ─── Invoices ─────────────────────────────────────────────────────────────────

server.registerTool(
  "list_invoices",
  {
    description: "List invoices with optional filters",
    inputSchema: {
      ...pageParams,
      leaseAgreementId: z.string().uuid().optional().describe("Filter by lease agreement UUID"),
      contactId: z.string().uuid().optional().describe("Filter by tenant contact UUID"),
      dueDateFrom: z.string().optional().describe("Filter due date from (ISO 8601)"),
      dueDateTo: z.string().optional().describe("Filter due date to (ISO 8601)"),
      isPaid: z.boolean().optional().describe("Filter paid/unpaid invoices"),
    },
  },
  async ({ pageSize, pageNumber, leaseAgreementId, contactId, dueDateFrom, dueDateTo, isPaid }) =>
    ok(
      await apiFetch(`/api/v1/invoice/${pageSize}/${pageNumber}`, {
        query: {
          "filter.leaseAgreementId": leaseAgreementId,
          "filter.contactId": contactId,
          "filter.dueDateFrom": dueDateFrom,
          "filter.dueDateTo": dueDateTo,
          "filter.isPaid": isPaid,
        },
      })
    )
);

server.registerTool(
  "get_invoice_pdf",
  {
    description: "Download an invoice as a base64-encoded PDF",
    inputSchema: { invoiceId: z.string().uuid().describe("Invoice UUID") },
  },
  async ({ invoiceId }) => ok(await apiFetch(`/api/v1/invoice/${invoiceId}/pdf`))
);

// ─── Debt Collection ──────────────────────────────────────────────────────────

server.registerTool(
  "list_debt_collections",
  {
    description: "List debt collection cases",
    inputSchema: {
      ...pageParams,
      createdAtFrom: z.string().optional().describe("Filter created from (ISO 8601 datetime)"),
    },
  },
  async ({ pageSize, pageNumber, createdAtFrom }) =>
    ok(
      await apiFetch(`/api/v1/debtCollection/${pageSize}/${pageNumber}`, {
        query: { "filter.createdAtFrom": createdAtFrom },
      })
    )
);

server.registerTool(
  "list_debt_collection_invoice_regulations",
  {
    description: "List debt collection invoice payment updates/regulations",
    inputSchema: {
      ...pageParams,
      createdAtFrom: z.string().optional().describe("Filter created from (ISO 8601 datetime)"),
    },
  },
  async ({ pageSize, pageNumber, createdAtFrom }) =>
    ok(
      await apiFetch(`/api/v1/debtCollectionInvoiceRegulation/${pageSize}/${pageNumber}`, {
        query: { "filter.createdAtFrom": createdAtFrom },
      })
    )
);

// ─── Contacts / Tenants ───────────────────────────────────────────────────────

server.registerTool(
  "find_contact_by_identity",
  {
    description: "Find a contact/tenant by their identity number (SSN, org number, etc.)",
    inputSchema: {
      idType: z
        .enum([
          "none",
          "swedishSSN",
          "swedishOrganizationNumber",
          "swedishCoordinationNumber",
          "danishSSN",
          "danishOrganizationNumber",
          "finnishSSN",
          "finnishOrganizationNumber",
          "norwegianSSN",
          "norwegianOrganizationNumber",
          "birthdayIso8601",
          "freeText",
          "internationalPassportNumber",
        ])
        .describe("Type of identity number"),
      identity: z.string().describe("The identity value to search for"),
    },
  },
  async ({ idType, identity }) => ok(await apiFetch(`/api/v1/contact/find-id/${idType}/${identity}`))
);

// ─── BRF Members ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_brf_members",
  {
    description: "List all current members of a cooperative housing (BRF) company",
    inputSchema: { companyId: z.string().uuid().describe("Cooperative housing company UUID") },
  },
  async ({ companyId }) => ok(await apiFetch(`/api/v1/brf-members/current/${companyId}`))
);

// ─── Vacant Periods ───────────────────────────────────────────────────────────

server.registerTool(
  "list_vacant_periods",
  {
    description: "List vacant periods for dwellings",
    inputSchema: {
      ...pageParams,
      dwellingId: z.string().uuid().optional().describe("Filter by dwelling UUID"),
      companyId: z.string().uuid().optional().describe("Filter by company UUID"),
      buildingId: z.string().uuid().optional().describe("Filter by building UUID"),
    },
  },
  async ({ pageSize, pageNumber, dwellingId, companyId, buildingId }) =>
    ok(
      await apiFetch(`/api/v1/vacantperioddwelling/${pageSize}/${pageNumber}`, {
        query: {
          "filter.dwellingId": dwellingId,
          "filter.companyId": companyId,
          "filter.buildingId": buildingId,
        },
      })
    )
);

// ─── Articles ─────────────────────────────────────────────────────────────────

server.registerTool(
  "list_articles",
  { description: "List billing articles/fee types", inputSchema: pageParams },
  async ({ pageSize, pageNumber }) => ok(await apiFetch(`/api/v1/article/${pageSize}/${pageNumber}`))
);

// ─── Rental Object Debit Row Templates ───────────────────────────────────────

server.registerTool(
  "list_rental_object_debit_row_templates",
  {
    description: "List rental object debit row templates (recurring charge templates)",
    inputSchema: {
      ...pageParams,
      rentalObjectId: z.string().uuid().optional().describe("Filter by rental object UUID"),
    },
  },
  async ({ pageSize, pageNumber, rentalObjectId }) =>
    ok(
      await apiFetch(`/api/v1/rentalobjectdebitrow/${pageSize}/${pageNumber}`, {
        query: { "filter.rentalObjectId": rentalObjectId },
      })
    )
);

// ─── Staircase / Entrance ─────────────────────────────────────────────────────

server.registerTool(
  "get_staircase_list",
  {
    description: "Get the staircase listing for an entrance",
    inputSchema: { id: z.string().uuid().describe("Entrance/staircase UUID") },
  },
  async ({ id }) => ok(await apiFetch(`/api/v1/entrance/staircase-list/${id}`))
);

// ─── Company Mortgages ────────────────────────────────────────────────────────

server.registerTool(
  "list_company_mortgages",
  { description: "List company mortgages", inputSchema: pageParams },
  async ({ pageSize, pageNumber }) => ok(await apiFetch(`/api/v1/companymortgage/${pageSize}/${pageNumber}`))
);

// ─── E-Signature ──────────────────────────────────────────────────────────────

server.registerTool(
  "get_esignature_errand",
  {
    description: "Get the latest e-signature errand for a lease agreement",
    inputSchema: {
      externalSystem: z.string().describe("External system kind (e.g. 'signicat', 'bankId')"),
      leaseAgreementId: z.string().uuid().describe("Lease agreement UUID"),
    },
  },
  async ({ externalSystem, leaseAgreementId }) =>
    ok(await apiFetch(`/api/v1/esignature-errand/${externalSystem}/${leaseAgreementId}`))
);

// ─── Dwelling Rooms ───────────────────────────────────────────────────────────

server.registerTool(
  "list_dwelling_rooms",
  {
    description: "List rooms within dwellings",
    inputSchema: {
      ...pageParams,
      dwellingId: z.string().uuid().optional().describe("Filter by dwelling UUID"),
    },
  },
  async ({ pageSize, pageNumber, dwellingId }) =>
    ok(
      await apiFetch(`/api/v1/dwellingroom/${pageSize}/${pageNumber}`, {
        query: { "filter.dwellingId": dwellingId },
      })
    )
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
