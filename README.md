# LDRRMO Diplahan Emergency Response System

React + Vite frontend backed by a PHP session API and MySQL database for XAMPP. Resident and staff workflows use the same backend: resident registration and emergency reporting, staff operations and assignments, evacuation centers, IoT devices/readings, notifications, caller logs, audit records, system configuration, analytics, and role-gated administration.

## Requirements

- Node.js 20+ and npm 10+ (or pnpm)
- XAMPP installed and **Apache and MySQL started**
- PHP 8.1+ with PDO MySQL, Fileinfo, and mbstring enabled

## Local setup

1. Install XAMPP, start **Apache** and **MySQL** from the XAMPP Control Panel, and confirm `http://localhost/` loads.
2. Import `xampp/database.sql` in phpMyAdmin.
3. Copy `xampp/api` to `C:\xampp\htdocs\ldrrmo-api\`. Keep private report uploads outside `htdocs`; the default API location is `C:\xampp\ldrrmo-private-uploads`.
4. Configure the MySQL connection and exact frontend origins in Apache's environment when needed. See [XAMPP setup](xampp/SETUP.md) for security details.
5. Set `VITE_XAMPP_API_URL=http://localhost/ldrrmo-api/index.php` in `.env`.
6. Install JavaScript dependencies and run `npm run dev`.
7. Provision the first administrator with the safe CLI procedure in the setup guide. There are no built-in, seeded, or demo accounts/data.

The `/xampp` route is retained as an alternate operations view over this same PHP/MySQL API and database; it is not a separate backend or data silo.

## Backend and security

The PHP API uses server-side PHP sessions, CSRF validation for mutations, prepared statements, server-side role checks, login throttling, password hashing, audit logging, and private authenticated media delivery. IoT readings are accepted only with a registered device's secret token; no simulated readings are produced. Browser polling replaces database realtime subscriptions.

Notification dispatch is persisted. In-app notifications are delivered from the database. Push, SMS, and email remain marked failed with a clear provider-not-configured message until real delivery providers are configured; the interface does not claim to have sent them.
