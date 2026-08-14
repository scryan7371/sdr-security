import {pgTable, uuid, varchar} from "drizzle-orm/pg-core";
import {v7 as uuidv7} from 'uuid';

export const user = pgTable('users', {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    email: varchar({length: 256}).unique().notNull(),
    firstName: varchar({length: 256}),
    lastName: varchar({length: 256}),// Add user-related PostgreSQL tables and relations here.
})
