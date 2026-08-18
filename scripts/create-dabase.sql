-- rename every NEW_NAME instance to the name you intend to use
-- Change PASSWORD to the password you want to use for the new user
-- Connect as superuser (postgres)
CREATE DATABASE "NEW_NAME";
CREATE USER "NEW_NAME" WITH PASSWORD 'PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE "NEW_NAME" TO "NEW_NAME";
REVOKE CONNECT ON DATABASE "NEW_NAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE "NEW_NAME" TO postgres;

DO $$
DECLARE
    db_name TEXT;
BEGIN
    FOR db_name IN 
        SELECT datname FROM pg_database 
        WHERE datname != 'NEW_NAME'
    LOOP
        EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM "NEW_NAME"', db_name);
    END LOOP;
END $$;

-- psql -U postgres -d NEW_NAME
GRANT ALL ON SCHEMA public TO "NEW_NAME";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "NEW_NAME";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "NEW_NAME";