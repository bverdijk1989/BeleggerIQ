-- Performance indexes — audit-driven (Module 16).
-- Adds (userId, status) compound on NotificationDelivery so digest-
-- batching queries hit a covering index instead of doing a secondary
-- in-memory filter on (userId, createdAt) results.

CREATE INDEX "NotificationDelivery_userId_status_idx" ON "NotificationDelivery"("userId", "status");
