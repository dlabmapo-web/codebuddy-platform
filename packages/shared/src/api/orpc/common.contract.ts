import { z } from "zod";

export const emptyInputSchema = z.object({});
export const successResponseSchema = z.object({ success: z.literal(true) });
