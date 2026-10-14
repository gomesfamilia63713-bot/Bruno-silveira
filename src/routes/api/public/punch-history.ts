import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/punch-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token")?.trim();
        if (!token || token.length > 200) return Response.json({ error: "Link inválido." }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: employee } = await supabaseAdmin
          .from("employees")
          .select("id")
          .eq("token", token)
          .eq("active", true)
          .maybeSingle();
        if (!employee) return Response.json({ error: "Link inválido ou funcionário inativo." }, { status: 404 });

        const since = new Date();
        since.setDate(since.getDate() - 29);
        const { data, error } = await supabaseAdmin
          .from("time_punches")
          .select("id,type,punched_at,photo_path,street,neighborhood,city,cep,justification,justification_audio_path,justification_audio_transcript")
          .eq("employee_id", employee.id)
          .gte("punched_at", since.toISOString())
          .order("punched_at", { ascending: false })
          .limit(30);
        if (error) return Response.json({ error: "Falha ao carregar o histórico." }, { status: 500 });

        const punches = await Promise.all((data ?? []).map(async (punch) => {
          const [photo, audio] = await Promise.all([
            punch.photo_path ? supabaseAdmin.storage.from("time-punch-photos").createSignedUrl(punch.photo_path, 3600) : null,
            punch.justification_audio_path ? supabaseAdmin.storage.from("time-punch-audio").createSignedUrl(punch.justification_audio_path, 3600) : null,
          ]);
          return {
            id: punch.id,
            type: punch.type,
            punched_at: punch.punched_at,
            street: punch.street,
            neighborhood: punch.neighborhood,
            city: punch.city,
            cep: punch.cep,
            justification: punch.justification,
            justification_audio_transcript: punch.justification_audio_transcript,
            photo_url: photo?.data?.signedUrl ?? null,
            audio_url: audio?.data?.signedUrl ?? null,
          };
        }));
        return Response.json({ punches }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});