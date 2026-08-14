-- Local only. Official MySQL images grant MYSQL_USER access solely to MYSQL_DATABASE.
-- Prisma `migrate dev` also needs CREATE DATABASE for a temporary shadow database.
GRANT ALL PRIVILEGES ON *.* TO 'microfocus'@'%';
FLUSH PRIVILEGES;
