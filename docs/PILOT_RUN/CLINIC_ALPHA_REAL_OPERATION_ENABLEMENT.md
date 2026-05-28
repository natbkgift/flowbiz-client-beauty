# Clinic Alpha - Real Operation Enablement (PR-29)

Document type: controlled real-operation enablement record
Pilot clinic: Clinic Alpha (pseudonym only)
Date: 2026-05-28
Canonical URL: https://beauty.flowbiz.cloud

---

## 1) Branch and Runtime Verification

Branch state checks executed:
1. git status: clean
2. git branch: main active
3. git log --oneline -5: latest pilot doc commits present

Runtime verification executed:
1. /api/live: 200
2. /api/ready: 200
3. appEnv: staging
4. database: flowbiz_beauty_staging

---

## 2) Build and Deploy Actions

Host-level build/deploy actions executed on staging release directory:
1. npm run build:web
2. npm run validate
3. systemctl restart flowbiz-beauty-api-staging
4. systemctl restart flowbiz-beauty-web-staging

Post-restart service verification:
1. API service active
2. Web service active
3. Local host checks on 8103 and 8104 returned 200

---

## 3) Controlled Enablement Attempt

Controlled runtime toggle attempt executed:
1. LINE mode switched to real send path
2. AI provider switched to real draft generation path
3. services restarted after toggle

Observed blocker:
1. required runtime credentials for LINE and Gemini were not present in staging env
2. public endpoint briefly returned 502 after enablement attempt

Safety action taken immediately:
1. rollback to safe defaults executed
2. service restart executed
3. health checks returned to 200
