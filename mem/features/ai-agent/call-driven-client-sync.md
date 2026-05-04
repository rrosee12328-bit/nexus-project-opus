---
name: Call-driven client intelligence
description: After each call, AI updates profile (aspirations, sentiment, headline), creates ai_generated tasks needing review, logs goals timeline, files scope changes as approval_requests. Realtime broadcast.
type: feature
---
- analyze-call edge function writes tasks (ai_generated=true, needs_review=true, source_call_id), clients (aspirations, current_sentiment, last_call_headline, last_call_id, last_contact_date), client_notes (meeting recap + goals history), approval_requests (scope changes against active project).
- New columns: tasks.ai_generated/needs_review/source_call_id/reviewed_by/reviewed_at; clients.aspirations/aspirations_updated_at/current_sentiment/last_call_headline/last_call_id.
- UI: AITaskReviewCard + AspirationsCard on /admin/clients/:id.
- Realtime enabled on tasks/clients/client_notes/call_intelligence/approval_requests.
