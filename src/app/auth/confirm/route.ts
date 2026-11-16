import { NextResponse, after, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getEmailService } from "@/services/container";

/** Confirmação por token_hash (templates de e-mail em supabase/templates). */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const nextParam = req.nextUrl.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : type === "recovery" ? "/redefinir-senha" : "/conta";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // E-mail de boas-vindas após a confirmação do cadastro
      if ((type === "email" || type === "signup") && data.user?.email) {
        after(() =>
          getEmailService()
            .welcome(data.user!.email!, (data.user!.user_metadata?.full_name as string) ?? "")
            .catch(() => {}),
        );
      }
      return NextResponse.redirect(new URL(next, req.url));
    }
  }
  return NextResponse.redirect(new URL("/entrar?erro=link-invalido", req.url));
}
