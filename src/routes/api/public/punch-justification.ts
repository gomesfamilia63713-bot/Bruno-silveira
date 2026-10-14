import { createFileRoute } from "@tanstack/react-router";

const MAX_AUDIO_BYTES = 14 * 1024 * 1024;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function transcribeAudio(audio: File, apiKey: string) {
  const body = new FormData();
  body.append("model", "google/gemini-3.5-transcribe");
  body.append("file", audio, "justificativa.wav");
  body.append("stream", "true");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    return { ok: false as const, status: response.status, message: details || "Não foi possível transcrever o áudio." };
  }

  const payload = await response.text();
  let transcript = "";
  let finalTranscript = "";
  for (const line of payload.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") continue;
    try {
      const event = JSON.parse(value) as { type?: string; delta?: string; text?: string };
      if (event.type === "transcript.text.done" && event.text) finalTranscript = event.text;
      else if (event.type === "transcript.text.delta" && event.delta) transcript += event.delta;
    } catch {
      // Ignora linhas SSE que não são eventos JSON.
    }
  }
  return { ok: true as const, text: (finalTranscript || transcript).trim() };
}

export const Route = createFileRoute("/api/public/punch-justification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null);
        if (!form) return jsonError("Envio inválido.", 400);

        const token = String(form.get("token") ?? "").trim();
        const clientId = String(form.get("clientId") ?? "").trim();
        const type = String(form.get("type") ?? "");
        const punchedAt = String(form.get("punchedAt") ?? "");
        const typedJustification = String(form.get("justification") ?? "").trim();
        const audioValue = form.get("audio");
        const audio = audioValue instanceof File ? audioValue : null;
        const durationS = Math.max(0, Math.min(900, Number(form.get("durationS") ?? 0) || 0));

        if (!token || !clientId || !["in", "out"].includes(type) || Number.isNaN(Date.parse(punchedAt))) {
          return jsonError("Dados obrigatórios do ponto estão incompletos.", 400);
        }
        if (!audio || audio.size < 2048) return jsonError("O áudio está vazio. Grave novamente.", 400);
        if (audio.size > MAX_AUDIO_BYTES) return jsonError("O áudio ultrapassa o limite de 14 MB.", 413);
        if (audio.type !== "audio/wav") return jsonError("Formato de áudio inválido. Grave novamente.", 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: employee } = await supabaseAdmin
          .from("employees")
          .select("id")
          .eq("token", token)
          .eq("active", true)
          .maybeSingle();
        if (!employee) return jsonError("Link inválido ou funcionário inativo.", 401);

        const { data: existing } = await supabaseAdmin
          .from("time_punches")
          .select("id")
          .eq("client_id", clientId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, duplicate: true });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return jsonError("A transcrição não está configurada.", 500);
        const transcription = await transcribeAudio(audio, apiKey);
        if (!transcription.ok) return jsonError(transcription.message, transcription.status);

        const justification = typedJustification || transcription.text;
        if (!justification) return jsonError("Não foi possível reconhecer a fala. Digite a justificativa e tente novamente.", 400);

        const audioPath = `${token}/${clientId}.wav`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("time-punch-audio")
          .upload(audioPath, audio, { contentType: "audio/wav", upsert: true });
        if (uploadError) return jsonError(uploadError.message, 500);

        const location = {
          latitude: Number(form.get("latitude")) || null,
          longitude: Number(form.get("longitude")) || null,
          cep: String(form.get("cep") ?? "") || null,
          street: String(form.get("street") ?? "") || null,
          neighborhood: String(form.get("neighborhood") ?? "") || null,
          city: String(form.get("city") ?? "") || null,
        };
        const { error: insertError } = await (supabaseAdmin as any).from("time_punches").insert({
          employee_id: employee.id,
          type,
          punched_at: punchedAt,
          photo_path: null,
          justification,
          justification_audio_path: audioPath,
          justification_audio_transcript: transcription.text || null,
          justification_audio_duration_s: Math.round(durationS),
          client_id: clientId,
          ...location,
        });
        if (insertError) {
          if (insertError.code === "23505") return Response.json({ ok: true, duplicate: true });
          return jsonError(insertError.message, 500);
        }

        return Response.json({ ok: true, transcript: transcription.text });
      },
    },
  },
});