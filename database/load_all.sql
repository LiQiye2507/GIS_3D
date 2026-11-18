-- Nạp lại toàn bộ CSDL theo đúng thứ tự rồi in kết quả kiểm tra.
-- Chạy: psql -U postgres -d uit_campus -f database\load_all.sql
-- 01_schema.sql tự DROP bảng cũ nên chạy lại nhiều lần cho kết quả như nhau.
\set ON_ERROR_STOP on
\encoding UTF8
\ir 01_schema.sql
\ir 02_seed_uit_data.sql
\ir 03_toa_a_indoor.sql
\ir 04_campus_graph.sql
\ir 05_sports_fields.sql
\ir 06_toa_b_e_indoor.sql
\pset tuples_only on
\pset format unaligned
\ir checks.sql
