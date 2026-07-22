import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createNaverUserInfoHandler } from "./handler.ts";

Deno.serve(createNaverUserInfoHandler());
