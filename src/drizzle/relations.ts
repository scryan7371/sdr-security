import {relations} from "drizzle-orm";
import {
    passwordResetToken,
    refreshToken,
    securityRole,
    securityUser,
    securityUserRole,
    user,
} from "./schema";

export const userRelations = relations(user, ({many, one}) => ({
    securityUser: one(securityUser, {
        fields: [user.id],
        references: [securityUser.userId],
    }),
    refreshTokens: many(refreshToken),
    passwordResetTokens: many(passwordResetToken),
    roleAssignments: many(securityUserRole),
}));

export const securityUserRelations = relations(securityUser, ({one}) => ({
    user: one(user, {
        fields: [securityUser.userId],
        references: [user.id],
    }),
}));

export const refreshTokenRelations = relations(refreshToken, ({one}) => ({
    user: one(user, {
        fields: [refreshToken.userId],
        references: [user.id],
    }),
}));

export const passwordResetTokenRelations = relations(
    passwordResetToken,
    ({one}) => ({
        user: one(user, {
            fields: [passwordResetToken.userId],
            references: [user.id],
        }),
    }),
);

export const securityRoleRelations = relations(securityRole, ({many}) => ({
    assignments: many(securityUserRole),
}));

export const securityUserRoleRelations = relations(
    securityUserRole,
    ({one}) => ({
        user: one(user, {
            fields: [securityUserRole.userId],
            references: [user.id],
        }),
        role: one(securityRole, {
            fields: [securityUserRole.roleId],
            references: [securityRole.id],
        }),
    }),
);
