declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
declare namespace Cloudflare {
  interface Env {
    PROVIDER_ENCRYPTION_KEY?: string;
    PARENT_PORTAL_SECRET?: string;
    COMMUNICATION_QUEUE?: Queue<{
      institutionId: string;
      kind?: "delivery" | "financial";
    }>;
    JOB_SECRET?: string;
    PLATFORM_OWNER_EMAIL?: string;
    PLATFORM_ORIGIN?: string;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
    CASHFREE_APP_ID?: string;
    CASHFREE_SECRET_KEY?: string;
    CASHFREE_ENV?: string;
    CONNECTORS?: any;
  }
}

interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
