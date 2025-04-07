PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_todos` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_todos`("id", "user_id", "title", "completed", "created_at") SELECT "id", "user_id", "title", "completed", "created_at" FROM `todos`;--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;