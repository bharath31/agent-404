import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!, { fullResults: true });
const { rows } = await sql`SELECT domain, public_key FROM sites WHERE domain IN ('bharath.sh','nominee.dev')`;
for (const r of rows) console.log(r.domain, r.public_key);
