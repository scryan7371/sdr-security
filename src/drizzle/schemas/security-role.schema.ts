import {boolean, pgTable, text, timestamp, uuid, varchar} from "drizzle-orm/pg-core";
import {v7 as uuidv7} from "uuid";

export const securityRole = pgTable('security_roles', {
    id: uuid('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    roleKey: varchar({length: 256}).notNull().unique(),
    description: text(),
    isSystem: boolean().notNull().default(false),
})