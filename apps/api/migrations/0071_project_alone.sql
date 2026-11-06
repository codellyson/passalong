-- A project whose new work starts out ticked Safe to run alone: 1 when a person turned it on.
-- Only work a person files into it from the hub is ticked this way; mail, webhooks and agents
-- never are. Ticking or unticking each piece afterwards is unchanged.
ALTER TABLE project ADD COLUMN alone_default INTEGER NOT NULL DEFAULT 0;
