CREATE TABLE "security_identities" (
	"provider" varchar(16) NOT NULL,
	"subject" varchar(256) NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_identity_subject_unique" UNIQUE("provider","subject"),
	CONSTRAINT "security_identity_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "security_social_attempts" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(16) NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"provider_verifier" varchar(64) NOT NULL,
	"app_challenge" varchar(43) NOT NULL,
	"return_url" varchar(2048) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_social_tickets" (
	"ticket_hash" varchar(64) PRIMARY KEY NOT NULL,
	"app_challenge" varchar(43) NOT NULL,
	"identity" jsonb,
	"error" varchar(64),
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_users" ADD COLUMN "sign_in_method" varchar(16) DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "security_identities" ADD CONSTRAINT "security_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;