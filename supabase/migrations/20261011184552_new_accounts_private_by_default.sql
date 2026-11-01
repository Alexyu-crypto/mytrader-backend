-- Public report links are now enforced by the database, so a new account should
-- start private and be published deliberately from the Accounts page.
ALTER TABLE public.accounts ALTER COLUMN report_public SET DEFAULT false;
