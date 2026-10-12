import {boolean, pgTable, timestamp, uuid, varchar} from "drizzle-orm/pg-core";
import {v7 as uuidv7} from "uuid";
import {user} from "./user.schema";

export const securityUser = pgTable('security_users', {
    id: uuid('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    signInMethod: varchar({length: 16}).notNull().default("password").$type<"password" | "google" | "apple">(),
    passwordHash: varchar().notNull(),
    active: boolean().notNull().default(true),
    userId: uuid().notNull().unique().references(() => user.id, {onDelete: "cascade"}),
    emailVerificationToken: varchar(),
    emailVerifiedAt: timestamp({withTimezone: true}),
    adminApprovedAt: timestamp({withTimezone: true}),
    createdAt: timestamp({withTimezone: true})
        .notNull()
        .defaultNow(),
})
