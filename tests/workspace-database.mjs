// Run against a disposable PostgreSQL-compatible PGlite instance, never production.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "/tmp/vektiss-pglite/package/dist/index.js");
const db = new PGlite();
const client = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const proposal = "33333333-3333-4333-8333-333333333333";
const call = "44444444-4444-4444-8444-444444444444";
const user = "55555555-5555-4555-8555-555555555555";
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true) = $2 $$;
    CREATE FUNCTION public.get_client_id_for_user(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.client',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
    CREATE TABLE clients(id uuid PRIMARY KEY, setup_fee numeric, setup_paid numeric, balance_due numeric);
    CREATE TABLE proposals(id uuid PRIMARY KEY, setup_fee numeric, setup_paid numeric);
    CREATE TABLE call_intelligence(id uuid PRIMARY KEY, client_id uuid, call_date timestamptz);
    CREATE TABLE client_notes(id uuid PRIMARY KEY);
    CREATE TABLE tasks(id uuid PRIMARY KEY);
    CREATE TABLE client_activity_feed(id uuid PRIMARY KEY, source text);
    CREATE TABLE client_payments(client_id uuid, amount numeric, payment_month int, payment_year int, notes text, stripe_invoice_id text, payment_source text);
    ALTER TABLE call_intelligence ENABLE ROW LEVEL SECURITY;
    ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE client_activity_feed ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy ON call_intelligence FOR SELECT USING (true);
    CREATE POLICY legacy ON client_notes FOR SELECT USING (true);
    CREATE POLICY legacy ON tasks FOR SELECT USING (true);
    CREATE POLICY legacy ON client_activity_feed FOR SELECT USING (true);
    GRANT SELECT ON call_intelligence,client_notes,tasks,client_activity_feed TO authenticated;
    INSERT INTO clients VALUES ('${client}',1500,0,1500),('${other}',1500,1500,0);
    INSERT INTO proposals VALUES ('${proposal}',1500,0);
    INSERT INTO auth.users VALUES ('${user}');
    INSERT INTO call_intelligence VALUES ('${call}','${client}',now());
    INSERT INTO client_notes VALUES (gen_random_uuid());
    INSERT INTO tasks VALUES (gen_random_uuid());
    INSERT INTO client_activity_feed VALUES (gen_random_uuid(),'fathom'),(gen_random_uuid(),'payment');
  `);
  await db.exec(await readFile("supabase/migrations/20260924120000_workspace_reliability.sql", "utf8"));
  console.log("PASS migration executes");

  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
  assert.equal(await scalar("SELECT claim_integration_run('stripe','evt-test')"), true);
  assert.equal(await scalar("SELECT claim_integration_run('stripe','evt-test')"), false);
  await db.exec("UPDATE integration_runs SET status='failed' WHERE external_id='evt-test'");
  assert.equal(await scalar("SELECT claim_integration_run('stripe','evt-test')"), true);
  await db.exec("UPDATE integration_runs SET status='completed' WHERE external_id='evt-test'");
  assert.equal(await scalar("SELECT claim_integration_run('stripe','evt-test')"), false);
  console.log("PASS integration claims, retry, completed-event deduplication");

  const credit = `SELECT record_proposal_checkout('cs-test','${proposal}','${client}','pi-test',750,now(),false,'Deposit')`;
  await db.exec(credit);
  await db.exec(credit);
  assert.equal(Number(await scalar(`SELECT setup_paid FROM clients WHERE id='${client}'`)), 750);
  assert.equal(Number(await scalar("SELECT count(*) FROM client_payments")), 1);
  await db.exec(`SELECT record_proposal_checkout('cs-final','${proposal}','${client}','pi-final',750,now(),false,'Balance')`);
  assert.equal(Number(await scalar(`SELECT balance_due FROM clients WHERE id='${client}'`)), 0);
  console.log("PASS deposit replay and final payment credit");

  await db.exec(`SELECT set_config('test.user','${user}',false); SELECT set_config('test.role','admin',false); SET ROLE authenticated;`);
  await db.exec(`INSERT INTO client_meeting_summaries(id,client_id,call_date,summary,approved_by) VALUES('${call}','${other}',now(),'Approved meeting summary','${user}')`);
  assert.equal(await scalar("SELECT client_id FROM client_meeting_summaries"), client);
  await db.exec(`SELECT set_config('test.role','client',false); SELECT set_config('test.client','${client}',false);`);
  assert.equal(Number(await scalar("SELECT count(*) FROM client_meeting_summaries")), 1);
  for (const table of ["call_intelligence", "client_notes", "tasks", "integration_runs"]) {
    assert.equal(Number(await scalar(`SELECT count(*) FROM ${table}`)), 0, `${table} must stay private`);
  }
  assert.equal(Number(await scalar("SELECT count(*) FROM client_activity_feed")), 1);
  await db.exec(`SELECT set_config('test.client','${other}',false)`);
  assert.equal(Number(await scalar("SELECT count(*) FROM client_meeting_summaries")), 0);
  await assert.rejects(() => db.exec("SELECT claim_integration_run('stripe','not-authorized')"));
  assert.equal((await db.query("UPDATE client_meeting_summaries SET summary='altered' RETURNING id")).rows.length, 0);
  console.log("PASS cross-client isolation, internal-data guards, service-only claims, publication ownership");
} finally {
  await db.close();
}
