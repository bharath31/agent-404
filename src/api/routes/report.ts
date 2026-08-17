import { Hono } from "hono";
import type { PostgresStorage } from "../../storage/postgres.js";
import { auditReportPageHtml, auditReportNotFoundHtml } from "../../views/audit-report.js";

type Env = { Variables: { storage: PostgresStorage } };

const report = new Hono<Env>();

// Public, human-readable rendering of a standing audit report (BAT-38, BAT-39)
// permalink — previously served the generic interactive demo page for every
// :id, ignoring the param entirely. Looks up the durable report (see
// migrations/0007_audit_reports.sql) and renders its score/verdict with
// og:image / og:title / og:description meta tags for social unfurls.
report.get("/:id", async (c) => {
	const id = c.req.param("id");
	const storage = c.get("storage");
	const auditReport = storage ? await storage.getAuditReport(id) : null;

	if (!auditReport) {
		return c.html(auditReportNotFoundHtml(), 404);
	}

	return c.html(auditReportPageHtml(auditReport));
});

export { report };
