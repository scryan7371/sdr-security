import {jsonb, pgTable, timestamp, unique, uuid, varchar} from "drizzle-orm/pg-core";
import {user} from "./user.schema";
import type {SocialIdentity, SocialProvider} from "../../nest/security-social.options";

export const securityIdentity = pgTable("security_identities", {
    provider: varchar({length: 16}).notNull().$type<SocialProvider>(),
    subject: varchar({length: 256}).notNull(),
    userId: uuid().notNull().references(() => user.id, {onDelete: "cascade"}),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
}, table => [
    unique("security_identity_subject_unique").on(table.provider, table.subject),
    unique("security_identity_user_unique").on(table.userId),
]);

// Short-lived, one-use authorization state and app exchange tickets. No app tokens.
export const securitySocialAttempt = pgTable("security_social_attempts", {
    stateHash: varchar({length: 64}).primaryKey(),
    provider: varchar({length: 16}).notNull().$type<SocialProvider>(),
    nonce: varchar({length: 64}).notNull(),
    providerVerifier: varchar({length: 64}).notNull(),
    appChallenge: varchar({length: 43}).notNull(),
    returnUrl: varchar({length: 2048}).notNull(),
    expiresAt: timestamp({withTimezone: true}).notNull(),
});

export const securitySocialTicket = pgTable("security_social_tickets", {
    ticketHash: varchar({length: 64}).primaryKey(),
    appChallenge: varchar({length: 43}).notNull(),
    identity: jsonb().$type<SocialIdentity>(),
    error: varchar({length: 64}),
    expiresAt: timestamp({withTimezone: true}).notNull(),
});
