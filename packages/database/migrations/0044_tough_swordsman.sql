ALTER TABLE `video_uploads` ADD `processing_last_attempt_at` timestamp;--> statement-breakpoint
ALTER TABLE `video_uploads` ADD `processing_next_retry_at` timestamp;