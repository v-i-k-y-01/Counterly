# Counterly POS — SaaS Release & Zero-Downtime Deployment Guide

This document is your team's standard operating procedure (SOP) for rolling out updates, bug fixes, and database migrations to Counterly POS without disturbing active client store operations.

---

## 1. Release Trigger Workflow (Manual Approval & Semantic Tagging)

Per production best practices for retail POS SaaS, merging code to `main` does **not** push directly to client stores mid-day. Deployments are triggered deliberately when ready:

### Method A: Git Semantic Tag (CLI)
When a release is tested and ready to deploy:
```bash
# 1. Ensure you are on latest main
git checkout main
git pull origin main

# 2. Tag the release version
git tag -a v1.0.1 -m "Release v1.0.1: inventory speedup and receipt fixes"

# 3. Push the tag to GitHub
git push origin v1.0.1
```
*GitHub Actions automatically detects the tag, takes an AWS RDS safety snapshot, builds the Docker container, rolls out the ECS task, rebinds API Gateway, and publishes to Vercel.*

### Method B: One-Click Deploy (GitHub UI)
1. Go to your repository on GitHub: `https://github.com/v-i-k-y-01/PosBackend/actions`
2. Select **"Production Release (Zero-Downtime SaaS)"** on the left menu.
3. Click the **"Run workflow"** button.
4. Enter the release version tag (e.g. `v1.0.1`) and click **"Run workflow"**.

---

## 2. GitHub Secrets Setup (One-Time Setup)

In your GitHub repository, navigate to **Settings > Secrets and variables > Actions > New repository secret** and add the following 5 secrets:

| Secret Name | Value | Description |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | `AKIA2H2CG2U3...` | Your AWS IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | `wOQ9w5sD...` | Your AWS IAM Secret Key |
| `VERCEL_TOKEN` | `[From Vercel Settings > Tokens]` | Personal Access Token from Vercel Account Settings |
| `VERCEL_ORG_ID` | `team_LACNm9ynWCeiWnUFUpBZOko3` | Vercel Organization ID |
| `VERCEL_PROJECT_ID` | `prj_9YqnZA7A3650IaL338j7bkNrIpdI` | Vercel Project ID for pos-backend |

*(Note: `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are already pre-configured for your project! You only need to generate a Vercel Token from https://vercel.com/account/tokens).*

---

## 3. Zero-Data-Loss Database Schema Migrations

When introducing new database changes (e.g. new columns, tables, or indexes):

### Step 1: Write Safe EF Core Migrations (Expand Phase)
- **Always make new columns nullable or give them a default value:**
  ```csharp
  // Safe:
  builder.Property(x => x.Notes).HasMaxLength(500).IsRequired(false);
  // Safe:
  builder.Property(x => x.IsActive).HasDefaultValue(true);
  ```
- **Never rename or drop columns immediately** in an active release. Keep both old and new columns until all code has transitioned.

### Step 2: Generate Idempotent SQL
```bash
dotnet ef migrations script --idempotent --context AppDbContext -o safe_migration.sql
```

### Step 3: Apply to AWS RDS
Apply the script to your AWS RDS database (`pos-db.cerqw8wea5ak.us-east-1.rds.amazonaws.com:5432`) before deploying the new backend code. Because the schema changes are additive, existing running containers will continue operating without error!

---

## 4. Emergency Hotfix & Instant Rollback Playbook

If a critical bug is reported in production:

### Instant Rollback (<2 Minutes)
If a newly deployed container has an issue, revert ECS to the previous healthy task revision:
```bash
# 1. Revert ECS service to previous task revision
aws ecs update-service --cluster pos-cluster --service pos-api-service --task-definition pos-backend-task:2 --region us-east-1

# 2. Re-bind API Gateway to the restored task
python3 scripts/rebind-apigateway.py
```

### Emergency Hotfix Patch (<30 Minutes)
1. Create a hotfix branch from `main`:
   ```bash
   git checkout -b hotfix/fix-checkout-tax main
   ```
2. Commit your fix and push:
   ```bash
   git commit -am "fix: correct tax calculation on wholesale checkout"
   git push origin hotfix/fix-checkout-tax
   ```
3. Open a Pull Request into `main`. The automated CI pipeline will verify builds and tests.
4. Merge into `main` and tag the hotfix (e.g. `v1.0.2`):
   ```bash
   git tag v1.0.2 && git push origin v1.0.2
   ```
