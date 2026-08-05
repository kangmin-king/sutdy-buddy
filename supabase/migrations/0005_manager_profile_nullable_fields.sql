-- Manager (tutor/parent) profiles don't use student-only fields.
-- Postgres CHECK constraints already pass on NULL (NULL IN (...) is NULL,
-- which CHECK treats as satisfied), so dropping NOT NULL alone is sufficient.
alter table sb_profiles alter column grade drop not null;
alter table sb_profiles alter column main_subjects drop not null;
alter table sb_profiles alter column goal drop not null;
alter table sb_profiles alter column workbooks drop not null;
