export type SecurityWorkflowUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type SecurityWorkflowNotifier = {
  sendEmailVerification?: (params: {
    email: string;
    token: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  sendPasswordReset?: (params: {
    email: string;
    token: string;
  }) => Promise<void>;
  sendAdminsUserEmailVerified: (params: {
    adminEmails: string[];
    user: SecurityWorkflowUser;
  }) => Promise<void>;
  sendUserAccountApproved: (params: {
    email: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
};
