import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateItemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().min(1).max(200),
      category: z.string().max(200).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const subject = [data.name, data.category].filter(Boolean).join(", ");
    const prompt = `A clean product photo of "${subject}". Centered on a plain white background, soft studio lighting, sharp focus, square crop, no text or watermark.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("Muitas requisições, tente em alguns segundos.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione em Settings > Workspace > Usage.");
      throw new Error(`Falha ao gerar imagem: ${res.status} ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const dataUrl: string | undefined =
      json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("A IA não retornou imagem.");

    return { dataUrl };
  });
