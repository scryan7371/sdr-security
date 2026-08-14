import {index, pgTable, unique, uuid} from "drizzle-orm/pg-core";
import {v7 as uuidv7} from "uuid";
import {user} from "./user.schema";
import {securityRole} from "./security-role.schema";

export const securityUserRole = pgTable('security_user_roles', {
    id: uuid('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    userId: uuid().notNull().references(() => user.id, {onDelete: "cascade"}),
    roleId: uuid().notNull().references(() => securityRole.id, {onDelete: "cascade"}),
}, (table) => [
    unique("security_user_roles_user_id_role_id_unique").on(
        table.userId,
        table.roleId,
    ),
    index("security_user_roles_role_id_idx").on(table.roleId),
])
