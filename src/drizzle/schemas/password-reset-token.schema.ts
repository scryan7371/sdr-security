import {index, pgTable, timestamp, uuid, varchar} from "drizzle-orm/pg-core";
import {v7 as uuidv7} from "uuid";
import {user} from "./user.schema";

export const passwordResetToken = pgTable('password_reset_tokens', {
    id: uuid('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    userId: uuid().notNull().references(() => user.id, {onDelete: "cascade"}),
    token: varchar({length: 256}).notNull().unique(),
    expiresAt: timestamp({withTimezone: true})
        .notNull()
        .defaultNow(),
    usedAt: timestamp({withTimezone: true}),
    createdAt: timestamp({withTimezone: true})
        .notNull()
        .defaultNow(),
}, (table) => [
    index("password_reset_tokens_user_id_idx").on(table.userId),
])
