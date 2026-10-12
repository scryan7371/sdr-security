export type SocialProvider = "google" | "apple";

export type SocialAuthOptions = {
    /** Exact application URLs. Never derive these from request headers. */
    allowedReturnUrls: string[];
    google?: {clientId: string; clientSecret: string; callbackUrl: string};
    apple?: {
        clientId: string;
        teamId: string;
        keyId: string;
        privateKey: string;
        callbackUrl: string;
    };
};

export type SocialIdentity = {
    provider: SocialProvider;
    subject: string;
    email: string;
    firstName: string;
    lastName: string;
};
