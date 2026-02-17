export type VerificationNotificationUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export const notifyAdminsOnEmailVerified = async (params: {
  user: VerificationNotificationUser;
  listAdminEmails: () => Promise<string[]>;
  notifyAdmins: (payload: {
    adminEmails: string[];
    user: VerificationNotificationUser;
  }) => Promise<void>;
}) => {
  const adminEmails = await params.listAdminEmails();
  if (adminEmails.length === 0) {
    return { notified: false as const, adminEmails };
  }

  await params.notifyAdmins({ adminEmails, user: params.user });
  return { notified: true as const, adminEmails };
};

export const notifyUserOnAdminApproval = async (params: {
  approved: boolean;
  user: {
    email: string;
    firstName?: string | null;
  };
  notifyUser: (payload: {
    email: string;
    firstName?: string | null;
  }) => Promise<void>;
}) => {
  if (!params.approved) {
    return { notified: false as const };
  }

  await params.notifyUser({
    email: params.user.email,
    firstName: params.user.firstName,
  });
  return { notified: true as const };
};
