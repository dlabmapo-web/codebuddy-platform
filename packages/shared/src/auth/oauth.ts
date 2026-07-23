import { z } from "zod";

export const socialAuthProviderSchema = z.enum([
  "google",
  "kakao",
  "custom:naver",
]);

export type SocialAuthProvider = z.infer<typeof socialAuthProviderSchema>;
